import WebSocket from "ws";
import {
	BattleCmdType,
	IdleCmdType,
	IndexResponse,
	YGOProCtosJoinGame,
	YGOProCtosPlayerInfo,
	YGOProMsgAttack,
	YGOProMsgDamage,
	YGOProMsgMove,
	YGOProMsgNewTurn,
	YGOProMsgResponseBase,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectOption,
	YGOProMsgSelectPlace,
	YGOProMsgSelectPosition,
	YGOProMsgSelectTribute,
	YGOProMsgSelectYesNo,
	YGOProMsgSummoning,
	YGOProMsgUpdateData,
	YGOProMsgWin,
	YGOProStoc,
	YGOProStocErrorMsg,
	YGOProStocGameMsg,
	YGOProStocHsPlayerChange,
	YGOProStocJoinGame,
	YGOProStocSelectHand,
	YGOProStocSelectTp,
	YGOProStocTimeLimit,
} from "ygopro-msg-encode";

import { splitFrames } from "../BridgedSocket";
import { translateEdoproStoc } from "../translateEdoproStoc";
import { translateResponseToIgnis } from "../translateResponseToIgnis";
import { frame } from "./edoproClientFrames.testing";

/**
 * Which wire format a seat speaks: `edopro` plays the EDOPro desktop client
 * that hosts the room, `ygopro` plays a client on the YGOPro server.
 */
export type Wire = "edopro" | "ygopro";

export const CTOS_RESPONSE = 0x01;
export const CTOS_UPDATE_DECK = 0x02;
const CTOS_HAND_RESULT = 0x03;
const CTOS_TP_RESULT = 0x04;
const CTOS_TIME_CONFIRM = 0x15;
export const CTOS_HS_READY = 0x22;
export const CTOS_HS_START = 0x25;
const YGOPRO_VERSION = 4962;
export const RECONNECT_COMMAND = 0xfd;

export const LOCATION_HAND = 0x02;
export const LOCATION_MZONE = 0x04;
export const SUMMON_ZONE = 2;
export const BATTLE_OX_ATTACK = 1700;
/** Low nibble of STOC_HS_PLAYER_CHANGE when a seat readies up. */
const READY_STATE = 0x9;

/** Battle Ox: a Level 4 Normal Monster, so every hand can Normal Summon. */
export const BATTLE_OX_DECK = Array<number>(40).fill(5053103);

/**
 * Three copies each of fourteen Level 4 Normal Monsters on the Edison list: a
 * deck a room with that banlist and deck checking accepts.
 */
export const EDISON_VANILLA_DECK = [
	69247929, 11091375, 14898066, 35052053, 37265642, 49881766, 69140098, 79182538, 90582719,
	97127906, 5464695, 7359741, 49003308, 7459013,
].flatMap((code) => [code, code, code]);

export type SeatEvent =
	| "room-created"
	| "joined"
	| "player-ready"
	| "error"
	| "reconnect-ack"
	| "win";

export interface Seat {
	readonly name: string;
	readonly socket: WebSocket;
	/** Frames the seat could not read, as `stoc 0x..` or `msg N`. */
	readonly unsupported: string[];
	readonly updates: YGOProMsgUpdateData[];
	readonly moves: YGOProMsgMove[];
	readonly summonings: YGOProMsgSummoning[];
	readonly idleCmds: YGOProMsgSelectIdleCmd[];
	readonly battleCmds: YGOProMsgSelectBattleCmd[];
	readonly attacks: YGOProMsgAttack[];
	readonly damages: YGOProMsgDamage[];
	readonly errors: YGOProStocErrorMsg[];
	turn: number;
	summoned: YGOProMsgSelectIdleCmd["summonableCards"][number] | null;
	/** Turn of the last Normal Summon: the seat summons once per turn. */
	summonedOnTurn: number;
	win: YGOProMsgWin | null;
	/** The token the server issued this seat to come back to its duel. */
	reconnectToken: string | null;
	send(command: number, body?: Uint8Array): void;
}

