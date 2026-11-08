import { edoproBanListCatalog } from "@edopro/ban-list/domain/EdoproBanListCatalog";
import { PlayerChangeClientMessage } from "@edopro/messages/server-to-client/PlayerChangeClientMessage";
import { ChildProcessWithoutNullStreams } from "child_process";
import shuffle from "shuffle-array";
import { PlayerEnterClientMessage } from "src/shared/messages/server-to-client/PlayerEnterClientMessage";
import { EventEmitter } from "stream";

import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { DeckRules, DuelState, YgoRoom } from "../../../shared/room/domain/YgoRoom";
import { Team } from "../../../shared/room/Team";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { Deck } from "../../../shared/deck/domain/Deck";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { JSONMessageProcessor } from "../../messages/JSONMessageProcessor";
import { MessageProcessor } from "../../../shared/messages/MessageProcessor";
import { Replay } from "../../replay/Replay";
import { RoomMessageEmitter } from "../../RoomMessageEmitter";
import { DuelFinishReason } from "./DuelFinishReason";
import { PlayerRoomState } from "./PlayerRoomState";
import { RoomClientNotifier } from "./RoomClientNotifier";
import { EdoproRoomDeps } from "./RoomStatePorts";
import { RoomState } from "../../../shared/room/domain/RoomState";
import { ChossingOrderState } from "./states/chossing-order/ChossingOrderState";
import { DuelingState } from "./states/dueling/DuelingState";
import { RockPaperScissorState } from "./states/rps/RockPaperScissorsState";
import { SideDeckingState } from "./states/side-decking/SideDeckingState";
import { WaitingState } from "./states/waiting/WaitingState";
import { CoreChannel } from "./CoreChannel";
import { Timer } from "./Timer";
import { nextTurn, prepareTurnOrder } from "./TurnOrder";
import { RoomType } from "src/shared/room/domain/RoomType";

export interface RoomAttr {
	id: number;
	name: string;
	notes: string;
	mode: number;
	needPass: boolean;
	team0: number;
	team1: number;
	bestOf: number;
	duelFlag: bigint;
	duelFlagsHight: number;
	duelFlagsLow: number;
	forbiddenTypes: number;
	extraRules: number;
	startLp: number;
	startHand: number;
	drawCount: number;
	timeLimit: number;
	rule: number;
	noCheck: boolean;
	noShuffle: boolean;
	banListHash: number;
	mainMin: number;
	mainMax: number;
	extraMin: number;
	extraMax: number;
	sideMin: number;
	sideMax: number;
	duelRule: number;
	handshake: number;
	password: string;
	duel?: ChildProcessWithoutNullStreams;
	ranked: boolean;
}

export class Room extends YgoRoom {
	public readonly name: string;
	public readonly mode: number;
	public readonly needPass: boolean;
	public readonly duelFlag: bigint;
	public readonly duelFlagsLow: number;
	public readonly duelFlagsHight: number;
	public readonly forbiddenTypes: number;
	public readonly extraRules: number;
	public readonly startHand: number;
	public readonly drawCount: number;
	public readonly timeLimit: number;
	public readonly noCheck: boolean;
	public readonly noShuffle: boolean;
	public readonly banListHash: number;
	public readonly deckRules: DeckRules;
	public readonly duelRule: number;
	public readonly handshake: number;
	public readonly password: string;
	private _replay: Replay;
	private readonly _kick: Client[] = [];
	private _lastPhase: Buffer | null = null;
	private _playerMainDeckSize: number;
	private _playerExtraDeckSize: number;
	private _opponentMainDeckSize: number;
	private _opponentExtraDeckSize: number;
	private readonly timers: Timer[];
	private readonly roomTimer: Timer;
	private roomState: RoomState | null = null;
	private logger: Logger;
	private readonly deps: EdoproRoomDeps;
	private readonly notifier: RoomClientNotifier;
	private readonly core: CoreChannel;

