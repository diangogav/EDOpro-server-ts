import { Logger } from "@shared/logger/domain/Logger";
import { Team } from "@shared/room/Team";
import { MatchContext, MatchLifecycleHook } from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { EloCalculator, RatedPlayer } from "@shared/stats/rating/domain/EloCalculator";
import { MatchRatingSnapshot } from "@shared/stats/rating/domain/MatchRatingSnapshot";
import { Rating } from "@shared/stats/rating/domain/Rating";
import {
	RatedMatchPlayer,
	evaluateRatingEligibility,
} from "@shared/stats/rating/domain/RatingEligibility";
import {
	RatingAnnouncementDeltaEntry,
	RatingAnnouncementEntry,
	formatEnd,
	formatStart,
} from "@shared/stats/rating/domain/RatingAnnouncement";
import { RatingRepository } from "@shared/stats/rating/domain/RatingRepository";

// Duel teams only ever number two; team0 always renders before team1.
const TEAM_ORDER = [Team.PLAYER, Team.OPPONENT] as const;

/**
 * MatchLifecycleHook implementer that announces each seated player's rating
 * at match start and their delta/resulting rating at match end, over the
 * bounded ctx.announce() capability. A hook receives no room reference, so
 * the start-time snapshot is kept here, keyed by roomId — room lifetime
 * bounds the key space (a 4-digit id) and a snapshot is cleared as soon as
 * onMatchEnding consumes it, so a match that never ends is the only case
 * that leaves a stale entry, self-healing the next time that roomId starts
 * a new match.
 */
export class RatingAnnouncer implements MatchLifecycleHook {
	readonly name = "rating-announcer";
	private readonly snapshots = new Map<number, MatchRatingSnapshot>();

	constructor(
		private readonly ratingRepository: RatingRepository,
		private readonly logger: Logger,
	) {}

	async onMatchStarted(ctx: MatchContext): Promise<void> {
		if (this.snapshots.has(ctx.roomId)) {
			return;
		}

		const eligibility = evaluateRatingEligibility({
			ranked: ctx.ranked,
			banListName: ctx.banListName,
			players: [...ctx.players],
		});
		if (!eligibility.eligible) {
			return;
		}

		let ratings: Map<string, Rating>;
		try {
			ratings = await this.ratingRepository.findMany(
				eligibility.players.map((player) => player.id),
				eligibility.banListName,
				ctx.season,
			);
		} catch (error) {
			this.logger.warn(
				`RatingAnnouncer: findMany failed for room ${ctx.roomId}: ${String(error)}`,
				{ roomId: ctx.roomId },
			);

			return;
		}

		this.snapshots.set(
			ctx.roomId,
			MatchRatingSnapshot.create(ratings, eligibility.banListName, ctx.season),
		);

		const teams = this.groupByTeam(
			eligibility.players,
			(player): RatingAnnouncementEntry => ({
				name: player.name,
				rating: (ratings.get(player.id) ?? Rating.initialize()).value,
			}),
		);

		ctx.announce(formatStart(teams));
	}

	async onMatchEnding(ctx: MatchContext): Promise<void> {
		const snapshot = this.snapshots.get(ctx.roomId);
		this.snapshots.delete(ctx.roomId);
		if (!snapshot) {
			return;
		}

		const eligibility = evaluateRatingEligibility({
			ranked: ctx.ranked,
			banListName: ctx.banListName,
			players: [...ctx.players],
		});
		if (!eligibility.eligible) {
			return;
		}

		const ratedPlayers: RatedPlayer[] = eligibility.players.map((player) => ({
			id: player.id,
			team: player.team,
			winner: player.winner,
		}));
		const startRatings = new Map(
			eligibility.players.map((player) => [
				player.id,
				snapshot.ratingFor(player.id) ?? Rating.initialize(),
			]),
		);
		const deltaByUserId = new Map(
			EloCalculator.deltasFor(ratedPlayers, startRatings).map((delta) => [delta.userId, delta]),
		);

		const teams = this.groupByTeam(eligibility.players, (player): RatingAnnouncementDeltaEntry => {
			const delta = deltaByUserId.get(player.id);
			const magnitude = delta?.delta ?? 0;

			return {
				name: player.name,
				rating: (delta?.previousRating ?? 0) + magnitude,
				delta: magnitude,
			};
		});

		ctx.announce(formatEnd(teams));
	}

	private groupByTeam<T>(
		players: RatedMatchPlayer[],
		mapEntry: (player: RatedMatchPlayer) => T,
	): T[][] {
		return TEAM_ORDER.map((team) => players.filter((player) => player.team === team).map(mapEntry));
	}
}
