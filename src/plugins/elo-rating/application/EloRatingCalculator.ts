import { Logger } from "src/shared/logger/domain/Logger";
import { EloCalculator, RatedPlayer } from "src/shared/stats/rating/domain/EloCalculator";
import { Rating } from "src/shared/stats/rating/domain/Rating";
import { RatingRepository } from "src/shared/stats/rating/domain/RatingRepository";
import { UserProfileRepository } from "src/shared/user-profile/domain/UserProfileRepository";

import { DomainEventSubscriber } from "../../../shared/event-bus/EventBus";
import { GameOverDomainEvent } from "../../../shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { config } from "../../../config/index";

export class EloRatingCalculator implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	constructor(
		private readonly logger: Logger,
		private readonly userProfileRepository: UserProfileRepository,
		private readonly ratingRepository: RatingRepository,
	) {
		this.logger = logger.child({ file: "EloRatingCalculator" });
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		const { data } = event;

		if (!data.ranked) {
			this.logger.info(`Skipping rating for match ${data.matchId}: match is not ranked.`);

			return;
		}

		if (!data.banListName || data.banListName === "N/A") {
			this.logger.info(`Skipping rating for match ${data.matchId}: no ranked banlist ("N/A").`);

			return;
		}

		const missingIdCount = data.players.filter((player) => player.id === null).length;
		if (missingIdCount > 0) {
			this.logger.warn(
				`Skipping rating for match ${data.matchId}: ${missingIdCount} participant(s) have no account id (bot or unresolved account).`,
			);

			return;
		}

		const playerIds = data.players.map((player) => player.id as string);
		const accounts = await Promise.all(
			playerIds.map((id) => this.userProfileRepository.findById(id)),
		);
		const unresolvedCount = accounts.filter((account) => account === null).length;
		if (unresolvedCount > 0) {
			this.logger.warn(
				`Skipping rating for match ${data.matchId}: ${unresolvedCount} participant(s) could not be resolved to an account.`,
			);

			return;
		}

		const ratedPlayers: RatedPlayer[] = data.players.map((player) => ({
			id: player.id as string,
			team: player.team,
			winner: player.winner,
		}));
		const banListName = data.banListName;
		const season = config.season;

		await this.ratingRepository.transaction(playerIds, banListName, season, async (ratings, tx) => {
			const deltas = EloCalculator.deltasFor(ratedPlayers, ratings);

			for (const delta of deltas) {
				const inserted = await tx.insertHistory({
					matchId: data.matchId,
					userId: delta.userId,
					banListName,
					season,
					kind: "applied",
					previousRating: delta.previousRating,
					delta: delta.delta,
					kFactor: delta.kFactor,
					opponentRating: delta.opponentRating,
				});

				if (!inserted) {
					this.logger.info(
						`Rating for match ${data.matchId} / user ${delta.userId} was already recorded — replay no-op.`,
					);
					continue;
				}

				const currentRating = ratings.get(delta.userId) as Rating;
				const updatedRating = currentRating.applyDelta(delta.delta);
				await tx.saveRating(delta.userId, banListName, season, updatedRating);
			}
		});
	}
}
