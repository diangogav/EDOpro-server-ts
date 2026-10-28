import { Reservation } from "./Reservation";

export type AbandonReason =
	| "disconnect"
	| "room_closed"
	| "no_show"
	| "bot_unavailable"
	| "server_restart";

/** Why a reserved room closed without a game over, and which seat caused it (null: nobody). */
export type ReservedDuelAbandon = {
	readonly seat: number | null;
	readonly reason: AbandonReason;
	/**
	 * True when the duel had already started: the row then counts as started
	 * (a loss for the seat that left), even if the start write has not landed.
	 */
	readonly started?: boolean;
};

export type ReservedDuelGame = {
	readonly winnerSeat: number | null;
	readonly reason: string;
};

export type ReservedDuelResult = {
	readonly outcome: "decided" | "draw";
	readonly winnerSeat: number | null;
	readonly reason: string;
	readonly matchId: string;
	readonly duels: readonly ReservedDuelGame[];
};

/**
 * The server-owned `reserved_duels` / `reserved_duel_participants` rows. Every
 * terminal write is conditional on the row still being open, so whichever
 * writer arrives first wins and a retry never rewrites an outcome.
 */
export interface ReservedDuelRepository {
	/** Rows for a freshly claimed reservation; `joinedSeat` is the first joiner's seat. */
	open(input: {
		reservation: Reservation;
		instanceId: string;
		roomId: number;
		joinedSeat: number;
	}): Promise<void>;
	/** Whether the reservation's row exists (a write reported as failed may have committed). */
	exists(reservationId: string): Promise<boolean>;
	/** Marks a seat as joined. False when it was already taken. */
	claimSeat(reservationId: string, seat: number): Promise<boolean>;
	markStarted(reservationId: string, matchId: string): Promise<void>;
	recordAbandon(reservationId: string, abandon: ReservedDuelAbandon): Promise<boolean>;
	recordResult(reservationId: string, result: ReservedDuelResult): Promise<boolean>;
	/** Closes every open row this instance left behind; returns how many. */
	closeLeftovers(instanceId: string): Promise<number>;
}
