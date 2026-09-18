import { Match } from "./Match";
import { Participant } from "./Participant";

/**
 * Port for a pairing strategy. Implementations decide which candidates form
 * a `Match`; the pool is responsible for removing matched participants and
 * dispatching the result, never the policy itself.
 */
export interface PairingPolicy {
	pair(candidates: readonly Participant[], now: number): readonly Match[];
}