type Decoded =
	| { kind: "stoc"; message: unknown }
	| { kind: "room-created"; roomId: number }
	| { kind: "unsupported"; label: string }
	| { kind: "ignored" };

function decodeEdopro(bytes: Buffer): Decoded {
	const result = translateEdoproStoc(bytes, { duelRule: 5 });
	if (result.kind === "unsupported") {
		const label =
			result.messageType === undefined
				? `stoc 0x${result.command.toString(16)}`
				: `msg ${result.messageType}`;

		return { kind: "unsupported", label };
	}
	if (result.kind === "joined") {
		return { kind: "stoc", message: result.message };
	}

	return result;
}

/** Exactly what a YGOPro client does with a frame: the library's own decoder. */
function decodeYgopro(bytes: Buffer): Decoded {
	const message = YGOProStoc.getInstanceFromPayload(bytes);
	if (message === undefined) {
		return { kind: "unsupported", label: `stoc 0x${bytes[2].toString(16)}` };
	}
	if (message instanceof YGOProStocGameMsg && message.msg === undefined) {
		return { kind: "unsupported", label: `msg ${bytes[3]}` };
	}

	return { kind: "stoc", message };
}

export function deckBody(deck: readonly number[]): Uint8Array {
	const body = Buffer.alloc(8 + deck.length * 4);
	body.writeUInt32LE(deck.length, 0);
	deck.forEach((code, index) => body.writeUInt32LE(code, 8 + index * 4));

	return body;
}

export function playerInfoFrame(name: string): Buffer {
	const info = new YGOProCtosPlayerInfo();
	info.name = name;

	return Buffer.from(info.toFullPayload());
}

/** The join a client on the YGOPro server sends for an EDOPro room. */
export function ygoproJoinFrame(roomId: number, password = ""): Buffer {
	const join = new YGOProCtosJoinGame();
	join.version = YGOPRO_VERSION;
	join.pass = password === "" ? `edo,${roomId}` : `edo,${roomId}#${password}`;

	return Buffer.from(join.toFullPayload());
}

/**
 * The simplest legal answer to a prompt that follows the seat's own script:
 * the first cards asked for, the first position offered, and no to anything
 * optional.
 */
function followUpResponse(message: unknown): Uint8Array | null {
	if (message instanceof YGOProMsgSelectCard || message instanceof YGOProMsgSelectTribute) {
		const picks = Array.from({ length: Math.max(1, message.min) }, (_, index) =>
			IndexResponse(index),
		);

		return message.prepareResponse(picks);
	}
	if (message instanceof YGOProMsgSelectPosition) {
		return message.prepareResponse(message.positions & -message.positions);
	}
	if (message instanceof YGOProMsgSelectEffectYn || message instanceof YGOProMsgSelectYesNo) {
		return message.prepareResponse(false);
	}
	if (message instanceof YGOProMsgSelectOption) {
		return message.prepareResponse(0);
	}
	if (message instanceof YGOProMsgSelectChain) {
		return message.prepareResponse(null);
	}

	return null;
}

/**
 * Opens a headless seat that plays a fixed script: pass turn 1; from turn 2
 * Normal Summon once per turn into the centre zone and attack with everything.
 */