	private constructor(attr: RoomAttr, deps: EdoproRoomDeps) {
		super({
			id: attr.id,
			team0: attr.team0,
			team1: attr.team1,
			ranked: attr.ranked,
			bestOf: attr.bestOf,
			startLp: attr.startLp,
			notes: attr.notes,
			roomType: RoomType.EDO,
		});
		this.name = attr.name;
		this.mode = attr.mode;
		this.needPass = attr.needPass;
		this.duelFlag = attr.duelFlag;
		this.forbiddenTypes = attr.forbiddenTypes;
		this.extraRules = attr.extraRules;
		this.startHand = attr.startHand;
		this.drawCount = attr.drawCount;
		this.timeLimit = attr.timeLimit;
		this.noCheck = attr.noCheck;
		this.noShuffle = attr.noShuffle;
		this.banListHash = attr.banListHash;
		const maxDeckPoints = this.extractDeckPoints(attr.notes);
		this.deckRules = new DeckRules({
			mainMin: attr.mainMin,
			mainMax: attr.mainMax,
			sideMin: attr.sideMin,
			sideMax: attr.sideMax,
			extraMin: attr.extraMin,
			extraMax: attr.extraMax,
			rule: attr.rule,
			maxDeckPoints,
		});
		this.duelRule = attr.duelRule;
		this.handshake = attr.handshake;
		this.password = attr.password;
		this.core = new CoreChannel(() => this.logger, attr.duel);
		this._state = DuelState.WAITING;
		this.duelFlagsLow = attr.duelFlagsLow;
		this.duelFlagsHight = attr.duelFlagsHight;
		this.deps = deps;
		this.timers = [
			new Timer(this.timeLimit * 1000, () => {
				void this.deps.finishDuel({ reason: DuelFinishReason.TIMEOUT, winner: 1, room: this });
			}),
			new Timer(this.timeLimit * 1000, () => {
				void this.deps.finishDuel({ reason: DuelFinishReason.TIMEOUT, winner: 0, room: this });
			}),
		];

		this.roomTimer = new Timer(this.timeLimit * 2 * 1000, () => {
			this.deps.removeRoom(this);
		});
		this.resetReplay();
		this.notifier = new RoomClientNotifier(
			() => this._players as Client[],
			() => this._spectators as Client[],
		);
	}

	static create(
		payload: RoomAttr,
		emitter: EventEmitter,
		logger: Logger,
		deps: EdoproRoomDeps,
	): Room {
		payload.notes = payload.ranked ? `(Ranked) ${payload.notes}` : payload.notes;
		const room = new Room(payload, deps);
		room.emitter = emitter;
		room.logger = logger.child({ roomId: payload.id });

		return room;
	}

	static createFromCreateGameMessage(
		message: CreateGameMessage,
		playerInfo: PlayerInfoMessage,
		id: number,
		emitter: EventEmitter,
		logger: Logger,
		deps: EdoproRoomDeps,
	): Room {
		const ranked = Room.isRanked(playerInfo.password);

		const room = new Room(
			{
				id,
				name: message.name,
				banListHash: message.banList,
				notes: ranked
					? `(Ranked) ${message.notes} - SD Max: ${message.sideDeckMax}`
					: `${message.notes} - SD Max: ${message.sideDeckMax}`,
				mode: message.mode,
				needPass: Buffer.from(message.password).some((element) => element !== 0x00),
				team0: message.t0Count,
				team1: message.t1Count,
				bestOf: message.bestOf,
				duelFlag: BigInt(message.duelFlagsLow) | (BigInt(message.duelFlagsHight) << BigInt(32)),
				forbiddenTypes: message.forbidden,
				extraRules: message.extraRules,
				startLp: message.lp,
				startHand: message.startingHandCount,
				drawCount: message.drawCount,
				timeLimit: message.timeLimit,
				rule: message.allowed,
				noCheck: Boolean(message.dontCheckDeckContent),
				noShuffle: Boolean(message.dontShuffleDeck),
				mainMin: message.mainDeckMin,
				mainMax: message.mainDeckMax,
				extraMin: message.extraDeckMin,
				extraMax: message.extraDeckMax,
				sideMin: message.sideDeckMin,
				sideMax: message.sideDeckMax,
				duelRule: message.duelRule,
				handshake: message.handshake,
				password: message.password,
				duelFlagsHight: message.duelFlagsHight,
				duelFlagsLow: message.duelFlagsLow,
				ranked,
			},
			deps,
		);

		room.emitter = emitter;
		room.logger = logger.child({ roomId: id });

		return room;
	}

