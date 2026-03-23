import { initWorker, WorkerInstance } from "yuzuthread";
import {
  NetPlayerType,
  YGOProMsgBase,
  YGOProMsgResponseBase,
  YGOProMsgRetry,
  YGOProStocGameMsg,
  YGOProMsgUpdateCard,
  YGOProMsgUpdateData,
  YGOProMsgWin,
  YGOProMsgWaiting,
} from "ygopro-msg-encode";
import { MayBeArray } from "nfkit";

import { MercuryClient } from "../client/domain/MercuryClient";
import { MercuryRoom } from "../room/domain/MercuryRoom";
import { calculateOcgcoreDeck } from "../utils/calculate-ocgcore-deck";
import { generateSeed } from "../utils/generate-seed";
import { OcgcoreWorker } from "./ocgcore-worker";
import { Logger } from "src/shared/logger/domain/Logger";

const isUpdateMessage = (message: YGOProMsgBase) =>
  message instanceof YGOProMsgUpdateData ||
  message instanceof YGOProMsgUpdateCard;

type Client = MercuryClient;

export class OCGCore {
  private ocgcore: WorkerInstance<OcgcoreWorker> | null;
  private responsePosition: number | null = null;
  private lastResponseRequestMsg: YGOProMsgBase | null = null;
  private isRetrying = false;
  private isPositionSwapped = false;

  constructor(
    private readonly room: MercuryRoom,
    private readonly logger: Logger,
  ) {
    this.ocgcore = null;
  }

  async init(): Promise<void> {
    const extraScriptPaths = [
      "./script/patches/entry.lua",
      "./script/special.lua",
      "./script/init.lua",
      ...this.room.getScriptPaths(),
    ];

    const cardStorage = await this.room.getCardStorage();
    const cardReader = await this.room.getCardReader();
    const ocgcoreWasmBinary = await this.room.ocgCoreBinary();

    const registry: Record<string, string> = {
      duel_mode: this.room.duelMode,
      start_lp: String(this.room.hostInfo.start_lp),
      start_hand: String(this.room.hostInfo.start_hand),
      draw_count: String(this.room.hostInfo.draw_count),
      player_type_0: "0",
      player_type_1: "1",
    };

    this.room.clients.forEach((player, index) => {
      registry[`player_name_${index}`] = player.name;
    });

    const decks = this.room.clients.map((player: MercuryClient) =>
      calculateOcgcoreDeck(player.deck!, this.room.hostInfo, cardReader),
    );

    try {
      this.ocgcore = await initWorker(OcgcoreWorker, {
        seed: generateSeed(),
        hostinfo: this.room.hostInfo,
        ygoproPaths: this.room.getYGOProPaths(),
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
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
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

  // ============================================================
  // Advance - Process duel loop
  // ============================================================

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

  private canAdvance(): boolean {
    // TODO: Check if room is in Dueling state
    return true;
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

    if (message instanceof YGOProMsgUpdateCard) {
      await this.refreshSingleCard({
        player: message.controller,
        location: message.location,
        sequence: message.sequence,
      });
      return;
    }

    const handledMessage = await this.dispatchGameMessage(message);
    if (!handledMessage) {
      // Message blocked by middleware, do not route
      return;
    }

    if (handledMessage instanceof YGOProMsgWin) {
      await this.handleWinCondition(handledMessage);
      return;
    }

    await this.routeGameMsg(handledMessage);
  }

  private async dispatchGameMessage(
    message: YGOProMsgBase,
  ): Promise<YGOProMsgBase | null> {
    // TODO: Implement message dispatch through middleware
    return message;
  }

  private async handleWinCondition(winMessage: YGOProMsgWin): Promise<void> {
    // TODO: Implement win condition handling
    this.logger.debug("handleWinCondition", { winMessage });
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

  private async refreshZone(_location: {
    player: number;
    location: number;
  }): Promise<void> {
    // TODO: Implement zone refresh
    this.logger.debug("refreshZone not implemented yet");
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

  private createEmptyCardData() {
    const emptyCard = {
      flags: 0,
      empty: true,
    };
    return emptyCard;
  }

  // ============================================================
  // Response Timer - Handle player response timeouts
  // ============================================================

  private async sendWaitingToNonOperator(
    ingamePosition: number,
  ): Promise<void> {
    const operatingPlayer = this.getActivePlayer(ingamePosition);
    const nonOperatingPlayers = (this.room.clients as MercuryClient[]).filter(
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

  private async setResponseTimer(position: number): Promise<void> {
    // TODO: Implement response timer with timeout handling
    // - Check if room has time limit enabled
    // - Get remaining time from timer state
    // - Send time limit message to player
    // - Schedule timeout callback
    this.logger.debug("setResponseTimer not fully implemented", { position });
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

  private setLastResponseRequestMsg(message: YGOProMsgBase): void {
    this.lastResponseRequestMsg = message;
  }

  // ============================================================
  // Position helpers - Convert between duel and ingame positions
  // ============================================================

  /**
   * Converts a duel position (0 or 1) to an ingame position.
   * Applies swap logic when positions are swapped (first to play becomes player 2).
   */
  private toIngamePosition(duelPosition: number): number {
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
   * Returns players at the given ingame position (considering swap).
   */
  private getPlayersAtIngamePosition(ingamePosition: number): Client[] {
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
