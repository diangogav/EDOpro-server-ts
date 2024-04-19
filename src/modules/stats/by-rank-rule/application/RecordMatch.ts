/* eslint-disable no-await-in-loop */
import BanListMemoryRepository from "../../../ban-list/infrastructure/BanListMemoryRepository";
import { GameOverDomainEvent } from "../../../room/domain/domain-events/GameOverDomainEvent";
import { RoomRepository } from "../../../room/domain/RoomRepository";
import { DomainEventSubscriber } from "../../../shared/event-bus/EventBus";
import { Player } from "../../../shared/player/domain/Player";
import { RankRuleRepository } from "../rank-rules/domain/RankRuleRepository";
import { BanListLeaderboardCalculator } from "./BanListLeaderboardCalculator";
import { EarnedPointsCalculator } from "./EarnedPointsCalculator";
import { GlobalLeaderboardCalculator } from "./GlobalLeaderboardCalculator";

export class RecordMatch implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	private readonly roomRepository: RoomRepository;
	private readonly rankRuleRepository: RankRuleRepository;
	private readonly MIN_PLAYERS_FOR_RANKED = 2;

	constructor(roomRepository: RoomRepository, rankRuleRepository: RankRuleRepository) {
		this.roomRepository = roomRepository;
		this.rankRuleRepository = rankRuleRepository;
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		if (!event.data.ranked) {
			return;
		}
		const banList = BanListMemoryRepository.findByHash(event.data.banlistHash);
		const players = event.data.players.map((item) => new Player(item));

		const handleStatsCalculations = new EarnedPointsCalculator(
			this.roomRepository,
			banList,
			players,
			this.rankRuleRepository
		);

		handleStatsCalculations
			.setNextHandler(new GlobalLeaderboardCalculator(this.roomRepository))
			.setNextHandler(new BanListLeaderboardCalculator(this.roomRepository, banList));

		const totalPlayers = players.length;

		for (const player of players) {
			if (totalPlayers <= this.MIN_PLAYERS_FOR_RANKED) {
				await handleStatsCalculations.calculate(player);
			}
		}

		for (const player of players) {
			if (totalPlayers <= this.MIN_PLAYERS_FOR_RANKED) {
				await this.roomRepository.saveMatch(player.name, {
					bestOf: event.data.bestOf,
					date: event.data.date,
					players: players.map((item) => item.toPresentation()),
					ranked: event.data.ranked,
					banlistHash: event.data.banlistHash,
					banlistName: banList?.name ?? "N/A",
				});
			}
		}
	}
}
