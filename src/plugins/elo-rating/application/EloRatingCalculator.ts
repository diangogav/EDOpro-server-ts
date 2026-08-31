import { Logger } from "src/shared/logger/domain/Logger";
import { RankGroupResolver } from "src/shared/rank/application/RankGroupResolver";
import { Rank } from "src/shared/rank/domain/Rank";
import { RankRepository } from "src/shared/rank/domain/RankRepository";
import { EloCalculator, RatedPlayer } from "src/shared/stats/rating/domain/EloCalculator";
import { Rating } from "src/shared/stats/rating/domain/Rating";
import { RatingRepository } from "src/shared/stats/rating/domain/RatingRepository";
import { evaluateRatingEligibility } from "src/shared/stats/rating/domain/RatingEligibility";
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
		private readonly rankRepository: RankRepository,
		private readonly rankGroupResolver: RankGroupResolver,
	) {
		this.logger = logger.child({ file: "EloRatingCalculator" });
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		const { data } = event;

		const eligibility = evaluateRatingEligibility({
			ranked: data.ranked,
			banListName: data.banListName,
			players: data.players,
		});

		if (!eligibility.eligible) {
			if (eligibility.reason === "unranked") {
				this.logger.info(`Skipping rating for match ${data.matchId}: match is not ranked.`);
			} else if (eligibility.reason === "no-ranked-banlist") {
				this.logger.info(`Skipping rating for match ${data.matchId}: no ranked banlist ("N/A").`);
			} else {
				this.logger.warn(
					`Skipping rating for match ${data.matchId}: ${eligibility.missingIdCount} participant(s) have no account id (bot or unresolved account).`,
				);
			}

			return;
		}

		const playerIds = eligibility.players.map((player) => player.id);
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

		const ratedPlayers: RatedPlayer[] = eligibility.players.map((player) => ({
			id: player.id,
			team: player.team,
			winner: player.winner,
		}));
		const season = config.season;
		// Eligibility stays keyed on the raw banlist name; persistence is
		// keyed by the ranks resolved (or created) once per match. The alias
		// resolves before any rank lookup, and each group ladder the played
		// list feeds is an independent Elo pool with its own ratings and
		// history. Global stays out of Elo.
		const banListName = this.rankGroupResolver.resolveAlias(eligibility.banListName);
		const groupNames = this.rankGroupResolver.groupsFor(banListName);
		const ranks: Rank[] = [await this.rankRepository.findOrCreateByName(banListName)];
		for (const groupName of groupNames) {
			ranks.push(await this.rankRepository.findOrCreateByName(groupName, "group"));
		}

		for (const rank of ranks) {
			await this.ratingRepository.transaction(playerIds, rank.id, season, async (ratings, tx) => {
				const deltas = EloCalculator.deltasFor(ratedPlayers, ratings);

				for (const delta of deltas) {
					const inserted = await tx.insertHistory({
						matchId: data.matchId,
						userId: delta.userId,
						rankId: rank.id,
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
					await tx.saveRating(delta.userId, rank.id, season, updatedRating);
				}
			});
		}
	}
}
