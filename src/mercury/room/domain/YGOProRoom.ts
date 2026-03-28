import { EventEmitter } from "stream";

import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { Team } from "@shared/room/Team";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { Logger } from "@shared/logger/domain/Logger";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { RoomType } from "@shared/room/domain/RoomType";

import { generateSeed } from "@ygopro/utils/generate-seed";
import { shuffleDecksBySeed } from "@ygopro/utils/shuffle-decks-by-seed";
import { calculateOcgcoreDeck } from "@ygopro/utils/calculate-ocgcore-deck";

import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/MercuryBanListMemoryRepository";
import { MercuryClient } from "../../client/domain/MercuryClient";
import {
  formatRuleMappings,
  priorityRuleMappings,
  ruleMappings,
} from "./RuleMappings";
import { MercuryChoosingOrderState } from "./states/MercuryChoosingOrderState";
import { MercuryDuelingState } from "./states/MercuryDuelingState";
import { MercuryRockPaperScissorState } from "./states/MercuryRockPaperScissorsState";
import { MercurySideDeckingState } from "./states/MercurySideDeckingState";
import { MercuryWaitingState } from "./states/MercuryWaitingState";
import { YGOProResourceLoader } from "../../ygopro/YGOProResourceLoader";
import { HostInfo } from "./host-info/HostInfo";

import {
  GameMode,
  NetPlayerType,
  PlayerChangeState,
  YGOProMsgBase,
  YGOProStocDeckCount,
  YGOProStocDeckCount_DeckInfo,
  YGOProStocHsPlayerChange,
  YGOProStocHsPlayerEnter,
  YGOProStocHsWatchChange,
  YGOProStocJoinGame,
  YGOProStocTypeChange,
} from "ygopro-msg-encode";
import { YGOProYrp } from 'ygopro-yrp-encode';
import { ISocket } from "src/shared/socket/domain/ISocket";
import YGOProDeck from "ygopro-deck-encode";
import { DuelRecord } from "./DuelRecord";


const BEST_OF = {
  [GameMode.SINGLE]: 1,
  [GameMode.MATCH]: 3,
  [GameMode.TAG]: 1,
};

export class YGOProRoom extends YgoRoom {
  readonly name: string;
  readonly password: string;
  readonly createdBySocketId: string;
  private _logger: Logger;
  private _banListHash: number;
  private _edoBanListHash: number;
  private roomState: RoomState | null = null;
  private _isPositionSwapped: boolean = false;
  private _duelRecords: DuelRecord[] = [];
  private _currentDuelRecord: DuelRecord;
  private readonly _hostInfo: HostInfo;
  private readonly _resourceLoader: YGOProResourceLoader;

  private constructor({
    id,
    name,
    password = "",
    hostInfo,
    team0,
    team1,
    ranked,
    createdBySocketId,
    bestOf,
    startLp,
  }: {
    id: number;
    password: string;
    name: string;
    hostInfo: HostInfo;
    team0: number;
    team1: number;
    ranked: boolean;
    createdBySocketId: string;
    bestOf: number;
    startLp: number;
  }) {
    super({
      team0,
      team1,
      ranked,
      bestOf,
      startLp,
      id,
      notes: "",
      roomType: RoomType.MERCURY,
    });
    this.name = name;
    this.password = password;
    this._players = [];
    this._hostInfo = hostInfo;
    this._state = DuelState.WAITING;
    this._banListHash = 0;
    this.createdBySocketId = createdBySocketId;
    this._resourceLoader = YGOProResourceLoader.getShared();
  }

