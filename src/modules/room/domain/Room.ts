import { ChildProcessWithoutNullStreams } from "child_process";

import { Client } from "../../client/domain/Client";
import { Deck } from "../../deck/domain/Deck";
import { RoomMessageHandler } from "../../messages/application/RoomMessageHandler/RoomMessageHandler";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";

interface RoomAttr {
	id: number;
	name: string;
	notes: string;
	mode: number;
	needPass: boolean;
	team1: number;
	team2: number;
	bestOf: number;
	duelFlag: number;
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
	users: Array<{ pos: number; name: string; deck?: Deck }>;
	duel?: ChildProcessWithoutNullStreams;
}

export class Room {
	public readonly id: number;
	public readonly name: string;
	public readonly notes: string;
	public readonly mode: number;
	public readonly needPass: boolean;
	public readonly team1: number;
	public readonly team2: number;
	public readonly bestOf: number;
	public readonly duelFlag: number;
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
	public readonly users: Array<{ pos: number; name: string; deck?: Deck }>;
	public readonly clients: Client[] = [];
	private _duel?: ChildProcessWithoutNullStreams;

	private constructor(attr: RoomAttr) {
		this.id = attr.id;
		this.name = attr.name;
		this.notes = attr.notes;
		this.mode = attr.mode;
		this.needPass = attr.needPass;
		this.team1 = attr.team1;
		this.team2 = attr.team2;
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
		this.users = attr.users;
		this.duelRule = attr.duelRule;
		this.handshake = attr.handshake;
		this.password = attr.password;
		this._duel = attr.duel;
	}

	static createFromCreateGameMessage(message: CreateGameMessage, playerName: string): Room {
		return new Room({
			id: 1,
			name: message.name,
			notes: message.notes,
			mode: message.mode,
			needPass: Buffer.from(message.password).some((element) => element !== 0x00),
			team1: message.t0Count,
			team2: message.t1Count,
			bestOf: message.bestOf,
			duelFlag: 4295820800,
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
			users: [
				{
					pos: 0,
					name: playerName,
				},
			],
		});
	}

	addClient(client: Client): void {
		this.clients.push(client);
		client.socket.on("data", (data) => {
			const messageHandler = new RoomMessageHandler(data, client, this.clients, this);
			messageHandler.read();
		});
	}

	setDecksToPlayer(position: number, deck: Deck): void {
		const user = this.users.find((user) => user.pos === position);
		if (!user) {
			return;
		}
		user.deck = deck;
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

	toPresentation(): { [key: string]: unknown } {
		return {
			roomid: this.id,
			roomname: this.name,
			roomnotes: this.notes,
			roommode: this.mode,
			needpass: this.needPass,
			team1: this.team1,
			team2: this.team2,
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
			users: this.users,
		};
	}
}
