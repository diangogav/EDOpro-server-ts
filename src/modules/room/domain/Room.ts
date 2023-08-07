import { ChildProcessWithoutNullStreams } from "child_process";
import shuffle from "shuffle-array";

import { Client } from "../../client/domain/Client";
import { Deck } from "../../deck/domain/Deck";
import { FinishDuelHandler } from "../../messages/application/FinishDuelHandler";
import { MessageProcessor } from "../../messages/application/MessageHandler/MessageProcessor";
import { RoomMessageHandler } from "../../messages/application/RoomMessageHandler/RoomMessageHandler";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Replay } from "../../replay/Replay";
import RoomList from "../infrastructure/RoomList";
import { Match, MatchHistory, Player } from "../match/domain/Match";
import { DuelFinishReason } from "./DuelFinishReason";
import { Timer } from "./Timer";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

export enum Rule {
	ONLY_OCG,
	ONLY_TCG,
	OCG_TCG,
	PRE_RELEASE,
	ALL,
}

export class DeckRules {
	public readonly mainMin: number;
	public readonly mainMax: number;
	public readonly extraMin: number;
	public readonly extraMax: number;
	public readonly sideMin: number;
	public readonly sideMax: number;
	public readonly rule: Rule;

	constructor({
		mainMin,
		mainMax,
		extraMin,
		extraMax,
		sideMin,
		sideMax,
		rule,
	}: {
		mainMin: number;
		mainMax: number;
		extraMin: number;
		extraMax: number;
		sideMin: number;
		sideMax: number;
		rule: number;
	}) {
		this.mainMin = mainMin;
		this.mainMax = mainMax;
		this.extraMin = extraMin;
		this.extraMax = extraMax;
		this.sideMin = sideMin;
		this.sideMax = sideMax;
		this.rule = rule;
	}
}
interface RoomAttr {
	id: number;
	name: string;
	notes: string;
	mode: number;
	needPass: boolean;
	team0: number;
	team1: number;
	bestOf: number;
	duelFlag: number;
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
	banlistHash: number;
	isStart: string;
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

export enum DuelState {
	WAITING = "waiting",
	DUELING = "dueling",
	RPS = "rps",
	CHOOSING_ORDER = "choosingOrder",
	SIDE_DECKING = "sideDecking",
}

export class Room {
	public readonly id: number;
	public readonly name: string;
	public readonly notes: string;
	public readonly mode: number;
	public readonly needPass: boolean;
	public readonly team0: number;
	public readonly team1: number;
	public readonly bestOf: number;
	public readonly duelFlag: number;
	public readonly duelFlagsLow: number;
	public readonly duelFlagsHight: number;
	public readonly forbiddenTypes: number;
	public readonly extraRules: number;
	public readonly startLp: number;
	public readonly startHand: number;
	public readonly drawCount: number;
	public readonly timeLimit: number;
	public readonly noCheck: boolean;
	public readonly noShuffle: boolean;
	public readonly banlistHash: number;
	public readonly deckRules: DeckRules;
	public readonly duelRule: number;
	public readonly handshake: number;
	public readonly password: string;
	public readonly ranked: boolean;
	private _replay: Replay;
	private isStart: string;
	private _spectatorCache: Buffer[] = [];
	private _clients: Client[] = [];
	private _spectators: Client[] = [];
	private readonly _kick: Client[] = [];
	private _duel?: ChildProcessWithoutNullStreams;
	private _match: Match | null;
	private _state: DuelState;
	private _clientWhoChoosesTurn: Client;
	private readonly _lastMessageToTeam: { team: number; message: Buffer }[] = [];
	private _playerMainDeckSize: number;
	private _playerExtraDeckSize: number;
	private _opponentMainDeckSize: number;
	private _opponentExtraDeckSize: number;
	private _turn = 0;
	private _firstToPlay: number;
	private readonly t0Positions: number[] = [];
	private readonly t1Positions: number[] = [];
	private readonly timers: Timer[];
	private readonly roomTimer: Timer;

