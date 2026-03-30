import { initWorker, WorkerInstance } from "yuzuthread";
import {
  NetPlayerType,
  YGOProMsgBase,
  YGOProMsgResponseBase,
  YGOProMsgRetry,
  YGOProStocGameMsg,
  YGOProStocTimeLimit,
  YGOProMsgUpdateCard,
  YGOProMsgUpdateData,
  YGOProMsgWin,
  YGOProMsgWaiting,
  YGOProMsgNewTurn,
  YGOProMsgNewPhase,
  YGOProMsgResetTime,
  YGOProMsgReverseDeck,
  YGOProMsgDeckTop,
  YGOProMsgHint,
  OcgcoreCommonConstants,
  RequireQueryLocation,
  YGOProMsgStart,
  OcgcoreScriptConstants,
} from "ygopro-msg-encode";
import { MayBeArray } from "nfkit";

import { MercuryClient } from "../client/domain/MercuryClient";
import { YGOProRoom } from "../room/domain/YGOProRoom";
import { OcgcoreWorker } from "./ocgcore-worker";
import { Logger } from "src/shared/logger/domain/Logger";
import { GameMessageMiddleware } from "../middleware/GameMessageMiddleware";
import {
  canIncreaseTime,
  getMessageIdentifier,
} from "../utils/response-time-utils";
import { TimerState } from "../room/domain/TimerState";
import { YGOProResourceLoader } from "@ygopro/ygopro";
import YGOProDeck from "ygopro-deck-encode";
import { shuffleDecksBySeed } from "@ygopro/utils/shuffle-decks-by-seed";
import { generateSeed } from "@ygopro/utils/generate-seed";
import { DuelRecord } from "@ygopro/room/domain/DuelRecord";
import { calculateOcgcoreDeck } from "@ygopro/utils/calculate-ocgcore-deck";

const isUpdateMessage = (message: YGOProMsgBase) =>
  message instanceof YGOProMsgUpdateData ||
  message instanceof YGOProMsgUpdateCard;

type Client = MercuryClient;

export class OCGCore {
  private ocgcore: WorkerInstance<OcgcoreWorker> | null;
  private responsePosition: number | null = null;
  private lastResponseRequestMsg: YGOProMsgBase | null = null;
  private _phase: number | null = null;
  private isRetrying = false;
  private _deckReversed = false;

  // Timer state
  private timerState = new TimerState();
  private get hasTimeLimit(): boolean {
    return this.room.hostInfo.time_limit > 0;
  }

  // Message middleware (public for external handlers)
  private _gameMiddleware = new GameMessageMiddleware();

  /**
   * Public access to game message middleware
   * External handlers can register to process game messages
   */
  get messageMiddleware(): GameMessageMiddleware {
    return this._gameMiddleware;
  }

  constructor(
    private readonly room: YGOProRoom,
    private readonly logger: Logger,
  ) {
    this.ocgcore = null;
    this.registerMiddlewares();
  }

  /**
   * Register all game message middlewares
   */
  private registerMiddlewares(): void {
    // Log all game messages (except updates)
    // Record messages for replay
    this._gameMiddleware.on(YGOProMsgBase, (msg) => {
      if (!(msg instanceof YGOProMsgRetry)) {
        this.room.saveMessageToDuelRecord(msg);
      }
      return msg;
    });

    // Handle new turn - reset timers to full like srvpro2's onNewTurn
    this._gameMiddleware.on(YGOProMsgNewTurn, (msg) => {
      this.room.increaseTurn();
      if (this.hasTimeLimit) {
        const recoverMs = Math.max(0, this.room.hostInfo.time_limit) * 1000;
        for (const player of [0, 1] as const) {
          this.timerState.leftMs[player] = recoverMs;
          this.timerState.compensatorMs[player] = recoverMs;
          this.timerState.backedMs[player] = recoverMs;
        }
      }
      return msg;
    });

    // Handle new phase
    this._gameMiddleware.on(YGOProMsgNewPhase, (msg) => {
      this._phase = msg.phase;
      return msg;
    });

    // Track deck reversal
    this._gameMiddleware.on(YGOProMsgReverseDeck, (msg) => {
      this._deckReversed = !this._deckReversed;
      return msg;
    });

    // Handle reset time - just return msg
    this._gameMiddleware.on(YGOProMsgResetTime, (msg) => {
      return msg;
    });

    // Handle retry - just return msg
    this._gameMiddleware.on(YGOProMsgRetry, (msg) => {
      return msg;
    });

    // Handle win - just return msg
    this._gameMiddleware.on(YGOProMsgWin, (msg) => {
      return msg;
    });
  }

