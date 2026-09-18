import { Participant } from "./Participant";
import { MatchmakingFormat, MatchmakingMode } from "./QueueEntry";

/**
 * Port for the matchmaking pool's storage. Keeps a participant-id index and
 * a userId index consistent, and reports queue depth per pool key
 * (`${format}:${mode}`). Implementations must not import transport code.
 */
export interface PoolStore {
	add(participant: Participant): void;
	get(id: string): Participant | undefined;
	findByUserId(userId: string): Participant | undefined;
	remove(id: string): void;
	all(format: MatchmakingFormat, mode: MatchmakingMode): readonly Participant[];
	depth(format: MatchmakingFormat, mode: MatchmakingMode): number;
}
