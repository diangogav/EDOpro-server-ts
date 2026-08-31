import { Logger } from "@shared/logger/domain/Logger";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { RankRepository } from "@shared/rank/domain/RankRepository";
import { Team } from "@shared/room/Team";
import {
	MatchContext,
	MatchLifecycleHook,
	RoomClosedContext,
} from "@shared/room/domain/lifecycle/MatchLifecycleHook";
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
 * the start-time snapshot is kept here, keyed by matchId — the unique match
 * identity, not the roomId (`roomId` is a small numeric slot the server
 * reuses across unrelated matches once freed). `onMatchEnding` and
 * `onRoomClosed` both release a match's snapshot; the latter guarantees
 * release even when a match never reaches a clean end (abandoned, mid-duel
 * disconnect, error fallback).
 */
export class RatingAnnouncer implements MatchLifecycleHook {
	readonly name = "rating-announcer";
	private readonly snapshots = new Map<string, MatchRatingSnapshot>();
	// Tracks the current matchId this hook has snapshotted for a given
	// roomId, so a repeat onMatchStarted call can tell a genuine re-entry for
	// the SAME match (drawn game 1) apart from a NEW match reusing a freed
	// roomId, and discard the previous match's leftover snapshot in the
	// latter case.
	private readonly matchIdByRoom = new Map<number, string>();

	constructor(
		private readonly ratingRepository: RatingRepository,
		private readonly rankRepository: RankRepository,
		private readonly rankGroupResolver: RankGroupResolver,
		private readonly logger: Logger,
	) {}

	async onMatchStarted(ctx: MatchContext): Promise<void> {
		const trackedMatchId = this.matchIdByRoom.get(ctx.roomId);
		if (trackedMatchId === ctx.matchId) {
			return;
		}
		if (trackedMatchId !== undefined) {
			this.snapshots.delete(trackedMatchId);
			this.matchIdByRoom.delete(ctx.roomId);
		}

		const eligibility = evaluateRatingEligibility({
			ranked: ctx.ranked,
			banListName: ctx.banListName,
			players: [...ctx.players],
		});
		if (!eligibility.eligible) {
			return;
		}

		// Eligibility stays keyed on the raw banlist name; the rank is
		// resolved exactly once per match — by its alias-resolved canonical
		// name — here at start, and carried in the snapshot. Announcements
		// stay on the banlist pool only: group ladders are silent.
		let rankId: string;
		let ratings: Map<string, Rating>;
		try {
			const rank = await this.rankRepository.findOrCreateByName(
				this.rankGroupResolver.resolveAlias(eligibility.banListName),
			);
			rankId = rank.id;
			ratings = await this.ratingRepository.findMany(
				eligibility.players.map((player) => player.id),
				rankId,
				ctx.season,
			);
		} catch (error) {
			this.logger.warn(
				`RatingAnnouncer: rating lookup failed for room ${ctx.roomId}: ${String(error)}`,
				{ roomId: ctx.roomId },
			);

			return;
		}

		this.snapshots.set(ctx.matchId, MatchRatingSnapshot.create(ratings, rankId, ctx.season));
		this.matchIdByRoom.set(ctx.roomId, ctx.matchId);

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
		const snapshot = this.snapshots.get(ctx.matchId);
		this.snapshots.delete(ctx.matchId);
		if (this.matchIdByRoom.get(ctx.roomId) === ctx.matchId) {
			this.matchIdByRoom.delete(ctx.roomId);
		}
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

	async onRoomClosed(ctx: RoomClosedContext): Promise<void> {
		this.snapshots.delete(ctx.matchId);
		if (this.matchIdByRoom.get(ctx.roomId) === ctx.matchId) {
			this.matchIdByRoom.delete(ctx.roomId);
		}
	}

	private groupByTeam<T>(
		players: RatedMatchPlayer[],
		mapEntry: (player: RatedMatchPlayer) => T,
	): T[][] {
		return TEAM_ORDER.map((team) => players.filter((player) => player.team === team).map(mapEntry));
	}
}