  static create(
    id: number,
    command: string,
    logger: Logger,
    emitter: EventEmitter,
    playerInfo: PlayerInfoMessage,
    createdBySocketId: string,
  ): YGOProRoom {
    let hostInfo: HostInfo = {
      lflist: MercuryBanListMemoryRepository.getFirstTCGIndex(),
      rule: 1,
      mode: GameMode.SINGLE,
      duel_rule: 5,
      no_check_deck: 0,
      no_shuffle_deck: 0,
      start_lp: 8000,
      start_hand: 5,
      draw_count: 1,
      time_limit: 180,
      max_deck_points: 100,
      best_of: BEST_OF[GameMode.SINGLE],
    };

    const [configuration, password] = command.split("#");
    const options = configuration
      .toLowerCase()
      .split(",")
      .map((_) => _.trim());

    const mappingKeys = Object.keys(ruleMappings);
    const formatMappingKeys = Object.keys(formatRuleMappings);
    const priorityMappingKeys = Object.keys(priorityRuleMappings);
    const mappings = mappingKeys.map((key) => ruleMappings[key]);
    const formatMappings = formatMappingKeys.map(
      (key) => formatRuleMappings[key],
    );
    const priorityMappings = priorityMappingKeys.map(
      (key) => priorityRuleMappings[key],
    );

    options.forEach((option) => {
      const items = mappings.filter((item) => item.validate(option));
      if (items.length > 1) {
        throw new Error(`Error: param match with two rules.`);
      }

      const mapping = items.shift();
      if (mapping) {
        const rule = mapping.get(option);
        hostInfo = { ...hostInfo, ...rule };
      }
    });

    options.forEach((option) => {
      const items = formatMappings.filter((item) => item.validate(option));
      if (items.length > 1) {
        throw new Error(`Error: param match with two rules.`);
      }
      const mapping = items.shift();
      if (mapping) {
        const rule = mapping.get(option);
        hostInfo = { ...hostInfo, ...rule };
      }
    });

    options.forEach((option) => {
      const items = priorityMappings.filter((item) => item.validate(option));
      if (items.length > 1) {
        throw new Error(`Error: param match with two rules.`);
      }
      const mapping = items.shift();
      if (mapping) {
        const rule = mapping.get(option);
        hostInfo = { ...hostInfo, ...rule };
      }
    });

    const teamCount = hostInfo.mode === GameMode.TAG ? 2 : 1;
    const ranked = Boolean(playerInfo.password);
    const room = new YGOProRoom({
      id,
      hostInfo,
      name: command,
      password,
      team0: teamCount,
      team1: teamCount,
      ranked,
      createdBySocketId,
      bestOf: hostInfo.best_of,
      startLp: hostInfo.start_lp,
    });

    room._logger = logger.child({ file: "MercuryRoom" });
    room.emitter = emitter;

    return room;
  }

  get isTag() {
    return (this.hostInfo.mode & 0x2) !== 0;
  }

  get mode() {
    return this.hostInfo.mode > 2 ? (this.isTag ? 2 : 1) : this.hostInfo.mode;
  }

  getTeam(position: number): number {
    if (position === NetPlayerType.OBSERVER) {
      return -1;
    }

    return (position & (0x1 << this.teamOffsetBit)) >>> this.teamOffsetBit;
  }

  getTeamPlayers(team: number): MercuryClient[] {
    return this.players.filter(
      (client) => this.getTeam(client.position) === team,
    ) as MercuryClient[];
  }

  get isMatch(): boolean {
    return this.bestOf > 1;
  }

  get duelMode(): string {
    return this.isTag ? "tag" : this.isMatch ? "match" : "single";
  }

  get shuffleDeckEnabled(): boolean {
    return !this.hostInfo.no_shuffle_deck;
  }

  getYGOProPaths(): string[] {
    return this._resourceLoader.ygoproPaths;
  }

  getScriptPaths(): string[] {
    return this._resourceLoader.extraScriptPaths;
  }

  setPositionSwapped(value: boolean): void {
    this._isPositionSwapped = value;
  }

  get isPositionSwapped(): boolean {
    return this._isPositionSwapped;
  }

  get hostInfo(): HostInfo {
    return this._hostInfo;
  }

  get playersCount(): number {
    return this._players.length;
  }

  get isPlayersFull(): boolean {
    return (
      (this._hostInfo.mode === GameMode.SINGLE ||
        this._hostInfo.mode === GameMode.MATCH) &&
      this.playersCount === 2
    );
  }

  get duelRecordPlayers(): { name: string; deck: YGOProDeck }[] {
    return this._currentDuelRecord.players;
  }

  get seed(): number[] {
    return this._currentDuelRecord.seed;
  }

  get currentDuelRecord(): DuelRecord {
    return this._currentDuelRecord;
  }

  async getDuelRecordDeck(): Promise<YGOProDeck[]> {
    const cardReader = await this.getCardReader();
    return this._currentDuelRecord
      .toSwappedPlayers()
      .map((player) =>
        calculateOcgcoreDeck(player.deck, this.hostInfo, cardReader),
      );
  }

  waiting(): void {
    this.roomState?.removeAllListener();
    this.roomState = new MercuryWaitingState(
      new UserAuth(new UserProfilePostgresRepository()),
      this.emitter,
      this._logger,
    );
  }

  rps(): void {
    this._state = DuelState.RPS;
    this.roomState?.removeAllListener();
    this.roomState = new MercuryRockPaperScissorState(
      this.emitter,
      this._logger,
    );
  }

