import { Participant } from "./Participant";
import { MatchmakingFormat, MatchmakingMode, OpponentType } from "./QueueEntry";

/**
 * The result of a pairing decision. `participants` has length 2 for a human
 * pair and length 1 for a bot fallback — never a synthesized bot participant.
 */
export interface Match {
	readonly id: string;
	readonly format: MatchmakingFormat;
	readonly mode: MatchmakingMode;
	readonly rated: boolean;
	readonly opponentKind: OpponentType;
	readonly participants: readonly Participant[];
}
