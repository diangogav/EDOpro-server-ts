import { Reservation } from "./Reservation";

/**
 * - `missing`: no such reservation (expired, revoked, never issued, or unreadable).
 * - `not_participant`: the user holds no seat in it; the reservation is left untouched.
 * - `claimed`: this call claimed it — the caller opens the room.
 * - `already_claimed_here`: this instance claimed it earlier — a later participant.
 * - `claimed_elsewhere`: another instance owns it.
 * - `unavailable`: the store could not answer.
 */
export type ClaimResult =
	| { status: "claimed" | "already_claimed_here"; reservation: Reservation }
	| { status: "missing" | "not_participant" | "claimed_elsewhere" | "unavailable" };

export interface ReservationStore {
	claim(reservationId: string, instanceId: string, userId: string): Promise<ClaimResult>;
	/** Drops the reservation once its room is gone, so it can never be claimed again. */
	release(reservationId: string): Promise<void>;
}
