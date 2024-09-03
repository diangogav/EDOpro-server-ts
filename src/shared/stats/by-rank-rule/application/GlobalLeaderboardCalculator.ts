import { RoomRepository } from "../../../../edopro/room/domain/RoomRepository";
import { PlayerData } from "../../../player/domain/PlayerData";
import { StatsCalculatorHandler } from "../domain/StatsCalculatorHandler";

export class GlobalLeaderboardCalculator implements StatsCalculatorHandler {
	private readonly roomRepository: RoomRepository;
	private nextHandler: StatsCalculatorHandler | null = null;

	constructor(roomRepository: RoomRepository) {
		this.roomRepository = roomRepository;
	}

	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler {
		this.nextHandler = handler;

		return handler;
	}

	async calculate(player: PlayerData): Promise<void> {
		if (player.winner) {
			await this.roomRepository.increaseWins(player.name);
		} else {
			await this.roomRepository.increaseLoses(player.name);
		}

		if (this.nextHandler) {
			return this.nextHandler.calculate(player);
		}
	}
}
