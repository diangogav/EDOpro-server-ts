import { PlayerChangeClientMessage } from "@edopro/messages/server-to-client/PlayerChangeClientMessage";
import { ChildProcessWithoutNullStreams } from "child_process";
import shuffle from "shuffle-array";
import { PlayerEnterClientMessage } from "src/shared/messages/server-to-client/PlayerEnterClientMessage";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { EventEmitter } from "stream";

import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { DuelState, YgoRoom } from "../../../shared/room/domain/YgoRoom";
import { Team } from "../../../shared/room/Team";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { CardSQLiteTYpeORMRepository } from "../../card/infrastructure/sqlite/CardSQLiteTYpeORMRepository";
import { Client } from "../../client/domain/Client";
import { DeckCreator } from "../../deck/application/DeckCreator";
import { Deck } from "../../deck/domain/Deck";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { JSONMessageProcessor } from "../../messages/JSONMessageProcessor";
import { MessageProcessor } from "../../messages/MessageProcessor";
import { Replay } from "../../replay/Replay";
import { RoomMessageEmitter } from "../../RoomMessageEmitter";
import { FinishDuelHandler } from "../application/FinishDuelHandler";
import { JoinToDuelAsSpectator } from "../application/JoinToDuelAsSpectator";
import { Reconnect } from "../application/Reconnect";
import RoomList from "../infrastructure/RoomList";
import { DuelFinishReason } from "./DuelFinishReason";
import { PlayerRoomState } from "./PlayerRoomState";
import { RoomClientNotifier } from "./RoomClientNotifier";
import { RoomState } from "./RoomState";
import { ChossingOrderState } from "./states/chossing-order/ChossingOrderState";
import { DuelingState } from "./states/dueling/DuelingState";
import { RockPaperScissorState } from "./states/rps/RockPaperScissorsState";
import { SideDeckingState } from "./states/side-decking/SideDeckingState";
import { WaitingState } from "./states/waiting/WaitingState";
import { Timer } from "./Timer";

export enum Rule {
	ONLY_OCG,
	ONLY_TCG,
	OCG_TCG,
	PRE_RELEASE,
	ALL,
}

const CHILD_PROCESS_RETRY_MAX = 3;

export class DeckRules {
	public readonly mainMin: number;
	public readonly mainMax: number;
	public readonly extraMin: number;
	public readonly extraMax: number;
	public readonly sideMin: number;
	public readonly sideMax: number;
	public readonly rule: Rule;
	public readonly maxDeckPoints: number;

