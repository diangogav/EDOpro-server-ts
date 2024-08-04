import { BanList } from "@modules/ban-list/domain/BanList";
import { MatchSummary } from "@modules/shared/room/domain/match/domain/MatchSummary";

export interface RoomRepository {
	saveMatch(id: string, room: MatchSummary): Promise<void>;
	updatePlayerPoints(id: string, points: number): Promise<void>;
	updatePlayerPointsByBanList(id: string, points: number, banList: BanList): Promise<void>;
	increaseWins(id: string): Promise<void>;
	increaseLoses(id: string): Promise<void>;
	increaseWinsByBanList(id: string, banList: BanList);
	increaseLosesByBanList(id: string, banList: BanList);
}