export function openSeat(params: {
	url: string;
	name: string;
	wire: Wire;
	rpsHand: number;
	onEvent?: (seat: Seat, event: SeatEvent, value?: number) => void;
	/** Called with each prompt before the script answers it; return true to leave it unanswered. */
	holdPrompt?: (seat: Seat, prompt: unknown) => boolean;
}): Promise<Seat> {
	const { url, name, wire, rpsHand, onEvent = () => undefined, holdPrompt = () => false } = params;
	const decode = wire === "edopro" ? decodeEdopro : decodeYgopro;

	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		const send = (command: number, body: Uint8Array = new Uint8Array(0)): void =>
			socket.send(frame(command, body));
		const seat: Seat = {
			name,
			socket,
			unsupported: [],
			updates: [],
			moves: [],
			summonings: [],
			idleCmds: [],
			battleCmds: [],
			attacks: [],
			damages: [],
			errors: [],
			turn: 0,
			summoned: null,
			summonedOnTurn: 0,
			win: null,
			reconnectToken: null,
			send,
		};
		const respond = (prompt: unknown, response: Uint8Array): void =>
			send(
				CTOS_RESPONSE,
				wire === "edopro" ? translateResponseToIgnis(prompt, response) : response,
			);

		const onGameMessage = (message: unknown): void => {
			if (message instanceof YGOProMsgResponseBase && holdPrompt(seat, message)) return;
			if (message instanceof YGOProMsgUpdateData) seat.updates.push(message);
			if (message instanceof YGOProMsgMove) seat.moves.push(message);
			if (message instanceof YGOProMsgSummoning) seat.summonings.push(message);
			if (message instanceof YGOProMsgNewTurn) seat.turn += 1;
			if (message instanceof YGOProMsgAttack) seat.attacks.push(message);
			if (message instanceof YGOProMsgDamage) seat.damages.push(message);
			if (message instanceof YGOProMsgSelectIdleCmd) {
				seat.idleCmds.push(message);
				const card = message.summonableCards[0];
				if (seat.turn >= 2 && seat.summonedOnTurn !== seat.turn && card !== undefined) {
					seat.summoned ??= card;
					seat.summonedOnTurn = seat.turn;
					respond(message, message.prepareResponse(IdleCmdType.SUMMON, IndexResponse(0)));
				} else {
					respond(
						message,
						message.prepareResponse(message.canBp ? IdleCmdType.TO_BP : IdleCmdType.TO_EP),
					);
				}
			}
			if (message instanceof YGOProMsgSelectBattleCmd) {
				seat.battleCmds.push(message);
				const action =
					message.attackableCards.length > 0
						? message.prepareResponse(BattleCmdType.ATTACK, IndexResponse(0))
						: message.prepareResponse(BattleCmdType.TO_EP);
				respond(message, action);
			}
			if (message instanceof YGOProMsgSelectPlace) {
				const place = message
					.getSelectablePlaces()
					.find((slot) => slot.location === LOCATION_MZONE && slot.sequence === SUMMON_ZONE);
				if (place !== undefined) respond(message, message.prepareResponse([place]));
			}
			const follow = followUpResponse(message);
			if (follow !== null) respond(message, follow);
			if (message instanceof YGOProMsgWin) {
				seat.win = message;
				onEvent(seat, "win", message.player);
			}
		};

		socket.on("open", () => resolve(seat));
		socket.on("error", () => reject(new Error(`${name}: socket error`)));
		socket.on("message", (data: Buffer) => {
			for (const bytes of splitFrames(data)) {
				if (bytes[2] === RECONNECT_COMMAND) {
					// The token itself, or the one-byte answer to presenting it.
					if (bytes.length === 4) onEvent(seat, "reconnect-ack", bytes[3]);
					else seat.reconnectToken = bytes.subarray(3).toString("utf8");
					continue;
				}
				const decoded = decode(bytes);
				if (decoded.kind === "unsupported") {
					seat.unsupported.push(decoded.label);
					continue;
				}
				if (decoded.kind === "ignored") continue;
				if (decoded.kind === "room-created") {
					onEvent(seat, "room-created", decoded.roomId);
					continue;
				}
				const message = decoded.message;
				if (message instanceof YGOProStocJoinGame) onEvent(seat, "joined");
				if (message instanceof YGOProStocErrorMsg) {
					seat.errors.push(message);
					onEvent(seat, "error", message.code);
				}
				if (message instanceof YGOProStocHsPlayerChange && (message.status & 0xf) === READY_STATE) {
					onEvent(seat, "player-ready", message.status >> 4);
				}
				if (message instanceof YGOProStocSelectHand)
					send(CTOS_HAND_RESULT, Uint8Array.from([rpsHand]));
				if (message instanceof YGOProStocSelectTp) send(CTOS_TP_RESULT, Uint8Array.from([1]));
				if (message instanceof YGOProStocTimeLimit) send(CTOS_TIME_CONFIRM);
				if (message instanceof YGOProStocGameMsg) onGameMessage(message.msg);
			}
		});
	});
}
