import { Match } from "./Match";

/**
 * Synchronous port the pool calls once a match has formed. Implementations
 * own everything the match triggers next (room creation, notifications); the
 * pool only removes the matched participants and calls this once per match.
 */
export interface MatchHandler {
	handle(match: Match): void;
}