  choosingOrder(): void {
    this._state = DuelState.CHOOSING_ORDER;
    this.roomState?.removeAllListener();
    this.roomState = new MercuryChoosingOrderState(this.emitter, this._logger);
  }

  dueling(): void {
    this._state = DuelState.DUELING;
    this.isStart = "start";
    this.roomState?.removeAllListener();
    this.roomState = new MercuryDuelingState(this, this.emitter, this._logger);
  }

  sideDecking(): void {
    this._state = DuelState.SIDE_DECKING;
    this.roomState?.removeAllListener();
    this.roomState = new MercurySideDeckingState(this.emitter, this._logger);
  }

  createSpectatorUnsafe(socket: ISocket, name: string): MercuryClient {
    const position = NetPlayerType.OBSERVER;

    const client = new MercuryClient({
      name,
      socket,
      logger: this._logger,
      position,
      host: false,
      id: null,
      team: Team.SPECTATOR,
      room: this,
    });

    return client;
  }

  createPlayerUnsafe(
    socket: ISocket,
    name: string,
    userId: string | null,
  ): MercuryClient | null {
    const host = this._players.some((client: MercuryClient) => client.host);
    const place = this.calculatePlaceUnsafe();
    if (!place) {
      return null;
    }

    const client = new MercuryClient({
      name,
      socket,
      logger: this._logger,
      position: place.position,
      host: !host,
      id: userId,
      team: place.team,
      room: this,
    });

    return client;
  }

  addPlayerUnsafe(client: MercuryClient): void {
    this.sendJoinGameMessage(client);
    this._players.push(client);
    client.socket.roomId = this.id;

    this.sendTypeChangeMessage(client);

    this.clients.forEach((_client: MercuryClient) => {
      const playerEnterMessage = this.preparePlayerEnterMessage(_client);
      client.sendMessageToClient(
        Buffer.from(playerEnterMessage.toFullPayload()),
      );
      if (_client.deck) {
        const playerChangeMessage = this.preparePlayerChangeMessage(_client);
        client.sendMessageToClient(
          Buffer.from(playerChangeMessage.toFullPayload()),
        );
      }
    });

    const playerEnterMessage = this.preparePlayerEnterMessage(client);
    this.clients.forEach((_client: MercuryClient) => {
      if (_client !== client) {
        _client.sendMessageToClient(
          Buffer.from(playerEnterMessage.toFullPayload()),
        );
      }
    });

    this.sendSpectatorCount({ enqueue: false });
  }

  addSpectatorUnsafe(spectator: MercuryClient): void {
    this.sendJoinGameMessage(spectator);
    this._spectators.push(spectator);
    this.sendTypeChangeMessage(spectator);

    this.clients.forEach((_client: MercuryClient) => {
      const playerEnterMessage = this.preparePlayerEnterMessage(_client);
      spectator.sendMessageToClient(
        Buffer.from(playerEnterMessage.toFullPayload()),
      );
      if (_client.deck) {
        const playerChangeMessage = this.preparePlayerChangeMessage(_client);
        spectator.sendMessageToClient(
          Buffer.from(playerChangeMessage.toFullPayload()),
        );
      }
    });

    this.sendSpectatorCount({ enqueue: false });
  }

  playerToSpectatorUnsafe(player: MercuryClient): void {
    this.removePlayerUnsafe(player);
    this._spectators.push(player);

    const playerChangeMessage = this.preparePlayerChangeMessage(
      player,
      PlayerChangeState.OBSERVE,
    );
    this.broadcastToAll(Buffer.from(playerChangeMessage.toFullPayload()));
    player.spectatorPosition(NetPlayerType.OBSERVER);
    player.notReady();
    this.sendTypeChangeMessage(player);
    this.sendSpectatorCount({ enqueue: false });
  }

  spectatorToPlayerUnsafe(player: MercuryClient): void {
    const place = this.calculatePlaceUnsafe();
    if (!place) {
      return;
    }
    this.removeSpectatorUnsafe(player);
    this._players.push(player);

    player.playerPosition(place.position, place.team);
    player.notReady();

    const playerEnterMessage = this.preparePlayerEnterMessage(player);
    this.broadcastToAll(Buffer.from(playerEnterMessage.toFullPayload()));

    this.sendTypeChangeMessage(player);
    this.sendSpectatorCount({ enqueue: false });
  }

