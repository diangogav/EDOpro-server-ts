import { PlayerCredential } from "./PlayerCredential";
import { Seat } from "./Seat";

/** Why a client was turned away entirely (not even allowed to watch). */
export type AdmissionRejection = "ranked-requires-account";

/**
 * The outcome of asking "can this client be admitted, and how?".
 *
 * - `player`:    sit down to play — got both the door and a free seat.
 * - `spectator`: watch from the stands — has the door, not the seat.
 * - `rejected`:  not even allowed in.
 */
export type Admission =
	| { readonly kind: "player"; readonly credential: PlayerCredential; readonly seat: Seat }
	| { readonly kind: "spectator" }
	| { readonly kind: "rejected"; readonly reason: AdmissionRejection };
