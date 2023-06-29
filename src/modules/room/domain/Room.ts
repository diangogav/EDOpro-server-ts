import { ChildProcessWithoutNullStreams } from "child_process";

import { Client } from "../../client/domain/Client";
import { Deck } from "../../deck/domain/Deck";
import { RoomMessageHandler } from "../../messages/application/RoomMessageHandler/RoomMessageHandler";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { Match } from "./Match";

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
}

export enum DuelState {
	WAITING = "waiting",
	DUELING = "dueling",
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
	public readonly rule: number;
	public readonly noCheck: boolean;
	public readonly noShuffle: boolean;
	public readonly banlistHash: number;
	public readonly isStart: string;
	public readonly mainMin: number;
	public readonly mainMax: number;
	public readonly extraMin: number;
	public readonly extraMax: number;
	public readonly sideMin: number;
	public readonly sideMax: number;
	public readonly duelRule: number;
	public readonly handshake: number;
	public readonly password: string;
	private readonly duelCache: Buffer[][] = [];
	private _clients: Client[] = [];
	private _spectators: Client[] = [];
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
		this.rule = attr.rule;
		this.noCheck = attr.noCheck;
		this.noShuffle = attr.noShuffle;
		this.banlistHash = attr.banlistHash;
		this.isStart = attr.isStart;
		this.mainMin = attr.mainMin;
		this.mainMax = attr.mainMax;
		this.extraMin = attr.extraMin;
		this.extraMax = attr.extraMax;
		this.sideMin = attr.sideMin;
		this.sideMax = attr.sideMax;
		this.duelRule = attr.duelRule;
		this.handshake = attr.handshake;
		this.password = attr.password;
		this._duel = attr.duel;
		this._state = DuelState.WAITING;
		this.duelCache[0] = [];
		this.duelCache[1] = [];
		this.duelCache[2] = [];
		this.duelCache[3] = [];
		this.duelFlagsLow = attr.duelFlagsLow;
		this.duelFlagsHight = attr.duelFlagsHight;
		this.t0Positions = Array.from({ length: this.team0 }, (_, index) => index);
		this.t1Positions = Array.from({ length: this.team1 }, (_, index) => this.team0 + index);
	}

	static createFromCreateGameMessage(
		message: CreateGameMessage,
		playerName: string,
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

	matchScore(): { team0: number; team1: number } {
		if (!this._match) {
			return {
				team0: 0,
				team1: 0,
			};
		}

		return this._match.score;
	}

	addClient(client: Client): void {
		this._clients.push(client);
		client.socket.on("data", (data) => {
			const messageHandler = new RoomMessageHandler(data, client, this._clients, this);
			messageHandler.read();
		});
	}

	addSpectator(client: Client): void {
		this._spectators.push(client);
	}

	get spectators(): Client[] {
		return this._spectators;
	}

	setDecksToPlayer(position: number, deck: Deck): void {
		const client = this._clients.find((client) => client.position === position);
		if (!client) {
			return;
		}
		client.setDeck(deck);
	}

	setDuel(duel: ChildProcessWithoutNullStreams): void {
		this._duel = duel;
	}

	get duel(): ChildProcessWithoutNullStreams | null {
		if (!this._duel) {
			return null;
		}

		return this._duel;
	}

	dueling(): void {
		this._state = DuelState.DUELING;
	}

	sideDecking(): void {
		this._state = DuelState.SIDE_DECKING;
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
		if (team !== 1 && team !== 2) {
			this.duelCache[team].push(message);

			return;
		}

		if (message[2] === 0x01) {
			this.duelCache[team].push(message);
			const players = this.clients.filter((client) => client.team === team);
			players.forEach((player) => {
				player.cache.push(message);
			});
		}
	}

	get spectatorCache(): Buffer[] {
		return this.duelCache[3];
	}

	getplayerCache(team: number): Buffer[] {
		return this.duelCache[team];
	}

	clearSpectatorCache(): void {
		this.duelCache[3] = [];
	}

	clearPlayersCache(): void {
		this.duelCache[0] = [];
		this.duelCache[1] = [];
	}

	setLastMessageToTeam(team: number, message: Buffer): void {
		this._lastMessageToTeam.push({ team, message });
	}

	get lastMessageToTeam(): { team: number; message: Buffer } {
		return this._lastMessageToTeam[this._lastMessageToTeam.length];
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

		team0Players.forEach((item) => {
			item.setDuelPosition(item.position % this.team0);
		});

		const team1Players = this.clients.filter((player) => player.team === 1);

		team1Players.forEach((item) => {
			item.setDuelPosition(item.position % this.team1);
		});

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
			rule: this.rule,
			no_check: this.noCheck,
			no_shuffle: this.noShuffle,
			banlist_hash: this.banlistHash,
			istart: this.isStart,
			main_min: this.mainMin,
			main_max: this.mainMax,
			extra_min: this.extraMin,
			extra_max: this.extraMax,
			side_min: this.sideMin,
			side_max: this.sideMax,
			users: this.clients.map((player) => ({
				name: player.name.replace(/\0/g, "").trim(),
				pos: player.position,
			})),
		};
	}

	private getDifference(a: number[], b: number[]) {
		return a.filter((item) => !b.includes(item));
	}
}
