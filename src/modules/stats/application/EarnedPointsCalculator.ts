import { BanList } from "../../ban-list/domain/BanList";
import { RoomRepository } from "../../room/domain/RoomRepository";
import { PlayerData } from "../../shared/player/domain/PlayerData";
import { StatsCalculatorHandler } from "../domain/StatsCalculatorHandler";

export class EarnedPointsCalculator implements StatsCalculatorHandler {
	private readonly roomRepository: RoomRepository;
	private nextHandler: StatsCalculatorHandler | null = null;
	private readonly banlist: BanList | null;

	constructor(roomRepository: RoomRepository, banlist: BanList | null) {
		this.roomRepository = roomRepository;
		this.banlist = banlist;
	}

	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler {
		this.nextHandler = handler;

		return handler;
	}

	async calculate(player: PlayerData): Promise<void> {
		const wins = player.games.filter((round) => round.result === "winner").length;
		const defeats = player.games.filter((round) => round.result === "loser").length;
		const earnedPoints = this.calculateEarnedPoints(wins, defeats, player.winner);
		await this.roomRepository.updatePlayerPoints(player.name, earnedPoints);

		if (this.banlist) {
			await this.roomRepository.updatePlayerPointsByBanList(
				player.name,
				earnedPoints,
				this.banlist
			);
		}
		if (this.nextHandler) {
			return this.nextHandler.calculate(player);
		}
	}

	private calculateEarnedPoints(wins: number, defeats: number, winner: boolean): number {
		if (winner) {
			return wins + (wins - defeats);
		}

		return wins;
	}
}