	static isRanked(password: string | null): boolean {
		if (config.ranking.enabled) {
			return Boolean(password);
		}

		return false;
	}

	shouldValidateDeck(): boolean {
		return !this.noCheck;
	}

	resetReplay(): void {
		if (this._replay) {
			this._replay.reset();
		}

		this._replay = new Replay({
			startingDrawCount: this.startHand,
			startingLp: this.startLp,
			flags: this.duelFlag,
			drawCountPerTurn: this.drawCount,
		});
	}

	//********************************************************************************************* */
	//**************************************CLIENTS CRUD******************************************* */
	//********************************************************************************************* */

	async createPlayer(socket: ISocket, name: string, userId: string | null): Promise<Client | null> {
		return this.mutex.runExclusive(() => {
			return this.createPlayerUnsafe(socket, name, userId);
		});
	}

	createPlayerUnsafe(socket: ISocket, name: string, userId: string | null): Client | null {
		const host = this._players.some((client: Client) => client.host);
		const place = this.calculatePlaceUnsafe();

		if (!place) {
			return null;
		}

		const client = new Client({
			socket,
			host: !host,
			name,
			position: place.position,
			roomId: this.id,
			team: place.team,
			logger: this.logger,
			id: userId,
		});

		return client;
	}

	addPlayer(client: Client): void {
		this.mutex.runExclusive(() => {
			this.addPlayerUnsafe(client);
		});
	}

	addPlayerUnsafe(client: Client): void {
		this._players.push(client);
		client.socket.roomId = this.id;

		this.notifier.sendPlayerEnter(client, { position: client.position, team: client.team });
		this.notifier.sendPlayerChange(client, PlayerRoomState.NOT_READY);
		this.notifier.sendTypeChange(client);

		if (!client.host) {
			this.sendSpectatorCount({ enqueue: false });
			this.notifyToAllLobbyClients(client);
		}

		const messageProcessor = new MessageProcessor();
		const roomMessageEmitter = new RoomMessageEmitter(client, this);

		client.socket.onMessage((data) => {
			roomMessageEmitter.handleMessage(data);
			messageProcessor.read(data);
		});
	}

	async createSpectator(socket: ISocket, name: string): Promise<Client> {
		return this.mutex.runExclusive(() => {
			return this.createSpectatorUnsafe(socket, name);
		});
	}

	createSpectatorUnsafe(socket: ISocket, name: string, userId: string | null = null): Client {
		const position = this.nextSpectatorPositionUnsafe();

		const client = new Client({
			id: userId,
			socket,
			host: false,
			name,
			position,
			roomId: this.id,
			team: Team.SPECTATOR,
			logger: this.logger,
		});

		return client;
	}

	addSpectator(client: Client): void {
		this.mutex.runExclusive(() => {
			this.addSpectatorUnsafe(client);
		});
	}

	addSpectatorUnsafe(client: Client): void {
		client.socket.roomId = this.id;
		this._spectators.push(client);

		const messageProcessor = new MessageProcessor();
		const roomMessageEmitter = new RoomMessageEmitter(client, this);

		client.socket.onMessage((data) => {
			roomMessageEmitter.handleMessage(data);
			messageProcessor.read(data);
		});

		this.notifier.sendTypeChange(client, 0x07);
	}

	playerToSpectator(player: Client): void {
		this.mutex.runExclusive(() => {
			this.playerToSpectatorUnsafe(player);
		});
	}

	playerToSpectatorUnsafe(player: Client): void {
		const place = this.nextSpectatorPositionUnsafe();
		this.removePlayerUnsafe(player);
		this._spectators.push(player);
		this.notifier.sendPlayerChange(player, PlayerRoomState.SPECTATE);
		player.spectatorPosition(place);
		player.notReady();
		this.notifier.sendTypeChange(player);
		this.sendSpectatorCount({ enqueue: false });
	}