	private constructor(attr: RoomAttr) {
		this.id = attr.id;
		this.name = attr.name;
		this.notes = attr.notes;
		this.mode = attr.mode;
		this.needPass = attr.needPass;
		this.team0 = attr.team0;
		this.team1 = attr.team1;
		this.bestOf = attr.bestOf;
		this.duelFlag = attr.duelFlag;
		this.forbiddenTypes = attr.forbiddenTypes;
		this.extraRules = attr.extraRules;
		this.startLp = attr.startLp;
		this.startHand = attr.startHand;
		this.drawCount = attr.drawCount;
		this.timeLimit = attr.timeLimit;
		this.noCheck = attr.noCheck;
		this.noShuffle = attr.noShuffle;
		this.banlistHash = attr.banlistHash;
		this.isStart = attr.isStart;
		this.deckRules = new DeckRules({
			mainMin: attr.mainMin,
			mainMax: attr.mainMax,
			sideMin: attr.sideMin,
			sideMax: attr.sideMax,
			extraMin: attr.extraMin,
			extraMax: attr.extraMax,
			rule: attr.rule,
		});
		this.duelRule = attr.duelRule;
		this.handshake = attr.handshake;
		this.password = attr.password;
		this._duel = attr.duel;
		this._state = DuelState.WAITING;
		this.duelFlagsLow = attr.duelFlagsLow;
		this.duelFlagsHight = attr.duelFlagsHight;
		this.t0Positions = Array.from({ length: this.team0 }, (_, index) => index);
		this.t1Positions = Array.from({ length: this.team1 }, (_, index) => this.team0 + index);
		this.timers = [
			new Timer(this.timeLimit * 1000, () => {
				const finishDuelHandler = new FinishDuelHandler({
					reason: DuelFinishReason.SURRENDERED,
					winner: 1,
					room: this,
				});

				void finishDuelHandler.run();
			}),
			new Timer(this.timeLimit * 1000, () => {
				const finishDuelHandler = new FinishDuelHandler({
					reason: DuelFinishReason.SURRENDERED,
					winner: 0,
					room: this,
				});

				void finishDuelHandler.run();
			}),
		];

		this.roomTimer = new Timer(this.timeLimit * 2 * 1000, () => {
			RoomList.deleteRoom(this);
		});
		this.ranked = attr.ranked;
		this.resetReplay();
	}

	static createFromCreateGameMessage(
		message: CreateGameMessage,
		playerInfo: PlayerInfoMessage,
		id: number
	): Room {
		return new Room({
			id,
			name: message.name,
			notes: message.notes,
			mode: message.mode,
			needPass: Buffer.from(message.password).some((element) => element !== 0x00),
			team0: message.t0Count,
			team1: message.t1Count,
			bestOf: message.bestOf,
			duelFlag: message.duelFlagsLow | (message.duelFlagsHight << 32),
			forbiddenTypes: message.forbidden,
			extraRules: message.extraRules,
			startLp: message.lp,
			startHand: message.startingHandCount,
			drawCount: message.drawCount,
			timeLimit: message.timeLimit,
			rule: message.allowed,
			noCheck: Boolean(message.dontCheckDeckContent),
			noShuffle: Boolean(message.dontShuffleDeck),
			banlistHash: message.banList,
			isStart: "waiting",
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
			ranked: Boolean(playerInfo.password),
		});
	}

	resetReplay(): void {
		this._replay = new Replay({
			startingDrawCount: this.startHand,
			startingLp: this.startLp,
			flags: this.duelFlag,
			drawCountPerTurn: this.drawCount,
		});
	}

	duelWinner(winner: number): void {
		if (!this._match) {
			return;
		}
		this._match.duelWinner(winner);
	}

	isMatchFinished(): boolean {
		if (!this._match) {
			return true;
		}

		return this._match.isFinished();
	}

	createMatch(): void {
		this._match = new Match({ bestOf: this.bestOf });
	}

	initializeHistoricalData(): void {
		const players = this.clients.map((client) => ({
			team: client.team,
			name: client.name,
			deck: client.deck,
		}));
		this._match?.initializeHistoricalData(players);
	}

