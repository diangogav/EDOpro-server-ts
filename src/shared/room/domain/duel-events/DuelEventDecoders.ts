/**
 * Wire decoders and event builders for the duel-event vocabulary.
 *
 * One decoder per DuelEventKind, shared by both pipelines:
 *  - The EDOPro pipeline calls decode*(buffer, ctx) with the raw core message
 *    (layout [type u8, player u8, amount u32le] — verified at the emission
 *    sites in edo9300/ygopro-core operations.cpp:603/674/749 and
 *    processor.cpp:3334, and byte-identical to ygopro-msg-encode's classic
 *    payloads).
 *  - The ygopro pipeline receives already-typed messages and calls
 *    build*({player, amount}, ctx) with their fields.
 *
 * Both paths MUST produce the same object for the same logical event — that
 * equivalence is what makes consumer data comparable across room types.
 *
 * Team resolution is injected via ctx.resolveTeam, never assumed: EDOPro rooms
 * map firstToPlay ^ player, ygopro rooms use their own resolveTeam.
 */
import {
	DamageDealtEvent,
	LifeRecoveredEvent,
	LpCostPaidEvent,
	TurnStartedEvent,
} from "./DuelEvents";

export interface DuelEventContext {
	readonly roomId: number;
	readonly duelId: string;
	readonly turn: number;
	readonly resolveTeam: (player: number) => number;
}

const MSG_NEW_TURN = 40;
const MSG_DAMAGE = 91;
const MSG_RECOVER = 92;
const MSG_PAY_LPCOST = 100;

function assertType(data: Buffer, expected: number): void {
	const actual = data.readUint8(0);
	if (actual !== expected) {
		throw new Error(`Expected core message type ${expected}, got ${actual}`);
	}
}

interface LpWire {
	readonly player: number;
	readonly amount: number;
}

function readLpWire(data: Buffer): LpWire {
	return { player: data.readUint8(1), amount: data.readUint32LE(2) };
}

export function buildDamageDealt(wire: LpWire, ctx: DuelEventContext): DamageDealtEvent {
	return {
		roomId: ctx.roomId,
		duelId: ctx.duelId,
		team: ctx.resolveTeam(wire.player),
		amount: wire.amount,
		turn: ctx.turn,
	};
}

export function buildLifeRecovered(wire: LpWire, ctx: DuelEventContext): LifeRecoveredEvent {
	return buildDamageDealt(wire, ctx);
}

export function buildLpCostPaid(wire: LpWire, ctx: DuelEventContext): LpCostPaidEvent {
	return buildDamageDealt(wire, ctx);
}

export function buildTurnStarted(
	wire: { readonly player: number },
	ctx: DuelEventContext,
): TurnStartedEvent {
	return { roomId: ctx.roomId, duelId: ctx.duelId, player: wire.player, turn: ctx.turn };
}

export function decodeDamageDealt(data: Buffer, ctx: DuelEventContext): DamageDealtEvent {
	assertType(data, MSG_DAMAGE);
	return buildDamageDealt(readLpWire(data), ctx);
}

export function decodeLifeRecovered(data: Buffer, ctx: DuelEventContext): LifeRecoveredEvent {
	assertType(data, MSG_RECOVER);
	return buildLifeRecovered(readLpWire(data), ctx);
}

export function decodeLpCostPaid(data: Buffer, ctx: DuelEventContext): LpCostPaidEvent {
	assertType(data, MSG_PAY_LPCOST);
	return buildLpCostPaid(readLpWire(data), ctx);
}

export function decodeTurnStarted(data: Buffer, ctx: DuelEventContext): TurnStartedEvent {
	assertType(data, MSG_NEW_TURN);
	return buildTurnStarted({ player: data.readUint8(1) }, ctx);
}
