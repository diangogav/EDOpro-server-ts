import { DomainEventSubscriber } from "@shared/event-bus/EventBus";
import { Logger } from "@shared/logger/domain/Logger";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";

import { config } from "../../../config/index";
import { AchievementCatalog } from "../domain/AchievementCatalog";
import {
	AwardCandidate,
	evaluateAchievements,
	formatFirstWinCode,
} from "../domain/evaluateAchievements";
import { MatchHistoryReader, MatchHistorySummary } from "../domain/MatchHistoryReader";
import { UserAchievementRepository } from "../domain/UserAchievementRepository";

const NO_BAN_LIST = "N/A";

export class AchievementAwarder implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	constructor(
		private readonly logger: Logger,
		private readonly userProfileRepository: UserProfileRepository,
		private readonly matchHistoryReader: MatchHistoryReader,
		private readonly catalog: AchievementCatalog,
		private readonly userAchievementRepository: UserAchievementRepository,
		private readonly rankGroupResolver: RankGroupResolver,
	) {
		this.logger = logger.child({ file: "AchievementAwarder" });
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		if (!event.data.ranked) {
			return;
		}

		const ladders = this.laddersFor(event.data.banListName);

		for (const player of event.data.players) {
			try {
				await this.awardPlayer(event, player, ladders);
			} catch (error) {
				this.logger.error(error instanceof Error ? error : new Error(String(error)), {
					player: player.name,
					matchId: event.data.matchId,
				});
			}
		}
	}

	private async awardPlayer(
		event: GameOverDomainEvent,
		player: { name: string; winner: boolean },
		ladders: string[],
	): Promise<void> {
		const userProfile = await this.userProfileRepository.findByUsername(player.name);
		if (!userProfile) {
			return;
		}

		const summary = await this.matchHistoryReader.summaryFor(userProfile.id, {
			excludeMatchId: event.data.matchId,
		});

		const codes = this.codesFor(summary, ladders, player.winner);
		if (codes.length === 0) {
			return;
		}

		const rows = await this.catalog.findByCodes(codes);
		const held = await this.userAchievementRepository.heldAchievementIds(
			userProfile.id,
			rows.map((row) => row.id),
		);
		for (const row of rows) {
			if (held.has(row.id)) {
				continue;
			}
			const labels = this.labelsFor(row.code, ladders);
			const created = await this.userAchievementRepository.award({
				userId: userProfile.id,
				achievementId: row.id,
				season: config.season,
				labels,
			});
			if (created) {
				this.logger.info(`Achievement ${row.code} awarded to ${player.name} (${userProfile.id})`);
			}
		}
	}

	private codesFor(summary: MatchHistorySummary, ladders: string[], won: boolean): string[] {
		const candidates: AwardCandidate[] = [];
		const evaluate = (ladder: string, ladderWinsBefore: number): void => {
			candidates.push(
				...evaluateAchievements({
					rankedWinsBefore: summary.rankedWins,
					rankedMatchesBefore: summary.rankedMatches,
					currentStreakBefore: summary.currentStreak,
					ladderWinsBefore,
					ladder,
					won,
				}),
			);
		};

		if (ladders.length === 0) {
			// No ladder: ladderWinsBefore is irrelevant because no format row can match.
			evaluate(NO_BAN_LIST, 1);
		}
		for (const ladder of ladders) {
			evaluate(ladder, this.ladderWinsIn(summary, ladder));
		}

		return [...new Set(candidates.map((candidate) => candidate.code))];
	}

	private labelsFor(code: string, ladders: string[]): string[] {
		const ladder = ladders.find((name) => formatFirstWinCode(name) === code);

		return ladder ? [ladder] : [];
	}

	private ladderWinsIn(summary: MatchHistorySummary, ladder: string): number {
		return Object.entries(summary.ladderWins)
			.filter(([banListName]) => this.laddersFor(banListName).includes(ladder))
			.reduce((total, [, wins]) => total + wins, 0);
	}

	// A played list feeds its own canonical rank and every group ladder it
	// belongs to; the catalog decides which of those ladders have a row.
	private laddersFor(banListName: string): string[] {
		if (!banListName || banListName === NO_BAN_LIST) {
			return [];
		}
		const resolved = this.rankGroupResolver.resolveAlias(banListName);

		return [...new Set([resolved, ...this.rankGroupResolver.groupsFor(resolved)])];
	}
}