	spectatorToPlayer(player: Client): void {
		this.mutex.runExclusive(() => {
			this.spectatorToPlayerUnsafe(player);
		});
	}

	spectatorToPlayerUnsafe(player: Client): void {
		const place = this.calculatePlaceUnsafe();
		if (!place) {
			return;
		}
		this.removeSpectatorUnsafe(player);
		this._players.push(player);
		this.notifier.sendPlayerEnter(player, place);
		this.notifier.sendPlayerChange(player, PlayerRoomState.NOT_READY);
		this.sendSpectatorCount({ enqueue: false });
		player.playerPosition(place.position, place.team);
		player.notReady();
		this.notifier.sendTypeChange(player);
	}

	movePlayerToAnotherCell(player: Client): void {
		this.mutex.runExclusive(() => {
			this.movePlayerToAnotherCellUnsafe(player);
		});
	}

	movePlayerToAnotherCellUnsafe(player: Client): void {
		const nextPlace = this.nextAvailablePosition(player.position);
		if (!nextPlace) {
			return;
		}
		player.notReady();
		this.notifier.sendPlayerCellChange(player, nextPlace);
		this.notifier.sendPlayerChange(player, PlayerRoomState.NOT_READY);
		player.playerPosition(nextPlace.position, nextPlace.team);
		this.notifier.sendTypeChange(player);
	}
	//********************************************************************************************* */
	//**********************************END CLIENTS CRUD******************************************* */
	//********************************************************************************************* */

	//********************************************************************************************* */
	//**************************************PLAYER STATES****************************************** */
	//********************************************************************************************* */

	ready(player: Client): void {
		this.mutex.runExclusive(() => {
			this.readyUnsafe(player);
		});
	}

	readyUnsafe(player: Client): void {
		player.ready();
		this.notifier.sendPlayerChange(player, PlayerRoomState.READY);
	}

	notReady(player: Client): void {
		this.mutex.runExclusive(() => {
			this.notReadyUnsafe(player);
		});
	}

	notReadyUnsafe(player: Client): void {
		player.notReady();
		this.notifier.sendPlayerChange(player, PlayerRoomState.NOT_READY);
	}

	addKick(client: Client): void {
		this._kick.push(client);
	}

	get allPlayersReady(): boolean {
		return this._players.every((player) => player.isReady);
	}

	get kick(): Client[] {
		return this._kick;
	}
	//********************************************************************************************* */
	//**********************************END PLAYER STATES****************************************** */
	//********************************************************************************************* */

	get replay(): Replay {
		return this._replay;
	}

	get banListName(): string | null {
		return edoproBanListCatalog().findByHash(this.banListHash)?.name ?? null;
	}

	setDecksToPlayer(position: number, deck: Deck): void {
		this.mutex.runExclusive(() => {
			this.setDecksToPlayerUnsafe(position, deck);
		});
	}

	setDecksToPlayerUnsafe(position: number, deck: Deck): void {
		const client = this._players.find((client) => client.position === position);
		if (!client || !(client instanceof Client)) {
			return;
		}
		if (this.noShuffle) {
			deck.main.reverse();
			client.setDeck(deck);

			return;
		}

		shuffle(deck.main);
		client.setDeck(deck);
	}

	setDuel(duel: ChildProcessWithoutNullStreams): void {
		this.core.attach(duel);
	}

	//********************************************************************************************* */
	//*****************************************ROOM STATES***************************************** */
	//********************************************************************************************* */
	waiting(): void {
		this.roomState?.removeAllListener();
		this.roomState = new WaitingState(
			this.emitter,
			this.logger,
			this.deps.createPlayerAuthenticator(),
			this.deps.createDeckBuilder(this.deckRules, this.duelFlag),
		);
	}

	dueling(): void {
		this._state = DuelState.DUELING;
		this.isStart = "start";
		this.roomState?.removeAllListener();
		this.roomState = new DuelingState(
			this.emitter,
			this.logger,
			this.deps.createReconnector(),
			this.deps.createSpectatorJoiner(),
			this,
			new JSONMessageProcessor(),
			this.deps.finishDuel,
		);
	}

