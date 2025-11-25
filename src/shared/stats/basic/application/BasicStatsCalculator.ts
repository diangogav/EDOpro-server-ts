
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { Logger } from "src/shared/logger/domain/Logger";
import { Player } from "src/shared/player/domain/Player";
import { UserProfileRepository } from "src/shared/user-profile/domain/UserProfileRepository";

import { DomainEventSubscriber } from "../../../event-bus/EventBus";
import { GameOverDomainEvent } from "../../../room/domain/match/domain/domain-events/GameOverDomainEvent";
import { MatchResumeCreator } from "../../match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "../../match-resume/duel-resume/application/DuelResumeCreator";
import { PlayerStatsRepository } from "../../player-stats/domain/PlayerStatsRepository";
import { config } from "./../../../../config/index";

export class BasicStatsCalculator implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	constructor(
		private readonly logger: Logger,
		private readonly userProfileRepository: UserProfileRepository,
		private readonly playerStatsRepository: PlayerStatsRepository,
		private readonly matchResumeCreator: MatchResumeCreator,
		private readonly duelResumeCreator: DuelResumeCreator
	) {
		this.logger = logger.child({ file: "BasicStatsCalculator" });
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		this.logger.info(
			`Duel finished for ${event.data.players.map((player) => player.name).join(" ")}`
		);

		if (!event.data.ranked) {
			this.logger.info(`Match started as *non-ranked*. Players' MMR will not be affected.`);

			return;
		}

		const banList = BanListMemoryRepository.findByHash(event.data.banListHash);
		const players = event.data.players.map((item) => new Player(item));

		for (const player of players) {
			const userProfile = await this.userProfileRepository.findByUsername(player.name);
			if (!userProfile) {
				continue;
			}
			const playerNames = players
				.filter((item) => item.team === player.team)
				.map((element) => element.name);
			const opponentNames = players
				.filter((item) => item.team !== player.team)
				.map((element) => element.name);
			const playerIds = players
				.filter((item) => item.team === player.team)
				.map((element) => element.id);
			const opponentIds = players
				.filter((item) => item.team !== player.team)
				.map((element) => element.id);
			const points = player.calculateMatchPoints();
			this.logger.info(`Player ${player.name} and id: ${userProfile.id} gain ${points} points`);
			if (banList?.name) {
				const playerStats = await this.playerStatsRepository.findByUserIdAndBanListName(
					userProfile.id,
					banList.name
				);
				playerStats.addPoints(points);
				player.winner ? playerStats.increaseWins() : playerStats.increaseLosses();
				void this.playerStatsRepository.save(playerStats);
			}

			const globalPlayerStats = await this.playerStatsRepository.findByUserIdAndBanListName(
				userProfile.id,
				"Global"
			);
			globalPlayerStats.addPoints(points);
			player.winner ? globalPlayerStats.increaseWins() : globalPlayerStats.increaseLosses();
			void this.playerStatsRepository.save(globalPlayerStats);

			const { id: matchId } = await this.matchResumeCreator.run({
				userId: userProfile.id,
				bestOf: event.data.bestOf,
				playerNames,
				opponentNames,
				playerIds: playerIds.filter((id): id is string => id !== null),
				opponentIds: opponentIds.filter((id): id is string => id !== null),
				date: event.data.date,
				banListName: banList?.name ?? "N/A",
				banListHash: event.data.banListHash.toString(),
				playerScore: player.wins,
				opponentScore: player.losses,
				winner: player.winner,
				season: config.season,
				points,
			});

			this.logger.info(
				`Match saved with id ${matchId} for user: ${userProfile.id} with name ${player.name}`
			);

			for (const game of player.games) {
				void this.duelResumeCreator.run({
					userId: userProfile.id,
					playerNames,
					opponentNames,
					date: event.data.date,
					banListName: banList?.name ?? "N/A",
					banListHash: event.data.banListHash.toString(),
					result: game.result,
					turns: game.turns,
					matchId,
					season: config.season,
					ipAddress: game.ipAddress,
				});
			}
		}
	}
}
