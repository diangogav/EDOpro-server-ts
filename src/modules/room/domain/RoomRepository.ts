import { MatchSummary } from "../match/domain/MatchSummary";

export interface RoomRepository {
	saveMatch(id: string, room: MatchSummary): Promise<void>;
	updatePlayerPoints(id: string, points: number): Promise<void>;
	increaseWins(id: string): Promise<void>;
	increaseLoses(id: string): Promise<void>;
}