  movePlayerToAnotherCellUnsafe(player: MercuryClient): void {
    const nextPlace = this.nextAvailablePosition(player.position);
    if (!nextPlace) {
      return;
    }
    player.notReady();
    this.sendPlayerChangeMessage(player, nextPlace.position);
    this.sendPlayerChangeMessage(player, PlayerChangeState.NOTREADY);
    player.playerPosition(nextPlace.position, nextPlace.team);
    this.sendTypeChangeMessage(player);
  }

  setDecksToPlayer(position: number, deck: YGOProDeck): void {
    this.mutex.runExclusive(() => {
      this.setDecksToPlayerUnsafe(position, deck);
    });
  }

  setDecksToPlayerUnsafe(position: number, deck: YGOProDeck): void {
    const client = this._players.find((client) => client.position === position);

    if (!client || !(client instanceof MercuryClient)) {
      return;
    }

    client.ready();
    client.saveDeck(deck);
    const message = this.preparePlayerChangeMessage(client);
    this.broadcastToAll(Buffer.from(message.toFullPayload()));
  }

  notReadyUnsafe(player: MercuryClient): void {
    if (player.position === NetPlayerType.OBSERVER) {
      return;
    }
    player.clearDeck();
    player.notReady();
    this.sendPlayerChangeMessage(player);
  }

  sendPreviousDuelsHistoricalMessages(spectator: MercuryClient): void {
    for (const record of this._duelRecords.slice(0, -1)) {
      for (const message of record.toPlayback((msg) => msg.observerView())) {
        spectator.sendMessageToClient(Buffer.from(message.toFullPayload()));
      }
    }
  }

  sendCurrentDuelHistoricalMessages(spectator: MercuryClient): void {
    for (const message of this._currentDuelRecord?.toPlayback((msg) =>
      msg.observerView(),
    ) || []) {
      console.log("enviando");
      spectator.sendMessageToClient(Buffer.from(message.toFullPayload()));
    }
  }

  currentDuelReplayData(): YGOProYrp {
    return this._currentDuelRecord.toYrp(this);
  }