	sideDecking(): void {
		this._state = DuelState.SIDE_DECKING;
		this.roomState?.removeAllListener();
		this.roomState = new SideDeckingState(
			this.emitter,
			this.logger,
			this.deps.createReconnector(),
			this.deps.createSpectatorJoiner(),
			this.deps.createDeckBuilder(this.deckRules, this.duelFlag),
		);
	}

	rps(): void {
		this.mutex.runExclusive(() => {
			this.rpsUnsafe();
		});
	}

	rpsUnsafe(): void {
		this._state = DuelState.RPS;
		this.roomState?.removeAllListener();
		this.roomState = new RockPaperScissorState(
			this.emitter,
			this.logger,
			this.deps.createReconnector(),
			this.deps.createSpectatorJoiner(),
		);
	}

	choosingOrder(): void {
		this._state = DuelState.CHOOSING_ORDER;
		this.roomState?.removeAllListener();
		this.roomState = new ChossingOrderState(
			this.emitter,
			this.logger,
			this.deps.createReconnector(),
			this.deps.createSpectatorJoiner(),
		);
	}

	//********************************************************************************************* */
	//*************************************END ROOM STATES***************************************** */
	//********************************************************************************************* */

	cacheTeamMessage(team: number, message: Buffer, all: boolean, position: number | null): void {
		if (team === 3) {
			this._spectatorCache.push(message);

			return;
		}

		if (message[2] !== 0x01) {
			return;
		}

		if (position !== null) {
			const player = this.players.find((client: Client) => client.position === position);
			player?.setLastMessage(message);

			return;
		}

		if (!all) {
			const player = this.players.find((client: Client) => client.team === team && client.inTurn);
			player?.setLastMessage(message);

			return;
		}

		const players = this.players.filter((client: Client) => client.team === team);
		players.forEach((player: Client) => {
			player.setLastMessage(message);
		});
	}

	setPlayerDecksSize(mainSize: number, extraSize: number): void {
		this._playerExtraDeckSize = extraSize;
		this._playerMainDeckSize = mainSize;
	}

	setOpponentDecksSize(mainSize: number, extraSize: number): void {
		this._opponentExtraDeckSize = extraSize;
		this._opponentMainDeckSize = mainSize;
	}

	private get isRelay(): boolean {
		return (this.duelFlagsLow & 0x80) !== 0;
	}

	get playerMainDeckSize(): number {
		return this._playerMainDeckSize;
	}

	get playerExtraDeckSize(): number {
		return this._playerExtraDeckSize;
	}

	get opponentMainDeckSize(): number {
		return this._opponentMainDeckSize;
	}

	get opponentExtraDeckSize(): number {
		return this._opponentExtraDeckSize;
	}

	prepareTurnOrder(): void {
		prepareTurnOrder(this.players as Client[], {
			team0: this.team0,
			team1: this.team1,
			isRelay: this.isRelay,
			firstToPlay: this.firstToPlay,
		});
	}

	nextTurn(team: number): void {
		nextTurn(this.players as Client[], team);
	}

	calculateTimeReceiver(team: number): number {
		if (this.firstToPlay === 0) {
			return team;
		}

		return Number(!team);
	}

	//********************************************************************************************* */
	//**********************************************TIMERS***************************************** */
	//********************************************************************************************* */

	stopTimer(team: number): void {
		this.timers[team].stop();
	}

	startTimer(team: number): void {
		this.timers[team].start();
	}

	resetTimer(team: number, time: number): void {
		this.timers[team].reset(time * 1000);
	}

	getTime(team: Team): number {
		return Math.ceil(this.timers[team].time);
	}

	startRoomTimer(): void {
		this.roomTimer.start();
	}

	resetRoomTimer(): void {
		this.roomTimer.reset();
	}

	stopRoomTimer(): void {
		this.roomTimer.stop();
	}

	//********************************************************************************************* */
	//******************************************END TIMERS***************************************** */
	//********************************************************************************************* */

	public sendMessageToCpp(message: string): void {
		this.core.send(message);
	}

