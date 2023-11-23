/* eslint-disable no-await-in-loop */
import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { DomainEventSubscriber } from "../../shared/event-bus/EventBus";
import { BanListLeaderboardCalculator } from "../../stats/application/BanListLeaderboardCalculator";
import { EarnedPointsCalculator } from "../../stats/application/EarnedPointsCalculator";
import { GlobalLeaderboardCalculator } from "../../stats/application/GlobalLeaderboardCalculator";
import { GameOverDomainEvent } from "../domain/domain-events/GameOverDomainEvent";
import { RoomRepository } from "../domain/RoomRepository";

export class RecordMatch implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	private readonly roomRepository: RoomRepository;

	constructor(roomRepository: RoomRepository) {
		this.roomRepository = roomRepository;
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		if (!event.data.ranked) {
			return;
		}
		const banList = BanListMemoryRepository.findByHash(event.data.banlistHash);

		const handleStatsCalculations = new EarnedPointsCalculator(this.roomRepository, banList);

		handleStatsCalculations
			.setNextHandler(new GlobalLeaderboardCalculator(this.roomRepository))
			.setNextHandler(new BanListLeaderboardCalculator(this.roomRepository, banList));

		for (const player of event.data.players) {
			await this.roomRepository.saveMatch(player.name, {
				...event.data,
				banlistName: banList?.name ?? "N/A",
			});
			await handleStatsCalculations.calculate(player);
		}
	}
}