  sendDeckCountMessage(client: MercuryClient): void {
    const toDeckCount = (deck: YGOProDeck | null) => {
      const message = new YGOProStocDeckCount_DeckInfo();
      if (!deck) {
        message.main = 0;
        message.extra = 0;
        message.side = 0;
      } else {
        message.main = deck.main.length;
        message.extra = deck.extra.length;
        message.side = deck.side.length;
      }
      return message;
    };

    const displayCountDecks: (YGOProDeck | null)[] = [0, 1].map((team) => {
      const player = this.getTeamPlayers(team)[0];
      return player.deck;
    });

    const team = this.getTeam(client.position);
    const deck = displayCountDecks[team];
    const otherDeck = displayCountDecks[1 - team];

    const message = new YGOProStocDeckCount().fromPartial({
      player0DeckCount: toDeckCount(deck),
      player1DeckCount: toDeckCount(otherDeck),
    });

    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  generateDuelRecord(): void {
    const seed = generateSeed();

    const decks = this.shuffleDeckEnabled
      ? shuffleDecksBySeed(
        this.players.map((_client: MercuryClient) => _client.deck!),
        seed,
      )
      : this.players.map((_client: MercuryClient) => _client.deck);

    const players = this.players.map(
      (_client: MercuryClient, index: number) => ({
        name: _client.name,
        deck: decks[index]!,
      }),
    );
    const duelRecord = new DuelRecord(seed, players, this.isPositionSwapped);
    this._duelRecords.push(duelRecord);
    this._currentDuelRecord = duelRecord;
  }

  saveMessageToDuelRecord(message: YGOProMsgBase): void {
    this._currentDuelRecord.messages.push(message);
  }

  reconnect(player: MercuryClient, socket: ISocket): void {
    player.socket.removeAllListeners();
    player.setSocket(socket);
    player.reconnecting();
    this.sendJoinGameMessage(player);
    const type = player.host ? player.position | 0x10 : player.position;
    const typeChangeMessage = new YGOProStocTypeChange().fromPartial({
      type,
    });
    player.sendMessageToClient(Buffer.from(typeChangeMessage.toFullPayload()));
    this._players.forEach((_client: MercuryClient) => {
      const playerEnterMessage = this.preparePlayerEnterMessage(_client);
      player.sendMessageToClient(
        Buffer.from(playerEnterMessage.toFullPayload()),
      );
    });
  }

  async getCard(cardId: number) {
    const cardReader = await this._resourceLoader.getCardReader();
    return cardReader(cardId);
  }

  async getCardReader() {
    return this._resourceLoader.getCardReader();
  }

  async getCardStorage() {
    return this._resourceLoader.getCardStorage();
  }

  async ocgCoreBinary() {
    return this._resourceLoader.getOcgcoreWasmBinary();
  }

  private get teamOffsetBit() {
    return this.isTag ? 1 : 0;
  }

  setBanListHash(banListHash: number): void {
    this._banListHash = banListHash;

    const mercuryBanList =
      MercuryBanListMemoryRepository.findByHash(banListHash);
    if (!mercuryBanList?.name) {
      return;
    }

    const edoBanList = BanListMemoryRepository.findByName(mercuryBanList.name);

    this._edoBanListHash = edoBanList?.hash ?? 0;
  }

  toPresentation(): { [key: string]: unknown } {
    return {
      roomid: this.id,
      roomname: this.name,
      roomnotes: this.ranked ? "(Mercury-Ranked)" : "(Mercury)",
      roommode: this._hostInfo.mode,
      needpass: this.password.length > 0,
      team1: this.team0,
      team2: this.team1,
      best_of: this.bestOf,
      duel_flag: 0,
      forbidden_types: 0,
      extra_rules: 0,
      start_lp: this._hostInfo.start_lp,
      start_hand: this._hostInfo.start_hand,
      draw_count: this._hostInfo.draw_count,
      time_limit: this._hostInfo.time_limit,
      rule: this._hostInfo.rule,
      no_check: this._hostInfo.no_check_deck,
      no_shuffle: this._hostInfo.no_shuffle_deck,
      banlist_hash: this._edoBanListHash ?? this._banListHash,
      istart: this.isStart,
      main_min: 40,
      main_max: 60,
      extra_min: 0,
      extra_max: 15,
      side_min: 0,
      side_max: 15,
      users: this._players.map((player) => ({
        name: player.name.replace(/\0/g, "").trim(),
        pos: player.position,
      })),
    };
  }

  destroy(): void {
    this.emitter.removeAllListeners();
    this.roomState?.removeAllListener();
    this._players.forEach((client: MercuryClient) => {
      client.destroy();
    });
  }

  removeSpectator(spectator: MercuryClient): void {
    this._spectators = this._spectators.filter(
      (item) => item.socket.id !== spectator.socket.id,
    );
  }

  get banListHash(): number {
    return this._banListHash;
  }

  get edoBanListHash(): number {
    return this._edoBanListHash;
  }

  setDuelFinished(): void {
    this._state = DuelState.WAITING;
  }

  sendSpectatorCount({ enqueue = false }: { enqueue: boolean }): void {
    const message = new YGOProStocHsWatchChange().fromPartial({
      watch_count: this.spectators.length,
    });

    if (!enqueue) {
      this.broadcastToAll(Buffer.from(message.toFullPayload()));

      return;
    }
    this.mutex.runExclusive(() => {
      this.broadcastToAll(Buffer.from(message.toFullPayload()));
    });
  }

  private sendTypeChangeMessage(client: MercuryClient): void {
    const message = new YGOProStocTypeChange().fromPartial({
      playerPosition: client.position,
      isHost: client.host,
    });
    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  private sendPlayerChangeMessage(
    client: MercuryClient,
    playerState?: PlayerChangeState | number,
  ): void {
    const message = this.preparePlayerChangeMessage(client, playerState);
    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  private sendJoinGameMessage(client: MercuryClient): void {
    const message = new YGOProStocJoinGame().fromPartial({
      info: {
        ...this.hostInfo,
        lflist: 0,
        mode: this.mode,
      },
    });

    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  private broadcastToAll(message: Buffer): void {
    this._players.forEach((client: MercuryClient) => {
      client.sendMessageToClient(message);
    });
    this._spectators.forEach((client: MercuryClient) => {
      client.sendMessageToClient(message);
    });
  }

  private preparePlayerEnterMessage(
    client: MercuryClient,
  ): YGOProStocHsPlayerEnter {
    return new YGOProStocHsPlayerEnter().fromPartial({
      name: client.name,
      pos: client.position,
    });
  }

  private preparePlayerChangeMessage(
    client: MercuryClient,
    playerState?: PlayerChangeState | number,
  ): YGOProStocHsPlayerChange {
    if (!playerState) {
      const playerState = client.isReady
        ? PlayerChangeState.READY
        : PlayerChangeState.NOTREADY;

      return new YGOProStocHsPlayerChange().fromPartial({
        playerPosition: client.position,
        playerState,
      });
    }

    return new YGOProStocHsPlayerChange().fromPartial({
      playerPosition: client.position,
      playerState,
    });
  }
}
