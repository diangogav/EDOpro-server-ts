import { PlayerData } from "../../../../shared/player/domain/PlayerData";
import { BanList } from "../../../ban-list/domain/BanList";
import { RoomRepository } from "../../../room/domain/RoomRepository";
import { StatsCalculatorHandler } from "../domain/StatsCalculatorHandler";

export class BanListLeaderboardCalculator implements StatsCalculatorHandler {
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
		if (!this.banlist && this.nextHandler) {
			return this.nextHandler.calculate(player);
		}

		if (!this.banlist) {
			return;
		}

		if (player.winner) {
			await this.roomRepository.increaseWinsByBanList(player.name, this.banlist);
		} else {
			await this.roomRepository.increaseLosesByBanList(player.name, this.banlist);
		}

		if (this.nextHandler) {
			return this.nextHandler.calculate(player);
		}
	}
}
