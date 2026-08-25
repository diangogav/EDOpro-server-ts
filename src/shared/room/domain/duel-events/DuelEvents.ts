/**
 * Duel-event vocabulary. These are the only duel facts the surface names;
 * consumers receive the payload types below — decoded domain data, never wire
 * buffers.
 *
 * duel.duelist-changed is deliberately absent: duelist rotation is core-driven
 * on the EDOPro pipeline (MSG_TAG_SWAP) but server-computed on the ygopro one,
 * so it is not the same fact on both pipelines.
 */
export const DUEL_EVENT_KINDS = [
	"duel.damage",
	"duel.recover",
	"duel.lp-cost",
	"duel.turn-start",
] as const;

export type DuelEventKind = (typeof DUEL_EVENT_KINDS)[number];

/** A player's team took battle or effect damage. */
export interface DamageDealtEvent {
	readonly roomId: number;
	/** Stable uuid of the single game this happened in — see Duel.duelId. */
	readonly duelId: string;
	readonly team: number;
	readonly amount: number;
	readonly turn: number;
}

/** A player's team recovered life points. */
export interface LifeRecoveredEvent {
	readonly roomId: number;
	/** Stable uuid of the single game this happened in — see Duel.duelId. */
	readonly duelId: string;
	readonly team: number;
	readonly amount: number;
	readonly turn: number;
}

/** A player's team paid life points as a cost. */
export interface LpCostPaidEvent {
	readonly roomId: number;
	/** Stable uuid of the single game this happened in — see Duel.duelId. */
	readonly duelId: string;
	readonly team: number;
	readonly amount: number;
	readonly turn: number;
}

/**
 * A new turn began. `player` is the core turn player (0/1) exactly as emitted —
 * both cores emit exactly one MSG_NEW_TURN per turn with this byte, in single,
 * match and tag (edo9300/ygopro-core processor.cpp:3334 is the single emission
 * site). It is kept raw because turn-player team resolution differs per
 * pipeline and is not this event's business.
 */
export interface TurnStartedEvent {
	readonly roomId: number;
	/** Stable uuid of the single game this happened in — see Duel.duelId. */
	readonly duelId: string;
	readonly player: number;
	readonly turn: number;
}