  async init(): Promise<DuelRecord> {
    const duelRecord = this.generateDuelRecord();

    const extraScriptPaths = [
      "./script/patches/entry.lua",
      "./script/special.lua",
      "./script/init.lua",
      ...YGOProResourceLoader.get().extraScriptPaths,
    ];

    const cardStorage = await YGOProResourceLoader.get().getCardStorage();
    const ocgcoreWasmBinary = await YGOProResourceLoader.get().getOcgcoreWasmBinary();

    const registry: Record<string, string> = {
      duel_mode: this.room.duelMode,
      start_lp: String(this.room.hostInfo.start_lp),
      start_hand: String(this.room.hostInfo.start_hand),
      draw_count: String(this.room.hostInfo.draw_count),
      player_type_0: this.room.isPositionSwapped ? "1" : "0",
      player_type_1: this.room.isPositionSwapped ? "0" : "1",
    };

    duelRecord.players.forEach((player, index) => {
      registry[`player_name_${index}`] = player.name;
    });

    const cardReader = await YGOProResourceLoader.get().getCardReader()

    const decks = duelRecord
      .toSwappedPlayers()
      .map((player) => calculateOcgcoreDeck(player.deck, this.room.hostInfo, cardReader));

    console.log("YGOProResourceLoader.get().ygoproPaths", YGOProResourceLoader.get().ygoproPaths)
    console.log("YGOProResourceLoader.get().extraScriptPaths", extraScriptPaths)
    try {
      this.ocgcore = await initWorker(OcgcoreWorker, {
        seed: duelRecord.seed,
        hostinfo: this.room.hostInfo,
        ygoproPaths: YGOProResourceLoader.get().ygoproPaths,
        extraScriptPaths,
        cardStorage,
        ocgcoreWasmBinary,
        registry,
        decks,
      });

      this.ocgcore.message$.subscribe((msg) => {
        this.logger.info("Received message from OCGCoreWorker");
        this.logger.info({ message: msg.message, type: msg.type });
      });

      return duelRecord;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  private generateDuelRecord(): DuelRecord {
    const seed = generateSeed();
    const players = this.generatePlayers(seed);
    return new DuelRecord(seed, players, this.room.isPositionSwapped);
  }

  private generatePlayers(seed: number[]): { name: string; deck: YGOProDeck }[] {
    const decks = this.room.players.map((_client: MercuryClient) => {
      const deck = _client.deck!;
      const ygoproDeck = new YGOProDeck({
        main: deck.main.map((card) => parseInt(card.code, 10)),
        side: deck.side.map((card) => parseInt(card.code, 10)),
        extra: deck.extra.map((card) => parseInt(card.code, 10)),
      });
      return ygoproDeck;
    });

    const shuffledDecks = this.room.shuffleDeckEnabled
      ? shuffleDecksBySeed(decks, seed)
      : decks;

    const players = this.room.players.map(
      (_client: MercuryClient, index: number) => ({
        name: _client.name,
        deck: shuffledDecks[index]!,
      }),
    );

    return players;
  }

  async queryFieldCount({
    team,
    location,
  }: {
    team: number;
    location: number;
  }): Promise<number> {
    return this.ocgcore!.queryFieldCount({ player: team, location });
  }

  // Public accessors for MercuryDuelingState
  get currentResponsePosition(): number | null {
    return this.responsePosition;
  }

  get timeLimitEnabled(): boolean {
    return this.hasTimeLimit;
  }

  get timerLeftMs(): [number, number] {
    return this.timerState.leftMs;
  }

  hasOcgcore(): boolean {
    return this.ocgcore !== null;
  }

  get currentLastResponseRequestMsg(): YGOProMsgBase | null {
    return this.lastResponseRequestMsg;
  }

  get isRetryingState(): boolean {
    return this.isRetrying;
  }

  get responsePlayer(): Client | null {
    if (this.responsePosition === null) {
      return null;
    }
    const ingamePos = this.toIngamePosition(this.responsePosition);
    return this.getActivePlayer(ingamePos);
  }

  clearResponseTimerState(settlePrevious: boolean): void {
    this.clearResponseTimer(settlePrevious);
  }

  clearResponseRequestState(): void {
    this.lastResponseRequestMsg = null;
    this.isRetrying = false;
  }

  async dispose(): Promise<void> {
    await this.ocgcore?.dispose()
      .catch((_error) => this.logger.error(`Error disposing ocgcore`))
  }

  resetResponseRequestState(): void {
    const initialTime = this.hasTimeLimit
      ? Math.max(0, this.room.hostInfo.time_limit) * 1000
      : 0;
    this.timerState.reset(initialTime);
    this.lastResponseRequestMsg = null;
    this.isRetrying = false;
  }

  increaseResponseTime(
    originalDuelPos: number,
    gameMsg: number,
    response?: Buffer,
  ): void {
    const maxTimeMs = Math.max(0, this.room.hostInfo.time_limit || 0) * 1000;
    if (
      !this.hasTimeLimit ||
      ![0, 1].includes(originalDuelPos) ||
      this.timerState.backedMs[originalDuelPos] <= 0 ||
      this.timerState.leftMs[originalDuelPos] >= maxTimeMs ||
      !canIncreaseTime(gameMsg, response)
    ) {
      return;
    }
    this.timerState.leftMs[originalDuelPos] = Math.min(
      maxTimeMs,
      this.timerState.leftMs[originalDuelPos] + 1000,
    );
    this.timerState.compensatorMs[originalDuelPos] += 1000;
    this.timerState.backedMs[originalDuelPos] -= 1000;
  }

  async setResponse(responseBuffer: Buffer): Promise<void> {
    if (!this.ocgcore) {
      throw new Error("OCGCore not initialized");
    }
    await this.ocgcore.setResponse(responseBuffer);
  }

  async advance(): Promise<void> {
    if (!this.canAdvance()) {
      return;
    }

    try {
      for await (const advanceResult of this.ocgcore!.advance()) {
        if (!this.canAdvance()) {
          // Duel ended, stop processing
          return;
        }

        await this.handleAdvanceResult(advanceResult);
      }
    } catch (error) {
      await this.handleAdvanceError(error);
    }
  }

  sendStartMessageForReconnect(client: MercuryClient): void {
    const playerType = this.getIngamePosition(client);
    const startMessage = new YGOProStocGameMsg().fromPartial({
      msg: new YGOProMsgStart().fromPartial({
        playerType,
        duelRule: this.room.hostInfo.duel_rule,
        startLp0: this.room.hostInfo.start_lp,
        startLp1: this.room.hostInfo.start_lp,
        player0: {
          deckCount: 0,
          extraCount: 0,
        },
        player1: {
          deckCount: 0,
          extraCount: 0,
        },
      }),
    });
    client.sendMessageToClient(Buffer.from(startMessage.toFullPayload()));
  }

  sendTurnMessages(client: MercuryClient): void {
    const rawTurnCount = Math.max(1, this.room.turn || 0);
    if (this.room.isTag) {
      const turnCount = rawTurnCount % 4 || 4;
      for (let index = 0; index < turnCount; index += 1) {
        const message = new YGOProStocGameMsg().fromPartial({
          msg: new YGOProMsgNewTurn().fromPartial({
            player: index % 2,
          }),
        });
        client.sendMessageToClient(Buffer.from(message.toFullPayload()));
      }

      return;
    }

    const turnCount = rawTurnCount % 2 === 0 ? 2 : 1;
    for (let index = 0; index < turnCount; index += 1) {
      const message = new YGOProStocGameMsg().fromPartial({
        msg: new YGOProMsgNewTurn().fromPartial({
          player: index,
        }),
      });
      client.sendMessageToClient(Buffer.from(message.toFullPayload()));
    }
  }

  sendPhaseMessage(client: MercuryClient): void {
    if (this._phase === null) {
      return;
    }

    const message = new YGOProStocGameMsg().fromPartial({
      msg: new YGOProMsgNewPhase().fromPartial({
        phase: this._phase,
      }),
    });

    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  async sendRequestFieldMessage(client: MercuryClient): Promise<void> {
    if (!this.ocgcore) {
      return;
    }
    const info = await this.ocgcore.queryFieldInfo();
    const message = new YGOProStocGameMsg().fromPartial({
      msg: info.field,
    });
    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  async sendRefreshZonesMessages(client: MercuryClient) {
    const queryFlag = 0xefffff;
    const selfIngamePos = this.getIngamePosition(client);
    const opponentIngamePos = 1 - selfIngamePos;

    const locations = [
      OcgcoreScriptConstants.LOCATION_MZONE,
      OcgcoreScriptConstants.LOCATION_SZONE,
      OcgcoreScriptConstants.LOCATION_HAND,
      OcgcoreScriptConstants.LOCATION_GRAVE,
      OcgcoreScriptConstants.LOCATION_EXTRA,
      OcgcoreScriptConstants.LOCATION_REMOVED,
    ];
    const players = [opponentIngamePos, selfIngamePos];

    for (const location of locations) {
      for (const player of players) {
        await this.refreshZones(
          { player, location },
          { queryFlag, sendToClient: client, useCache: 0 },
        );
      }
    }
  }

  async sendDeckReversedAndTopMessages(client: MercuryClient): Promise<void> {
    if (!this.ocgcore) {
      return;
    }

    if (this._deckReversed) {
      const msg = new YGOProMsgReverseDeck();
      client.sendMessageToClient(
        Buffer.from(
          new YGOProStocGameMsg().fromPartial({ msg }).toFullPayload(),
        ),
      );
    }

    for (const playerPosition of [0, 1]) {
      await this.sendDeckTopMessage(client, playerPosition);
    }
  }

  private async sendDeckTopMessage(
    client: MercuryClient,
    playerPosition: number,
  ): Promise<void> {
    if (!this.ocgcore) {
      return;
    }

    const DECK_TOP_QUERY_FLAGS =
      OcgcoreCommonConstants.QUERY_CODE | OcgcoreCommonConstants.QUERY_POSITION;

    const deckQuery = await this.ocgcore.queryFieldCard({
      player: playerPosition,
      location: OcgcoreScriptConstants.LOCATION_DECK,
      queryFlag: DECK_TOP_QUERY_FLAGS,
      useCache: 0,
    });

    const cards = (deckQuery.cards ?? []) as Array<{
      code: number;
      position: number;
    }>;
    const topCard = cards[cards.length - 1];

    if (!topCard) {
      return;
    }

    const isFaceUp =
      (topCard.position & OcgcoreCommonConstants.POS_FACEUP) !== 0;
    const shouldSendDeckTop = this._deckReversed || isFaceUp;

    if (!shouldSendDeckTop) {
      return;
    }

    const FACE_UP_CODE_FLAG = 0x80000000;
    const code = isFaceUp ? topCard.code | FACE_UP_CODE_FLAG : topCard.code;

    const msg = new YGOProMsgDeckTop().fromPartial({
      player: playerPosition,
      sequence: 0,
      code,
    });
    client.sendMessageToClient(
      Buffer.from(new YGOProStocGameMsg().fromPartial({ msg }).toFullPayload()),
    );
  }

  async sendReconnectTimeLimitAndResponseState(
    client: MercuryClient,
  ): Promise<void> {
    const clientDuelPos = client.position;
    const opponentDuelPos = 1 - clientDuelPos;

    await this.sendTimeLimitMessage(opponentDuelPos, client);

    if (client === this.responsePlayer) {
      await this.sendLastHintToClient(client);
      await this.resendResponseRequestToClient(client);
    } else {
      await this.sendWaitingAndTimeLimitToClient(client);
    }
  }

  private async sendLastHintToClient(client: MercuryClient): Promise<void> {
    const lastHint = this.findLastHintForClient(client);
    if (!lastHint) {
      return;
    }

    const msg = new YGOProStocGameMsg().fromPartial({ msg: lastHint });
    client.sendMessageToClient(Buffer.from(msg.toFullPayload()));
  }

  private async resendResponseRequestToClient(
    client: MercuryClient,
  ): Promise<void> {
    if (!this.lastResponseRequestMsg) {
      return;
    }

    const ingamePos = this.getIngamePosition(client);
    const playerView = this.lastResponseRequestMsg.playerView(ingamePos);
    const msg = new YGOProStocGameMsg().fromPartial({ msg: playerView });
    client.sendMessageToClient(Buffer.from(msg.toFullPayload()));

    await this.setResponseTimer(client.position);
  }

  private async sendWaitingAndTimeLimitToClient(
    client: MercuryClient,
  ): Promise<void> {
    const waitingMsg = new YGOProStocGameMsg().fromPartial({
      msg: new YGOProMsgWaiting(),
    });
    client.sendMessageToClient(Buffer.from(waitingMsg.toFullPayload()));

    await this.sendTimeLimitMessage(client.position, client);
  }

  private findLastHintForClient(client: MercuryClient): YGOProMsgHint | null {
    const record = this.room.currentDuelRecord;
    if (!record) {
      return null;
    }

    const clientIngamePos = this.getIngamePosition(client);

    for (let i = record.messages.length - 1; i >= 0; i -= 1) {
      const message = record.messages[i];
      if (!(message instanceof YGOProMsgHint)) {
        continue;
      }
      try {
        const targets = message.getSendTargets();
        if (targets.includes(clientIngamePos)) {
          return message.playerView(clientIngamePos) as YGOProMsgHint;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private canAdvance(): boolean {
    return !!this.ocgcore;
  }

  private async handleAdvanceResult(advanceResult: {
    status?: number;
    message?: YGOProMsgBase;
    encodeError?: unknown;
  }): Promise<void> {
    const { status, message, encodeError } = advanceResult;

    if (encodeError) {
      this.logger.error("Failed to decode game message in worker transport", {
        encodeError,
        status,
      });
    }

    if (!message) {
      this.logger.info("Received empty message from ocgcore", { status });
      if (status) {
        throw new Error(
          "Cannot continue ocgcore because received empty message with non-advancing status " +
          status,
        );
      }
      return;
    }

    // Process message through middleware
    const processedMessage = await this._gameMiddleware.process(message);

    if (processedMessage === null) {
      // Message blocked by middleware
      this.logger.debug("Message blocked by middleware");
      return;
    }

    if (processedMessage instanceof YGOProMsgUpdateCard) {
      await this.refreshSingleCard({
        player: processedMessage.controller,
        location: processedMessage.location,
        sequence: processedMessage.sequence,
      });
      return;
    }

    if (processedMessage instanceof YGOProMsgWin) {
      await this.ocgcore?.dispose();
      return;
    }

    await this.routeGameMsg(processedMessage);
  }

  private async dispatchGameMessage(
    message: YGOProMsgBase,
    options: { sendToClient?: MayBeArray<Client>; route?: boolean } = {},
  ): Promise<YGOProMsgBase | null> {
    if (options?.route && message) {
      await this.routeGameMsg(message, {
        sendToClient: options?.sendToClient,
      });
    }

    return message;
  }

  private async handleAdvanceError(error: unknown): Promise<void> {
    // TODO: Check if timeout error using OcgcoreProcessTimeoutError.is(error)
    this.logger.info("Error while advancing ocgcore", { error });

    const drawGame = new YGOProMsgWin().fromPartial({
      type: 0x11,
      player: 2,
    });

    // TODO: Send chat message "#draw_due_to_error" with error color
    await this.routeGameMsg(drawGame);
  }

  // ============================================================
  // Route Game Msg - Entry point
  // ============================================================

  async routeGameMsg(
    message: YGOProMsgBase,
    options: { sendToClient?: MayBeArray<Client> } = {},
  ): Promise<void> {
    if (!message) {
      return;
    }

    const shouldRefreshFirst =
      message instanceof YGOProMsgResponseBase && !isUpdateMessage(message);
    if (shouldRefreshFirst) {
      await this.refreshForMessage(message);
    }

    const sendToClients = options.sendToClient
      ? new Set(
        Array.isArray(options.sendToClient)
          ? options.sendToClient
          : [options.sendToClient],
      )
      : undefined;

    await this.deliverToTargets(message, sendToClients);

    if (!isUpdateMessage(message) && !shouldRefreshFirst) {
      await this.refreshForMessage(message);
    }

    await this.handleResponseOrRetry(message);
  }

  // ============================================================
  // Refresh - Field state updates
  // ============================================================

  private async refreshForMessage(message: YGOProMsgBase): Promise<void> {
    // Refresh cards that need updating based on message type
    const cardsToRefresh = message.getRequireRefreshCards?.() ?? [];
    const zonesToRefresh = message.getRequireRefreshZones?.() ?? [];

    const refreshCardPromises = cardsToRefresh.map((location) =>
      this.refreshSingleCard({
        player: location.player,
        location: location.location,
        sequence: location.sequence,
      }),
    );

    const refreshZonePromises = zonesToRefresh.map((location) =>
      this.refreshZone(location),
    );

    await Promise.all([...refreshCardPromises, ...refreshZonePromises]);
  }

  private async refreshSingleCard(request: {
    player: number;
    location: number;
    sequence: number;
  }): Promise<void> {
    if (!this.ocgcore) {
      return;
    }

    const locations = this.splitRefreshLocations(request.location);
    for (const location of locations) {
      const queryResult = await this.ocgcore.queryCard({
        player: request.player,
        location,
        sequence: request.sequence,
        queryFlag: 0xf81fff,
        useCache: 0,
      });

      const cardData = queryResult.card;

      await this.routeGameMsg(
        new YGOProMsgUpdateCard().fromPartial({
          controller: request.player,
          location,
          sequence: request.sequence,
          card: cardData as never,
        }),
      );
    }
  }

  private async refreshZone(request: {
    player: number;
    location: number;
  }): Promise<void> {
    if (!this.ocgcore) {
      return;
    }

    const locations = this.splitRefreshLocations(request.location);
    for (const location of locations) {
      const queryResult = await this.ocgcore.queryFieldCard({
        player: request.player,
        location,
        queryFlag: this.getZoneQueryFlag(location),
        useCache: 1,
      });

      const cards = queryResult.cards ?? [];

      await this.routeGameMsg(
        new YGOProMsgUpdateData().fromPartial({
          player: request.player,
          location,
          cards: cards as never[],
        }),
      );
    }
  }

  async refreshZones(
    zone: RequireQueryLocation,
    options: {
      queryFlag?: number;
      sendToClient?: MayBeArray<Client>;
      useCache?: number;
    } = {},
  ): Promise<void> {
    if (!this.ocgcore) {
      return;
    }

    const locations = this.splitRefreshLocations(zone.location);
    for (const location of locations) {
      const { cards } = await this.ocgcore.queryFieldCard({
        player: zone.player,
        location,
        queryFlag: options.queryFlag ?? this.getZoneQueryFlag(location),
        useCache: options.useCache ?? 1,
      });
      const updateDateMessage = new YGOProMsgUpdateData().fromPartial({
        player: zone.player,
        location,
        cards: cards ?? [],
      });
      await this.dispatchGameMessage(updateDateMessage, {
        sendToClient: options.sendToClient,
        route: true,
      });
    }
  }

  private getZoneQueryFlag(location: number): number {
    // Returns query flag for specific zone locations
    switch (location) {
      case 0x0080: // MZONE
        return 0x881fff;
      case 0x0100: // SZONE
      case 0x1000: // EXTRA
        return 0xe81fff;
      case 0x0200: // HAND
        return 0x681fff;
      case 0x0400: // GRAVE
      case 0x0800: // REMOVED
        return 0x081fff;
      default:
        return 0xf81fff;
    }
  }

  private splitRefreshLocations(location: number): number[] {
    // Split location flags into individual locations
    const locationFlags = [
      0x0080, // MZONE
      0x0100, // SZONE
      0x0200, // HAND
      0x0400, // GRAVE
      0x0800, // REMOVED
      0x1000, // EXTRA
      0x2000, // DECK
      0x4000, // OVERLAY
      0x8000, // FZONE
      0x10000, // PZONE
    ];

    const locations = locationFlags.filter((flag) => (location & flag) !== 0);
    return locations.length > 0 ? locations : [location];
  }

  // ============================================================
  // Response Timer - Handle player response timeouts
  // ============================================================

  private async sendWaitingToNonOperator(
    ingamePosition: number,
  ): Promise<void> {
    const operatingPlayer = this.getActivePlayer(ingamePosition);
    const nonOperatingPlayers = (this.room.players as MercuryClient[]).filter(
      (client) => client !== operatingPlayer,
    );

    const waitingMessage = new YGOProStocGameMsg().fromPartial({
      msg: new YGOProMsgWaiting(),
    });

    await Promise.all(
      nonOperatingPlayers.map((client) =>
        client.sendMessageToClient(Buffer.from(waitingMessage.toFullPayload())),
      ),
    );
  }

  private async setResponseTimer(
    originalDuelPos: number,
    options: {
      settlePrevious?: boolean;
      sendTimeLimit?: boolean;
      awaitingConfirm?: boolean;
    } = {},
  ): Promise<void> {
    const {
      settlePrevious = true,
      sendTimeLimit = true,
      awaitingConfirm = true,
    } = options;
    this.clearResponseTimer(settlePrevious);
    if (!this.hasTimeLimit || ![0, 1].includes(originalDuelPos)) {
      return;
    }
    const leftTime = Math.max(0, this.timerState.leftMs[originalDuelPos] || 0);
    if (sendTimeLimit) {
      await this.sendTimeLimitMessage(originalDuelPos);
    }
    if (leftTime <= 0) {
      await this.handleResponseTimeout(originalDuelPos);
      return;
    }
    this.timerState.schedule(originalDuelPos, leftTime, awaitingConfirm, () => {
      void this.handleResponseTimeout(originalDuelPos).catch((error) => {
        this.logger.error("Failed to handle response timeout", { error });
      });
    });
  }

  private clearResponseTimer(settleElapsed = false): void {
    this.timerState.clear(settleElapsed);
  }

  async sendTimeLimitMessage(
    originalDuelPos: number,
    toSpecificClient?: Client,
  ): Promise<void> {
    if (!this.hasTimeLimit || ![0, 1].includes(originalDuelPos)) {
      return;
    }
    const leftTime = Math.max(0, this.timerState.leftMs[originalDuelPos] || 0);
    const ingameDuelPos = this.toIngamePosition(originalDuelPos);
    const timeLimitMessage = new YGOProStocTimeLimit().fromPartial({
      player: ingameDuelPos,
      left_time: Math.ceil(leftTime / 1000),
    });

    const allPlayers = [
      ...this.room.getTeamPlayers(0),
      ...this.room.getTeamPlayers(1),
    ];
    await Promise.all(
      allPlayers
        .filter((p) => !toSpecificClient || p === toSpecificClient)
        .map((client) =>
          client.sendMessageToClient(
            Buffer.from(timeLimitMessage.toFullPayload()),
          ),
        ),
    );
  }

  private async handleResponseTimeout(originalDuelPos: number): Promise<void> {
    if (this.timerState.runningPos !== originalDuelPos) {
      return;
    }
    this.clearResponseTimer(false);
    this.timerState.leftMs[originalDuelPos] = 0;
    this.responsePosition = null;
    this.logger.info("Response timeout", { originalDuelPos });

    const winnerOriginalDuelPos = 1 - originalDuelPos;
    const winnerIngamePos = this.toIngamePosition(winnerOriginalDuelPos);
    this.room.emitRoomEvent("DUEL_END", {} as any, null as any);
    // TODO: Integrate with proper win() logic when available
    this.logger.info("Timeout win", { winner: winnerIngamePos });
  }

  // ============================================================
  // Delivery - Send messages to clients
  // ============================================================

  private async deliverToTargets(
    message: YGOProMsgBase,
    sendToClients?: Set<Client>,
  ): Promise<void> {
    const targetPositions = message.getSendTargets();
    const sendGameMessage = (client: Client, msg: YGOProMsgBase) =>
      client.sendMessageToClient(
        Buffer.from(
          new YGOProStocGameMsg().fromPartial({ msg }).toFullPayload(),
        ),
      );

    await Promise.all(
      targetPositions.map(async (position) => {
        if (position === NetPlayerType.OBSERVER) {
          const observerView = message.observerView();
          const watchers = this.room.spectators as MercuryClient[];
          await Promise.all(
            watchers.map((watcher) => sendGameMessage(watcher, observerView)),
          );
        } else {
          const players = this.getPlayersAtIngamePosition(position);
          await Promise.all(
            players.map(async (client) => {
              if (sendToClients && !sendToClients.has(client)) {
                return;
              }
              const ingamePosition = this.getIngamePosition(client);
              const playerView = message.playerView(ingamePosition);
              const activePlayer = this.getActivePlayer(ingamePosition);
              if (
                message instanceof YGOProMsgResponseBase &&
                client !== activePlayer
              ) {
                return;
              }
              return sendGameMessage(
                client,
                client === activePlayer
                  ? playerView
                  : playerView.teammateView(),
              );
            }),
          );
        }
      }),
    );
  }

  // ============================================================
  // Response handling - Response messages and retry logic
  // ============================================================

  private async handleResponseOrRetry(message: YGOProMsgBase): Promise<void> {
    if (message instanceof YGOProMsgResponseBase) {
      this.setLastResponseRequestMsg(message);
      await this.sendWaitingToNonOperator(message.responsePlayer());
      await this.setResponseTimer(this.responsePosition!);
      return;
    }
    if (message instanceof YGOProMsgRetry && this.responsePosition != null) {
      const record = this.room.currentDuelRecord;
      if (record && record.responses.length > 0) {
        record.responses.pop();
      }
      this.isRetrying = true;
      await this.sendWaitingToNonOperator(
        this.toIngamePosition(this.responsePosition),
      );
      await this.setResponseTimer(this.responsePosition);
      return;
    }
    if (
      this.responsePosition != null &&
      !this.lastResponseRequestMsg &&
      !(message instanceof YGOProMsgResponseBase)
    ) {
      this.responsePosition = null;
    }
  }

  private setLastResponseRequestMsg(message: YGOProMsgResponseBase): void {
    this.lastResponseRequestMsg = message;
    this.isRetrying = false;
    this.responsePosition = this.toIngamePosition(message.responsePlayer());
  }

  // ============================================================
  // Position helpers - Convert between duel and ingame positions
  // ============================================================

  /**
   * Converts a duel position (0 or 1) to an ingame position.
   * Applies swap logic when positions are swapped (first to play becomes player 2).
   */
  toIngamePosition(duelPosition: number): number {
    if (!this.isValidDuelPosition(duelPosition)) {
      return duelPosition;
    }
    return this.room.isPositionSwapped ? 1 - duelPosition : duelPosition;
  }

  private isValidDuelPosition(position: number): boolean {
    return position === 0 || position === 1;
  }
  // ============================================================
  // Player queries - Get players at specific positions
  // ============================================================

  /**
   * Returns players at given ingame position (considering swap).
   */
  getPlayersAtIngamePosition(ingamePosition: number): Client[] {
    const duelPosition = this.toIngamePosition(ingamePosition);
    return this.room.getTeamPlayers(duelPosition);
  }

  /**
   * Returns the ingame position for a client (applies swap if needed).
   */
  private getIngamePosition(client: Client): number {
    return this.toIngamePosition(client.position);
  }

  /**
   * Returns the active player (who must respond) at the given position.
   */
  private getActivePlayer(ingamePosition: number): Client | null {
    const players = this.getPlayersAtIngamePosition(ingamePosition);
    return players[0] ?? null;
  }
}
