import { Logger } from "src/shared/logger/domain/Logger";
import { Player } from "src/shared/player/domain/Player";
import { RankGroupResolver } from "src/shared/rank/application/RankGroupResolver";
import { Rank } from "src/shared/rank/domain/Rank";
import { RankRepository } from "src/shared/rank/domain/RankRepository";
import { UserProfileRepository } from "src/shared/user-profile/domain/UserProfileRepository";

import { DomainEventSubscriber } from "../../../shared/event-bus/EventBus";
import { GameOverDomainEvent } from "../../../shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { MatchResumeCreator } from "../../../shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "../../../shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { PlayerStatsRepository } from "../../../shared/stats/player-stats/domain/PlayerStatsRepository";
import { config } from "../../../config/index";

export class BasicStatsCalculator implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	constructor(
		private readonly logger: Logger,
		private readonly userProfileRepository: UserProfileRepository,
		private readonly playerStatsRepository: PlayerStatsRepository,
		private readonly rankRepository: RankRepository,
		private readonly rankGroupResolver: RankGroupResolver,
		private readonly matchResumeCreator: MatchResumeCreator,
		private readonly duelResumeCreator: DuelResumeCreator,
	) {
		this.logger = logger.child({ file: "BasicStatsCalculator" });
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		this.logger.info(
			`Duel finished for ${event.data.players.map((player) => player.name).join(" ")}`,
		);

		if (!event.data.ranked) {
			this.logger.info(`Match started as *non-ranked*. Players' MMR will not be affected.`);

			return;
		}

		const banListName = event.data.banListName;
		const players = event.data.players.map((item) => new Player(item));

		const gameId = event.data.matchId;

		// The alias resolves before any rank lookup so a renamed header keeps
		// feeding its canonical rank.
		const hasRankedBanList = Boolean(banListName) && banListName !== "N/A";
		const resolvedBanListName = hasRankedBanList
			? this.rankGroupResolver.resolveAlias(banListName)
			: banListName;

		const banListRank = hasRankedBanList
			? await this.rankRepository.findOrCreateByName(resolvedBanListName)
			: null;
		const globalRank = await this.rankRepository.findOrCreateByName("Global");
		const groupNames = hasRankedBanList
			? this.rankGroupResolver.groupsFor(resolvedBanListName)
			: [];
		const groupRanks: Rank[] = [];
		for (const groupName of groupNames) {
			groupRanks.push(await this.rankRepository.findOrCreateByName(groupName, "group"));
		}

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
			// One row per rank with the same wins/losses/points math: the
			// banlist rank (when played on a real list), Global, and every
			// group ladder the played list feeds.
			const statsRanks = [...(banListRank ? [banListRank] : []), globalRank, ...groupRanks];
			for (const rank of statsRanks) {
				const playerStats = await this.playerStatsRepository.findByUserIdAndRankId(
					userProfile.id,
					rank.id,
				);
				playerStats.addPoints(points);
				player.winner ? playerStats.increaseWins() : playerStats.increaseLosses();
				void this.playerStatsRepository.save(playerStats);
			}

			const { id: matchId } = await this.matchResumeCreator.run({
				userId: userProfile.id,
				gameId,
				bestOf: event.data.bestOf,
				playerNames,
				opponentNames,
				playerIds: playerIds.filter((id): id is string => id !== null),
				opponentIds: opponentIds.filter((id): id is string => id !== null),
				date: event.data.date,
				banListName: banListName,
				banListHash: event.data.banListHash.toString(),
				playerScore: player.wins,
				opponentScore: player.losses,
				winner: player.winner,
				season: config.season,
				points,
			});

			this.logger.info(
				`Match saved with id ${matchId} for user: ${userProfile.id} with name ${player.name}`,
			);

			// duels rows are one per player per game: both players' rows of game i
			// carry the same duelId. A count mismatch means positional matching is
			// untrustworthy — persist null rather than guessing, and say so.
			const duelIds = event.data.duelIds;
			const idsMatchGames = duelIds.length === player.games.length;
			if (!idsMatchGames) {
				this.logger.warn(
					`duelIds count (${duelIds.length}) does not match games count (${player.games.length}) for ${player.name} — persisting duel resumes without duelId`,
				);
			}

			for (const [index, game] of player.games.entries()) {
				void this.duelResumeCreator.run({
					userId: userProfile.id,
					gameId,
					duelId: idsMatchGames ? duelIds[index] : null,
					playerNames,
					opponentNames,
					date: event.data.date,
					banListName: banListName,
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
