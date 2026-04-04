import { EventEmitter } from "stream";

import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomState } from "@edopro/room/domain/RoomState";

import { Team } from "@shared/room/Team";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { Logger } from "@shared/logger/domain/Logger";
import { DeckRules, DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { RoomType } from "@shared/room/domain/RoomType";
import { MessageRepository } from "@shared/messages/MessageRepository";
import { ISocket } from "@shared/socket/domain/ISocket";
import { Deck } from "@shared/deck/domain/Deck";

import MercuryBanListMemoryRepository from "../../ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProClient } from "../../client/domain/YGOProClient";
import {
  extendedCardPoolFormats,
  formatRuleMappings,
  priorityRuleMappings,
  ruleMappings,
} from "./RuleMappings";
import { YGOProChoosingOrderState } from "./states/YGOProChoosingOrderState";
import { YGOProDuelingState } from "./states/YGOProDuelingState";
import { YGOProRockPaperScissorState } from "./states/YGOProRockPaperScissorState";
import { YGOProSideDeckingState } from "./states/YGOProSideDeckingState";
import { YGOProWaitingState } from "./states/YGOProWaitingState";
import { HostInfo } from "./host-info/HostInfo";
import { getLobbyDuelInfo } from "./LobbyDuelFlags";

import {
  GameMode,
  NetPlayerType,
  PlayerChangeState,
  YGOProMsgBase,
  YGOProStocDeckCount,
  YGOProStocDeckCount_DeckInfo,
} from "ygopro-msg-encode";
import { YGOProYrp } from "ygopro-yrp-encode";
import { DuelRecord } from "./DuelRecord";
import { YGOProDeckCreator } from "@ygopro/deck/application/YGOProDeckCreator";
import { YGOProDeckValidator } from "@ygopro/deck/domain/YGOProDeckValidator";
import { CardYGOProRepository } from "@ygopro/card/infrastructure/CardYGOProRepository";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";

const BEST_OF = {
  [GameMode.SINGLE]: 1,
  [GameMode.MATCH]: 3,
  [GameMode.TAG]: 1,
};

export class YGOProRoom extends YgoRoom {
  readonly name: string;
  readonly password: string;
  readonly createdBySocketId: string;
  readonly banListHash: number;
  readonly useExtendedCardPool: boolean;
  //TODO: compatibility with edopro list and rank;
  private _edoBanListHash: number;
  private _logger: Logger;
  private _roomState: RoomState | null = null;
  private _isPositionSwapped: boolean = false;
  private _duelRecords: DuelRecord[] = [];
  private _currentDuelRecord: DuelRecord;
  private readonly _hostInfo: HostInfo;
  private readonly _messageRepository: MessageRepository;
  private readonly _cardRepository: CardYGOProRepository;
  private readonly _deckRules: DeckRules;

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
    messageRepository,
    banListHash,
    useExtendedCardPool,
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
    messageRepository: MessageRepository;
    banListHash: number;
    useExtendedCardPool: boolean;
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
    this.banListHash = banListHash;
    this.useExtendedCardPool = useExtendedCardPool;
    this.createdBySocketId = createdBySocketId;
    this._messageRepository = messageRepository;
    this._cardRepository = new CardYGOProRepository(this.useExtendedCardPool);
    this._deckRules = new DeckRules({
      mainMin: 40,
      mainMax: 60,
      extraMin: 0,
      extraMax: 15,
      sideMin: 0,
      sideMax: 15,
      rule: this._hostInfo.rule,
    }); banListHash
    const banList = MercuryBanListMemoryRepository.findByHash(banListHash);
    const edoBanList = BanListMemoryRepository.findByName(banList?.name ?? "");
    this._edoBanListHash = edoBanList?.hash ?? 0;
  }

  static create(
    id: number,
    command: string,
    logger: Logger,
    emitter: EventEmitter,
    playerInfo: PlayerInfoMessage,
    createdBySocketId: string,
    messageRepository: MessageRepository,
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
      time_limit: 450,
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
    const useExtendedCardPool = options.some((opt) => extendedCardPoolFormats.has(opt));
    const banList = MercuryBanListMemoryRepository.findLFListByIndex(
      hostInfo.lflist,
    );
    const banListHash = banList?.hash ?? 0;

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
      messageRepository,
      banListHash,
      useExtendedCardPool,
    });

    room._logger = logger.child({ file: "MercuryRoom" });
    room.emitter = emitter;

    return room;
  }

  shouldValidateDeck(): boolean {
    return !this._hostInfo.no_check_deck;
  }

  get isTag() {
    return (this.hostInfo.mode & 0x2) !== 0;
  }

  get mode() {
    return this.hostInfo.mode > 2 ? (this.isTag ? 2 : 1) : this.hostInfo.mode;
  }

  getTeamPlayers(team: number): YGOProClient[] {
    return (this.players as YGOProClient[])
      .filter((client) => client.team === team)
      .sort((a, b) => a.position - b.position);
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

  setPositionSwapped(value: boolean): void {
    this._isPositionSwapped = value;
  }

  get isPositionSwapped(): boolean {
    return this._isPositionSwapped;
  }

  get hostInfo(): HostInfo {
    return {
      ...this._hostInfo,
      mode: this._hostInfo.mode,
      lflist: this.banListHash,
    };
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

  get seed(): number[] {
    return this._currentDuelRecord.seed;
  }

  get currentDuelRecord(): DuelRecord {
    return this._currentDuelRecord;
  }

  get duelRecords(): DuelRecord[] {
    return this._duelRecords;
  }

  get edoBanListHash(): number {
    return this._edoBanListHash;
  }

  waiting(): void {
    this._roomState?.removeAllListener();
    this._roomState = new YGOProWaitingState(
      new UserAuth(new UserProfilePostgresRepository()),
      this.emitter,
      this._logger,
      new YGOProDeckCreator(
        this._cardRepository,
        this._deckRules,
        this._logger,
      ),
      this.createDeckValidator(),
    );
  }

  rps(): void {
    this._state = DuelState.RPS;
    this._roomState?.removeAllListener();
    this._roomState = new YGOProRockPaperScissorState(
      this.emitter,
      this._logger,
    );
  }

  choosingOrder(): void {
    this._state = DuelState.CHOOSING_ORDER;
    this._roomState?.removeAllListener();
    this._roomState = new YGOProChoosingOrderState(this.emitter, this._logger);
  }

  dueling(): void {
    // Create the Duel object to track turn count for Tag rotation
    const banList = MercuryBanListMemoryRepository.findByHash(this.banListHash);
    this.createDuel(banList?.name ?? null);

    this._state = DuelState.DUELING;
    this.isStart = "start";
    this._roomState?.removeAllListener();
    this._roomState = new YGOProDuelingState(this, this.emitter, this._logger);
  }

  sideDecking(): void {
    this._state = DuelState.SIDE_DECKING;
    this._roomState?.removeAllListener();
    this._roomState = new YGOProSideDeckingState(
      this.emitter,
      this._logger,
      new YGOProDeckCreator(
        this._cardRepository,
        this._deckRules,
        this._logger,
      ),
      this.createDeckValidator(),
      this,
    );
  }

  createSpectatorUnsafe(socket: ISocket, name: string): YGOProClient {
    const position = NetPlayerType.OBSERVER;

    const client = new YGOProClient({
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
  ): YGOProClient | null {
    const host = this._players.some((client: YGOProClient) => client.host);
    const place = this.calculatePlaceUnsafe();
    if (!place) {
      return null;
    }

    const client = new YGOProClient({
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

  addPlayerUnsafe(player: YGOProClient): void {
    player.sendMessageToClient(
      this._messageRepository.joinGameMessage(this.hostInfo),
    );
    this._players.push(player);
    player.socket.roomId = this.id;

    player.sendMessageToClient(
      this._messageRepository.typeChangeMessage(player.position, player.host),
    );

    this.clients.forEach((_client: YGOProClient) => {
      const playerEnterMessageBuffer =
        this._messageRepository.playerEnterMessage(
          _client.name,
          _client.position,
        );
      player.sendMessageToClient(playerEnterMessageBuffer);

      if (_client.deck) {
        const state = _client.isReady
          ? PlayerChangeState.READY
          : PlayerChangeState.NOTREADY;
        player.sendMessageToClient(
          this._messageRepository.playerChangeMessage(_client.position, state),
        );
      }
    });

    const playerEnterMessage = this._messageRepository.playerEnterMessage(
      player.name,
      player.position,
    );
    this.clients.forEach((_client: YGOProClient) => {
      if (_client !== player) {
        _client.sendMessageToClient(playerEnterMessage);
      }
    });

    this.sendSpectatorCount({ enqueue: false });
  }

  addSpectatorUnsafe(spectator: YGOProClient): void {
    spectator.sendMessageToClient(
      this._messageRepository.joinGameMessage(this.hostInfo),
    );

    this._spectators.push(spectator);
    spectator.sendMessageToClient(
      this._messageRepository.typeChangeMessage(
        spectator.position,
        spectator.host,
      ),
    );

    this.clients.forEach((_client: YGOProClient) => {
      const playerEnterMessageBuffer =
        this._messageRepository.playerEnterMessage(
          _client.name,
          _client.position,
        );
      spectator.sendMessageToClient(playerEnterMessageBuffer);
      if (_client.deck) {
        const state = _client.isReady
          ? PlayerChangeState.READY
          : PlayerChangeState.NOTREADY;
        spectator.sendMessageToClient(
          this._messageRepository.playerChangeMessage(_client.position, state),
        );
      }
    });

    this.sendSpectatorCount({ enqueue: false });
  }

  playerToSpectatorUnsafe(player: YGOProClient): void {
    this.removePlayerUnsafe(player);
    this._spectators.push(player);

    const playerChangeMessageBuffer =
      this._messageRepository.playerChangeMessage(
        player.position,
        PlayerChangeState.OBSERVE,
      );
    this.broadcastToAll(playerChangeMessageBuffer);

    player.spectatorPosition(NetPlayerType.OBSERVER);
    player.notReady();
    player.sendMessageToClient(
      this._messageRepository.typeChangeMessage(player.position, player.host),
    );
    this.sendSpectatorCount({ enqueue: false });
  }

  spectatorToPlayerUnsafe(player: YGOProClient): void {
    const place = this.calculatePlaceUnsafe();
    if (!place) {
      return;
    }
    this.removeSpectatorUnsafe(player);
    this._players.push(player);

    player.playerPosition(place.position, place.team);
    player.notReady();

    const playerEnterMessageBuffer = this._messageRepository.playerEnterMessage(
      player.name,
      player.position,
    );
    this.broadcastToAll(playerEnterMessageBuffer);

    player.sendMessageToClient(
      this._messageRepository.typeChangeMessage(player.position, player.host),
    );
    this.sendSpectatorCount({ enqueue: false });
  }

  movePlayerToAnotherCellUnsafe(player: YGOProClient): void {
    const nextPlace = this.nextAvailablePosition(player.position);
    if (!nextPlace) {
      return;
    }
    player.notReady();
    player.sendMessageToClient(
      this._messageRepository.playerChangeMessage(
        player.position,
        nextPlace.position,
      ),
    );
    player.sendMessageToClient(
      this._messageRepository.playerChangeMessage(
        player.position,
        PlayerChangeState.NOTREADY,
      ),
    );
    player.playerPosition(nextPlace.position, nextPlace.team);
    player.sendMessageToClient(
      this._messageRepository.typeChangeMessage(player.position, player.host),
    );
  }

  setDecksToPlayer(position: number, deck: Deck): void {
    this.mutex.runExclusive(() => {
      this.setDecksToPlayerUnsafe(position, deck);
    });
  }

  setDecksToPlayerUnsafe(position: number, deck: Deck): void {
    const client = this._players.find((client) => client.position === position);

    if (!client || !(client instanceof YGOProClient)) {
      return;
    }

    client.ready();
    client.setDeck(deck);
    const message = this._messageRepository.playerChangeMessage(
      client.position,
      PlayerChangeState.READY,
    );
    this.broadcastToAll(message);
  }

  notReadyUnsafe(player: YGOProClient): void {
    if (player.position === NetPlayerType.OBSERVER) {
      return;
    }
    player.notReady();
    player.sendMessageToClient(
      this._messageRepository.playerChangeMessage(
        player.position,
        PlayerChangeState.NOTREADY,
      ),
    );
  }

  sendPreviousDuelsHistoricalMessages(spectator: YGOProClient): void {
    for (const record of this._duelRecords.slice(0, -1)) {
      for (const message of record.toPlayback((msg) => msg.observerView())) {
        spectator.sendMessageToClient(Buffer.from(message.toFullPayload()));
      }
    }
  }

  sendCurrentDuelHistoricalMessages(spectator: YGOProClient): void {
    for (const message of this._currentDuelRecord?.toPlayback((msg) =>
      msg.observerView(),
    ) || []) {
      spectator.sendMessageToClient(Buffer.from(message.toFullPayload()));
    }
  }

  currentDuelReplayData(): YGOProYrp | null {
    if (!this._currentDuelRecord) return null;
    return this._currentDuelRecord.toYrp(this);
  }

  sendDeckCountMessage(client: YGOProClient): void {
    const toDeckCount = (deck: Deck | null) => {
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

    const displayCountDecks: (Deck | null)[] = [0, 1].map((team) => {
      const player = this.getTeamPlayers(team)[0];
      return player.deck;
    });

    const team = client.team;
    const deck = displayCountDecks[team];
    const otherDeck = displayCountDecks[1 - team];

    const message = new YGOProStocDeckCount().fromPartial({
      player0DeckCount: toDeckCount(deck),
      player1DeckCount: toDeckCount(otherDeck),
    });

    client.sendMessageToClient(Buffer.from(message.toFullPayload()));
  }

  addDuelRecord(duelRecord: DuelRecord): void {
    this._duelRecords.push(duelRecord);
    this._currentDuelRecord = duelRecord;
  }

  saveMessageToDuelRecord(message: YGOProMsgBase): void {
    this._currentDuelRecord.messages.push(message);
  }

  reconnect(player: YGOProClient, socket: ISocket): void {
    player.socket.removeAllListeners();
    player.setSocket(socket);
    player.reconnecting();
    player.sendMessageToClient(
      this._messageRepository.joinGameMessage(this.hostInfo),
    );
    const type = player.host ? player.position | 0x10 : player.position;
    player.sendMessageToClient(
      this._messageRepository.typeChangeMessageFromType(type),
    );
    this._players.forEach((_player: YGOProClient) => {
      const playerEnterMessageBuffer =
        this._messageRepository.playerEnterMessage(
          _player.name,
          _player.position,
        );
      player.sendMessageToClient(playerEnterMessageBuffer);
    });
  }


  private createDeckValidator(): YGOProDeckValidator {
    const banList = MercuryBanListMemoryRepository.findByHash(this.banListHash);

    return new YGOProDeckValidator(this._deckRules, banList ?? new YGOProBanList());
  }

  toPresentation(): { [key: string]: unknown } {
    const lobbyInfo = getLobbyDuelInfo(this._hostInfo.duel_rule);

    return {
      roomid: this.id,
      roomname: this.name,
      roomnotes: this.ranked ? "(Mercury-Ranked)" : "(Mercury)",
      roommode: this._hostInfo.mode,
      needpass: this.password.length > 0,
      team1: this.team0,
      team2: this.team1,
      best_of: this.bestOf,
      duel_flag: lobbyInfo.duelFlag,
      forbidden_types: lobbyInfo.forbiddenTypes,
      extra_rules: 0,
      start_lp: this._hostInfo.start_lp,
      start_hand: this._hostInfo.start_hand,
      draw_count: this._hostInfo.draw_count,
      time_limit: this._hostInfo.time_limit,
      rule: this._hostInfo.rule,
      no_check: Boolean(this._hostInfo.no_check_deck),
      no_shuffle: Boolean(this._hostInfo.no_shuffle_deck),
      banlist_hash: this._edoBanListHash ?? this.banListHash,
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
    this._roomState?.removeAllListener();
    this._players.forEach((client: YGOProClient) => {
      client.destroy();
    });
  }

  removeSpectator(spectator: YGOProClient): void {
    this._spectators = this._spectators.filter(
      (item) => item.socket.id !== spectator.socket.id,
    );
  }

  playerLeave(player: YGOProClient): void {
    this.removePlayer(player);
    const message = this.messageSender.playerChangeMessage(
      player.position,
      PlayerChangeState.LEAVE,
    );
    this.broadcastToAll(message);
  }

  spectatorLeave(spectator: YGOProClient): void {
    this.removeSpectator(spectator);
    this.sendSpectatorCount({ enqueue: false });
  }

  setDuelFinished(): void {
    this._state = DuelState.WAITING;
  }

  get messageSender(): MessageRepository {
    return this._messageRepository;
  }

  sendSpectatorCount({ enqueue = false }: { enqueue: boolean }): void {
    const message = this._messageRepository.watchChangeMessage(
      this._spectators.length,
    );
    if (!enqueue) {
      this.broadcastToAll(message);

      return;
    }
    this.mutex.runExclusive(() => {
      this.broadcastToAll(message);
    });
  }

  private broadcastToAll(message: Buffer): void {
    this._players.forEach((client: YGOProClient) => {
      client.sendMessageToClient(message);
    });
    this._spectators.forEach((client: YGOProClient) => {
      client.sendMessageToClient(message);
    });
  }
}