	matchScore(): { team0: number; team1: number } {
		if (!this._match) {
			return {
				team0: 0,
				team1: 0,
			};
		}

		return this._match.score;
	}

	get matchPlayersHistory(): (Player & MatchHistory & { winner: boolean })[] {
		return this._match?.playersHistory ?? [];
	}

	addClient(client: Client): void {
		this._clients.push(client);
		const messageProcessor = new MessageProcessor();

		client.socket.on("data", (data) => {
			messageProcessor.read(data);
			this.handleMessage(messageProcessor, client);
		});
	}

	addSpectator(client: Client): void {
		this._spectators.push(client);
	}

	get replay(): Replay {
		return this._replay;
	}

	get spectators(): Client[] {
		return this._spectators;
	}

	addKick(client: Client): void {
		this._kick.push(client);
	}

	get kick(): Client[] {
		return this._kick;
	}

	setDecksToPlayer(position: number, deck: Deck): void {
		const client = this._clients.find((client) => client.position === position);
		if (!client) {
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
		this._duel = duel;
		this._duel.stdin.on("error", (err) => {
			console.error("Error al escribir en el proceso secundario:", err.message);
			// Volver a intentar la escritura después de un breve retraso
			this.writeToCppProcess("¡Hola desde Node.js!", 3);
		});
	}

	get duel(): ChildProcessWithoutNullStreams | null {
		if (!this._duel) {
			return null;
		}

		return this._duel;
	}

	dueling(): void {
		this._state = DuelState.DUELING;
		this.isStart = "start";
	}

	sideDecking(): void {
		this._state = DuelState.SIDE_DECKING;
	}

	rps(): void {
		this._state = DuelState.RPS;
	}

	choosingOrder(): void {
		this._state = DuelState.CHOOSING_ORDER;
	}

	get duelState(): DuelState {
		return this._state;
	}

	setClientWhoChoosesTurn(client: Client): void {
		this._clientWhoChoosesTurn = client;
	}

	get clientWhoChoosesTurn(): Client {
		return this._clientWhoChoosesTurn;
	}

	removePlayer(player: Client): void {
		this._clients = this._clients.filter((item) => item.socket.id !== player.socket.id);
	}

	removeSpectator(spectator: Client): void {
		this._spectators = this._spectators.filter((item) => item.socket.id !== spectator.socket.id);
	}

	get clients(): Client[] {
		return this._clients;
	}

	cacheTeamMessage(team: number, message: Buffer): void {
		if (team === 3) {
			this._spectatorCache.push(message);

			return;
		}

		if (message[2] === 0x01) {
			const players = this.clients.filter((client) => client.team === team);
			players.forEach((player) => {
				player.setLastMessage(message);
			});
		}
	}

	get spectatorCache(): Buffer[] {
		return this._spectatorCache;
	}

	clearSpectatorCache(): void {
		this._spectatorCache = [];
	}

	setPlayerDecksSize(mainSize: number, extraSize: number): void {
		this._playerExtraDeckSize = extraSize;
		this._playerMainDeckSize = mainSize;
	}

	setOpponentDecksSize(mainSize: number, extraSize: number): void {
		this._opponentExtraDeckSize = extraSize;
		this._opponentMainDeckSize = mainSize;
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

	increaseTurn(): void {
		this._turn++;
	}

	get turn(): number {
		return this._turn;
	}

	setFirstToPlay(team: number): void {
		this._firstToPlay = team;
	}

	get firstToPlay(): number {
		return this._firstToPlay;
	}

	nextAvailablePosition(position: number): { position: number; team: number } | null {
		const positions = [...this.t1Positions, ...this.t0Positions].sort((a, b) => a - b);
		const ocuppiedPositions = this.clients.map((client) => client.position);
		const difference = this.getDifference(positions, ocuppiedPositions);
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

	calculaPlace(): { position: number; team: number } | null {
		const team0 = this.clients
			.filter((client) => client.team === 0)
			.map((client) => client.position);

		const availableTeam0Positions = this.getDifference(this.t0Positions, team0);

		if (availableTeam0Positions.length > 0) {
			return {
				position: availableTeam0Positions[0],
				team: 0,
			};
		}

		const team1 = this.clients
			.filter((client) => client.team === 1)
			.map((client) => client.position);

		const availableTeam1Positions = this.getDifference(this.t1Positions, team1);

		if (availableTeam1Positions.length > 0) {
			return {
				position: availableTeam1Positions[0],
				team: 1,
			};
		}

		return null;
	}

	prepareTurnOrder(): void {
		const team0Players = this.clients.filter((player) => player.team === 0);
		const team1Players = this.clients.filter((player) => player.team === 1);

		if (this.firstToPlay === 0) {
			team0Players.forEach((item) => {
				item.setDuelPosition(item.position % this.team0);
				item.clearTurn();
			});

			team1Players.forEach((item, index) => {
				item.setDuelPosition((team1Players.length - index - 1) % this.team1);
				item.clearTurn();
			});
		} else {
			team0Players.forEach((item, index) => {
				item.setDuelPosition((team0Players.length - index - 1) % this.team0);
				item.clearTurn();
			});

			team1Players.forEach((item) => {
				item.setDuelPosition(item.position % this.team1);
				item.clearTurn();
			});
		}

		const team0Player = team0Players.find((player) => player.duelPosition === 0);
		team0Player?.turn();

		const team1Player = team1Players.find((player) => player.duelPosition === 0);
		team1Player?.turn();
	}

	nextTurn(team: number): void {
		const player = this.clients.find((player) => player.inTurn && player.team === team);
		if (!player) {
			return;
		}
		const teamCount = team === 0 ? this.team0 : this.team1;
		const duelPLayerPositionTurn = (player.duelPosition + 1) % teamCount;
		const nextPlayer = this.clients.find(
			(player) => player.duelPosition === duelPLayerPositionTurn && player.team === team
		);
		if (!nextPlayer) {
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

	stopTimer(team: number): void {
		this.timers[team].stop();
	}

	startTimer(team: number): void {
		this.timers[team].start();
	}

	resetTimer(team: number, time: number): void {
		this.timers[team].reset(time * 1000);
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

	playerNames(team: number): string {
		return this.clients
			.filter((player) => player.team === team)
			.map((item) => `${item.name} ${item.socket.remoteAddress ?? ""}`)
			.join(",");
	}

	nextSpectatorPosition(): number {
		const sorted = [...this.spectators].sort((a, b) => b.position - a.position);

		return (sorted[0]?.position ?? 7) + 1;
	}

	public sendMessageToCpp(message: string): void {
		this.writeToCppProcess(message, 3);
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
			duel_flag: this.duelFlag,
			forbidden_types: this.forbiddenTypes,
			extra_rules: this.extraRules,
			start_lp: this.startLp,
			start_hand: this.startHand,
			draw_count: this.drawCount,
			time_limit: this.timeLimit,
			rule: this.deckRules.rule,
			no_check: this.noCheck,
			no_shuffle: this.noShuffle,
			banlist_hash: this.banlistHash,
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

	private writeToCppProcess(messageToCpp: string, retryCount: number): void {
		if (retryCount <= 0) {
			console.error(
				"Error: No se pudo escribir en el proceso secundario después de varios intentos."
			);

			return;
		}

		const message = `${messageToCpp}\n`;
		const success = this.duel?.stdin.write(message);

		if (!success) {
			console.error("Advertencia: La escritura no fue exitosa, reintentando...");
			setTimeout(() => {
				this.writeToCppProcess(messageToCpp, retryCount - 1);
			}, 100);
		}
	}

	private getDifference(a: number[], b: number[]) {
		return a.filter((item) => !b.includes(item));
	}

	private handleMessage(messageProcessor: MessageProcessor, client: Client) {
		if (!messageProcessor.isMessageReady()) {
			return;
		}

		messageProcessor.process();
		const messageHandler = new RoomMessageHandler(
			messageProcessor.payload,
			client,
			this._clients,
			this
		);

		messageHandler.read();

		this.handleMessage(messageProcessor, client);
	}
}