	constructor({
		mainMin,
		mainMax,
		extraMin,
		extraMax,
		sideMin,
		sideMax,
		rule,
		maxDeckPoints,
	}: {
		mainMin: number;
		mainMax: number;
		extraMin: number;
		extraMax: number;
		sideMin: number;
		sideMax: number;
		rule: number;
		maxDeckPoints?: number;
	}) {
		this.mainMin = mainMin;
		this.mainMax = mainMax;
		this.extraMin = extraMin;
		this.extraMax = extraMax;
		this.sideMin = sideMin;
		this.sideMax = sideMax;
		this.rule = rule;
		this.maxDeckPoints = maxDeckPoints ?? 100;
	}
}
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
	private _duel?: ChildProcessWithoutNullStreams;
	private _lastPhase: Buffer | null = null;
	private _playerMainDeckSize: number;
	private _playerExtraDeckSize: number;
	private _opponentMainDeckSize: number;
	private _opponentExtraDeckSize: number;
	private readonly _turn = 0;
	private readonly timers: Timer[];
	private readonly roomTimer: Timer;
	private roomState: RoomState | null = null;
	private logger: Logger;
	private readonly checkIfUserCanReconnect: CheckIfUseCanJoin;
	private readonly notifier: RoomClientNotifier;

	private constructor(attr: RoomAttr) {
		super({
			id: attr.id,
			team0: attr.team0,
			team1: attr.team1,
			ranked: attr.ranked,
			bestOf: attr.bestOf,
			startLp: attr.startLp,
			notes: attr.notes,
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
		this._duel = attr.duel;
		this._state = DuelState.WAITING;
		this.duelFlagsLow = attr.duelFlagsLow;
		this.duelFlagsHight = attr.duelFlagsHight;
		this.timers = [
			new Timer(this.timeLimit * 1000, () => {
				const finishDuelHandler = new FinishDuelHandler({
					reason: DuelFinishReason.TIMEOUT,
					winner: 1,
					room: this,
				});

				void finishDuelHandler.run();
			}),
			new Timer(this.timeLimit * 1000, () => {
				const finishDuelHandler = new FinishDuelHandler({
					reason: DuelFinishReason.TIMEOUT,
					winner: 0,
					room: this,
				});

				void finishDuelHandler.run();
			}),
		];

		this.roomTimer = new Timer(this.timeLimit * 2 * 1000, () => {
			RoomList.deleteRoom(this);
		});
		this.resetReplay();
		this.checkIfUserCanReconnect = new CheckIfUseCanJoin(
			new UserAuth(new UserProfilePostgresRepository())
		);
		this.notifier = new RoomClientNotifier(
			() => this._clients as Client[],
			() => this._spectators as Client[]
		);
	}

	static create(payload: RoomAttr, emitter: EventEmitter, logger: Logger): Room {
		payload.notes = payload.ranked ? `(Ranked) ${payload.notes}` : payload.notes;
		const room = new Room(payload);
		room.emitter = emitter;
		room.logger = logger.child({ roomId: payload.id });

		return room;
	}

	static createFromCreateGameMessage(
		message: CreateGameMessage,
		playerInfo: PlayerInfoMessage,
		id: number,
		emitter: EventEmitter,
		logger: Logger
	): Room {
		const ranked = Room.isRanked(playerInfo.password);

		const room = new Room({
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
		});

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
		const host = this._clients.some((client: Client) => client.host);
		const place = await this.calculatePlace();

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
		this.actionQueue.enqueue(() => {
			this._clients.push(client);
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
		});
	}

	async createSpectator(socket: ISocket, name: string): Promise<Client> {
		const position = await this.nextSpectatorPosition();

		const client = new Client({
			id: null,
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
		this.actionQueue.enqueue(() => {
			client.socket.roomId = this.id;
			this._spectators.push(client);

			const messageProcessor = new MessageProcessor();
			const roomMessageEmitter = new RoomMessageEmitter(client, this);

			client.socket.onMessage((data) => {
				roomMessageEmitter.handleMessage(data);
				messageProcessor.read(data);
			});

			this.notifier.sendTypeChange(client, 0x07);
		});
	}

	playerToSpectator(player: Client): void {
		this.actionQueue.enqueue(() => {
			const place = this.nextSpectatorPositionUnsafe();
			this.removePlayerUnsafe(player);
			this._spectators.push(player);
			this.notifier.sendPlayerChange(player, PlayerRoomState.SPECTATE);
			player.spectatorPosition(place);
			player.notReady();
			this.notifier.sendTypeChange(player);
			this.sendSpectatorCount({ enqueue: false });
		});
	}

	spectatorToPlayer(player: Client): void {
		this.actionQueue.enqueue(() => {
			const place = this.calculatePlaceUnsafe();
			if (!place) {
				return;
			}
			this.removeSpectatorUnsafe(player);
			this._clients.push(player);
			this.notifier.sendPlayerEnter(player, place);
			this.notifier.sendPlayerChange(player, PlayerRoomState.NOT_READY);
			this.sendSpectatorCount({ enqueue: false });
			player.playerPosition(place.position, place.team);
			player.notReady();
			this.notifier.sendTypeChange(player);
		});
	}

	movePlayerToAnotherCell(player: Client): void {
		this.actionQueue.enqueue(() => {
			const nextPlace = this.nextAvailablePosition(player.position);
			if (!nextPlace) {
				return;
			}
			player.notReady();
			this.notifier.sendPlayerCellChange(player, nextPlace);
			this.notifier.sendPlayerChange(player, PlayerRoomState.NOT_READY);
			player.playerPosition(nextPlace.position, nextPlace.team);
			this.notifier.sendTypeChange(player);
		});
	}

	removeSpectator(spectator: Client): void {
		this.actionQueue.enqueue(() => {
			const filtered = this._spectators.filter((item) => item.socket.id !== spectator.socket.id);
			this._spectators = filtered;
		});
	}
	//********************************************************************************************* */
	//**********************************END CLIENTS CRUD******************************************* */
	//********************************************************************************************* */

	//********************************************************************************************* */
	//**************************************PLAYER STATES****************************************** */
	//********************************************************************************************* */

	ready(player: Client): void {
		this.actionQueue.enqueue(() => {
			player.ready();
			this.notifier.sendPlayerChange(player, PlayerRoomState.READY);
		});
	}

	notReady(player: Client): void {
		this.actionQueue.enqueue(() => {
			player.notReady();
			this.notifier.sendPlayerChange(player, PlayerRoomState.NOT_READY);
		});
	}

	addKick(client: Client): void {
		this._kick.push(client);
	}

	get allPlayersReady(): boolean {
		return this._clients.every((player) => player.isReady);
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

	setDecksToPlayer(position: number, deck: Deck): void {
		this.actionQueue.enqueue(() => {
			const client = this._clients.find((client) => client.position === position);
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
		});
	}

	setDuel(duel: ChildProcessWithoutNullStreams): void {
		this._duel = duel;
		this._duel.stdin.on("error", (error) => {
			this.logger.error("Error writing to the child process");
			this.logger.error(error);
		});
	}

	private get duel(): ChildProcessWithoutNullStreams | null {
		if (!this._duel) {
			return null;
		}

		return this._duel;
	}

	//********************************************************************************************* */
	//*****************************************ROOM STATES***************************************** */
	//********************************************************************************************* */
	waiting(): void {
		this.roomState?.removeAllListener();
		this.roomState = new WaitingState(
			this.emitter,
			this.logger,
			new UserAuth(new UserProfilePostgresRepository()),
			new DeckCreator(new CardSQLiteTYpeORMRepository(), this.deckRules, this.duelFlag)
		);
	}

	dueling(): void {
		this._state = DuelState.DUELING;
		this.isStart = "start";
		this.roomState?.removeAllListener();
		this.roomState = new DuelingState(
			this.emitter,
			this.logger,
			new Reconnect(this.checkIfUserCanReconnect),
			new JoinToDuelAsSpectator(),
			this,
			new JSONMessageProcessor()
		);
	}

	sideDecking(): void {
		this._state = DuelState.SIDE_DECKING;
		this.roomState?.removeAllListener();
		this.roomState = new SideDeckingState(
			this.emitter,
			this.logger,
			new Reconnect(this.checkIfUserCanReconnect),
			new JoinToDuelAsSpectator(),
			new DeckCreator(new CardSQLiteTYpeORMRepository(), this.deckRules, this.duelFlag)
		);
	}

	rps(): void {
		this._state = DuelState.RPS;
		this.roomState?.removeAllListener();
		this.roomState = new RockPaperScissorState(
			this.emitter,
			this.logger,
			new Reconnect(this.checkIfUserCanReconnect),
			new JoinToDuelAsSpectator()
		);
	}

	choosingOrder(): void {
		this._state = DuelState.CHOOSING_ORDER;
		this.roomState?.removeAllListener();
		this.roomState = new ChossingOrderState(
			this.emitter,
			this.logger,
			new Reconnect(this.checkIfUserCanReconnect),
			new JoinToDuelAsSpectator()
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
			const player = this.clients.find((client: Client) => client.position === position);
			player?.setLastMessage(message);

			return;
		}

		if (!all) {
			const player = this.clients.find((client: Client) => client.team === team && client.inTurn);
			player?.setLastMessage(message);

			return;
		}

		const players = this.clients.filter((client: Client) => client.team === team);
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
		const team0Players = this.clients.filter((player: Client) => player.team === 0);
		const team1Players = this.clients.filter((player: Client) => player.team === 1);

		if (this.isRelay) {
			team0Players.forEach((item: Client) => {
				item.setDuelPosition(item.position % this.team0);
				item.clearTurn();
			});

			team1Players.forEach((item: Client) => {
				item.setDuelPosition(item.position % this.team1);
				item.clearTurn();
			});
		} else if (this.firstToPlay === 0) {
			team0Players.forEach((item: Client) => {
				item.setDuelPosition(item.position % this.team0);
				item.clearTurn();
			});

			team1Players.forEach((item: Client) => {
				item.setDuelPosition((item.position + 1) % this.team1);
				item.clearTurn();
			});
		} else {
			team0Players.forEach((item: Client) => {
				item.setDuelPosition((item.position + 1) % this.team0);
				item.clearTurn();
			});

			team1Players.forEach((item: Client) => {
				item.setDuelPosition(item.position % this.team1);
				item.clearTurn();
			});
		}

		const team0Player = team0Players.find((player: Client) => player.duelPosition === 0);
		(<Client | undefined>team0Player)?.turn();

		const team1Player = team1Players.find((player: Client) => player.duelPosition === 0);
		(<Client | undefined>team1Player)?.turn();
	}

	nextTurn(team: number): void {
		const player = this.clients.find((player: Client) => player.inTurn && player.team === team);
		if (!player || !(player instanceof Client)) {
			return;
		}
		const teamCount = team === 0 ? this.team0 : this.team1;
		const duelPLayerPositionTurn = (player.duelPosition + 1) % teamCount;
		const nextPlayer = this.clients.find(
			(player: Client) => player.duelPosition === duelPLayerPositionTurn && player.team === team
		);
		if (!nextPlayer || !(nextPlayer instanceof Client)) {
			return;
		}
		player.clearTurn();
		nextPlayer.turn();
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
		this.writeToCppProcess(message, CHILD_PROCESS_RETRY_MAX);
	}

	isFinished(): boolean {
		return this.currentDuel?.isFinished ?? false;
	}

	finished(): void {
		this.currentDuel?.finished();
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
			users: this.clients.map((player) => ({
				name: player.name.replace(/\0/g, "").trim(),
				pos: player.position,
			})),
		};
	}

	destroy(): void {
		this.actionQueue.enqueue(() => {
			this.emitter.removeAllListeners();
			this.roomState?.removeAllListener();
			this.timers.forEach((timer) => {
				timer.stop();
			});
			this.roomTimer.stop();
			if (this._duel) {
				this.sendMessageToCpp(
					JSON.stringify({
						command: "DESTROY_DUEL",
						data: {},
					})
				);
			}

			this._clients.forEach((client: Client) => {
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
		});
	}

	notifyToAllLobbyClients(client: Client): void {
		this.actionQueue.enqueue(() => {
			this._clients.forEach((_client) => {
				if (_client.socket.id !== client.socket.id) {
					const status = (<Client | undefined>(
						this._clients.find((item: Client) => item.position === _client.position)
					))?.isReady
						? (_client.position << 4) | PlayerRoomState.READY
						: (_client.position << 4) | PlayerRoomState.NOT_READY;

					client.sendMessage(PlayerEnterClientMessage.create(_client.name, _client.position));
					client.sendMessage(PlayerChangeClientMessage.create({ status }));
				}
			});
		});
	}

	notifyToAllPlayers(client: Client): void {
		this.actionQueue.enqueue(() => {
			this._clients.forEach((item) => {
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
		this.actionQueue.enqueue(() => {
			this.notifier.sendSpectatorCount(this._spectators.length);
		});
	}

	async nextSpectatorPosition(): Promise<number> {
		return new Promise((resolve) => {
			this.actionQueue.enqueue(() => {
				resolve(this.nextSpectatorPositionUnsafe());
			});
		});
	}

	private nextAvailablePosition(position: number): { position: number; team: number } | null {
		const positions = [...this.t1Positions, ...this.t0Positions].sort((a, b) => a - b);
		const occupiedPositions = this.clients.map((client) => client.position);
		const difference = this.getDifference(positions, occupiedPositions);
		if (difference.length === 0) {
			return null;
		}

		const nextPositions = difference.filter((item) => item > position);

		if (nextPositions.length > 0) {
			const isTeam0 = this.t0Positions.find((pos) => pos === nextPositions[0]);
			if (isTeam0 !== undefined) {
				return {
					position: nextPositions[0],
					team: 0,
				};
			}

			return {
				position: nextPositions[0],
				team: 1,
			};
		}

		const isTeam0 = this.t0Positions.find((pos) => pos === positions[0]);
		if (isTeam0 !== undefined) {
			return {
				position: difference[0],
				team: 0,
			};
		}

		return {
			position: difference[0],
			team: 1,
		};
	}

	private writeToCppProcess(messageToCpp: string, retryCount: number): void {
		if (retryCount <= 0) {
			this.logger.error("Error: Failed to write to the child process after multiple attempts");

			return;
		}

		const message = `${messageToCpp}\n`;
		const success = this.duel?.stdin.write(message);

		if (!success) {
			this.logger.error(`Warning: Write was unsuccessful, retrying...`);
			setTimeout(() => {
				this.writeToCppProcess(messageToCpp, retryCount - 1);
			}, 100);
		}
	}

	private extractDeckPoints(notes?: string): number | undefined {
		if (!notes) {
			return undefined;
		}
		const match = notes.match(/points\s*=\s*(\d+)/i);

		return match ? Number(match[1]) : undefined;
	}

	private removeSpectatorUnsafe(spectator: Client): void {
		const filtered = this._spectators.filter((item) => item.socket.id !== spectator.socket.id);
		this._spectators = filtered;
	}

	private nextSpectatorPositionUnsafe(): number {
		if (this._spectators.length === 0) {
			return 8;
		}
		const sorted = [...this._spectators].sort((a, b) => b.position - a.position);

		return sorted[0].position + 1;
	}
}