	public recordCppStdoutChunk(byteLength: number): void {
		this.core.recordStdoutChunk(byteLength);
	}

	public recordCppFrameProcessed(): void {
		this.core.recordFrameProcessed();
	}

	public recordCppParseError(): void {
		this.core.recordParseError();
	}

	public recordCppDeferredProcessTick(): void {
		this.core.recordDeferredProcessTick();
	}

	setLastPhaseMessage(message: Buffer): void {
		this._lastPhase = message;
	}

	get lastPhaseMessage(): Buffer | null {
		return this._lastPhase;
	}

	toPresentation(): { [key: string]: unknown } {
		return {
			roomid: this.id,
			roomname: this.name,
			roomnotes: this.notes,
			roommode: this.mode,
			needpass: this.needPass,
			team1: this.team0,
			team2: this.team1,
			best_of: this.bestOf,
			duel_flag: Number(this.duelFlag),
			forbidden_types: this.forbiddenTypes,
			extra_rules: this.extraRules,
			start_lp: this.startLp,
			start_hand: this.startHand,
			draw_count: this.drawCount,
			time_limit: this.timeLimit,
			rule: this.deckRules.rule,
			no_check: this.noCheck,
			no_shuffle: this.noShuffle,
			banlist_hash: this.banListHash,
			istart: this.isStart,
			main_min: this.deckRules.mainMin,
			main_max: this.deckRules.mainMax,
			extra_min: this.deckRules.extraMin,
			extra_max: this.deckRules.extraMax,
			side_min: this.deckRules.sideMin,
			side_max: this.deckRules.sideMax,
			users: this.players.map((player) => ({
				name: player.name.replace(/\0/g, "").trim(),
				pos: player.position,
			})),
		};
	}

	destroy(): void {
		this.mutex.runExclusive(() => {
			this.emitter.removeAllListeners();
			this.roomState?.removeAllListener();
			this.timers.forEach((timer) => {
				timer.stop();
			});
			this.roomTimer.stop();
			if (this.core.isAttached) {
				this.sendMessageToCpp(
					JSON.stringify({
						command: "DESTROY_DUEL",
						data: {},
					}),
				);
			}

			this._players.forEach((client: Client) => {
				client.socket.destroy();
			});
			this._spectators.forEach((client) => {
				client.socket.destroy();
			});
			this.clearSpectatorCache();

			if (this._replay) {
				this._replay.destroy();
			}
			this.roomTimer.stop();
			this.core.stopMetricsReporting();
		});
	}

	notifyToAllLobbyClients(client: Client): void {
		this._players.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = (<Client | undefined>(
					this._players.find((item: Client) => item.position === _client.position)
				))?.isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				client.sendMessage(PlayerEnterClientMessage.create(_client.name, _client.position));
				client.sendMessage(PlayerChangeClientMessage.create({ status }));
			}
		});
	}

	notifyToAllPlayers(client: Client): void {
		this.mutex.runExclusive(() => {
			this._players.forEach((item) => {
				const status = (item.position << 4) | 0x09;
				client.sendMessage(PlayerEnterClientMessage.create(item.name, item.position));
				client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});
		});
	}

	sendSpectatorCount({ enqueue = false }: { enqueue: boolean }): void {
		if (!enqueue) {
			this.notifier.sendSpectatorCount(this._spectators.length);

			return;
		}
		this.mutex.runExclusive(() => {
			this.notifier.sendSpectatorCount(this._spectators.length);
		});
	}

	async nextSpectatorPosition(): Promise<number> {
		return this.mutex.runExclusive(() => {
			return this.nextSpectatorPositionUnsafe();
		});
	}

	private extractDeckPoints(notes?: string): number | undefined {
		if (!notes) {
			return undefined;
		}
		const match = notes.match(/points\s*=\s*(\d+)/i);

		return match ? Number(match[1]) : undefined;
	}

	private nextSpectatorPositionUnsafe(): number {
		if (this._spectators.length === 0) {
			return 8;
		}
		const sorted = [...this._spectators].sort((a, b) => b.position - a.position);

		return sorted[0].position + 1;
	}
}
