import { Logger } from "@shared/logger/domain/Logger";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import {
	MatchContext,
	MatchContextPlayer,
	MatchLifecycleHook,
} from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { YGOProStocChat } from "ygopro-msg-encode";

import { AchievementCatalog, CatalogAchievement } from "../domain/AchievementCatalog";
import { AchievementUnlockedDomainEvent } from "../domain/AchievementUnlockedDomainEvent";
import { AchievementUnlockedPublisher } from "../domain/AchievementUnlockedPublisher";
import {
	AwardCandidate,
	evaluateAchievements,
	formatFirstWinCode,
} from "../domain/evaluateAchievements";
import { AchievementUnlockedClientMessage } from "../infrastructure/AchievementUnlockedClientMessage";
import { laddersForBanList } from "../domain/laddersForBanList";
import { MatchHistoryReader, MatchHistorySummary } from "../domain/MatchHistoryReader";
import { UserAchievementRepository } from "../domain/UserAchievementRepository";

const ELLIPSIS = "…";

/**
 * Awards gameplay achievements while the match is ending, so the unlock can be
 * announced to the room before its sockets close. It runs ahead of the match
 * row being persisted, which is why the current match is never in the history
 * it reads.
 */
export class AchievementAwarder implements MatchLifecycleHook {
	readonly name = "achievements";

	constructor(
		private readonly logger: Logger,
		private readonly matchHistoryReader: MatchHistoryReader,
		private readonly catalog: AchievementCatalog,
		private readonly userAchievementRepository: UserAchievementRepository,
		private readonly rankGroupResolver: RankGroupResolver,
		private readonly unlockedPublisher: AchievementUnlockedPublisher,
	) {
		this.logger = logger.child({ file: "AchievementAwarder" });
	}

	async onMatchEnding(ctx: MatchContext): Promise<void> {
		if (!ctx.ranked) {
			return;
		}

		const ladders = this.laddersFor(ctx.banListName);

		for (const player of ctx.players) {
			if (player.id === null) {
				continue;
			}
			try {
				await this.awardPlayer(ctx, player, player.id, ladders);
			} catch (error) {
				this.logger.error(error instanceof Error ? error : new Error(String(error)), {
					player: player.name,
					matchId: ctx.matchId,
				});
			}
		}
	}

	private async awardPlayer(
		ctx: MatchContext,
		player: MatchContextPlayer,
		userId: string,
		ladders: string[],
	): Promise<void> {
		const summary = await this.matchHistoryReader.summaryFor(userId, {
			excludeMatchId: ctx.matchId,
		});

		const codes = this.codesFor(summary, ladders, player.winner);
		if (codes.length === 0) {
			return;
		}

		const rows = await this.catalog.findByCodes(codes);
		const inserted = await this.userAchievementRepository.transaction(userId, async (tx) => {
			const held = await tx.heldAchievementIds(
				userId,
				rows.map((row) => row.id),
			);
			const awarded: Array<{ row: CatalogAchievement; labels: string[] }> = [];
			for (const row of rows) {
				if (held.has(row.id)) {
					continue;
				}
				const labels = this.labelsFor(row.code, ladders);
				await tx.award({
					userId: userId,
					achievementId: row.id,
					season: ctx.season,
					labels,
				});
				awarded.push({ row, labels });
				this.logger.info(`Achievement ${row.code} awarded to ${player.name} (${userId})`);
			}

			return awarded;
		});

		for (const { row, labels } of inserted) {
			await this.publishUnlocked(
				new AchievementUnlockedDomainEvent({
					userId: userId,
					username: player.name,
					achievementId: row.id,
					code: row.code,
					season: ctx.season,
					labels,
					matchId: ctx.matchId,
					roomId: ctx.roomId,
				}),
			);
			this.announceUnlocked(ctx, player.name, row.name);
			this.notifyUnlocked(ctx, userId, row);
		}
	}

	private announceUnlocked(ctx: MatchContext, playerName: string, achievementName: string): void {
		try {
			ctx.announce(this.formatUnlock(playerName, achievementName));
		} catch (error) {
			this.logger.warn(`Achievement announcement failed: ${String(error)}`);
		}
	}

	private notifyUnlocked(ctx: MatchContext, userId: string, row: CatalogAchievement): void {
		try {
			ctx.notify(userId, AchievementUnlockedClientMessage.create(row.id, row.code));
		} catch (error) {
			this.logger.warn(`Achievement unlock notification failed: ${String(error)}`);
		}
	}

	private formatUnlock(playerName: string, achievementName: string): string {
		const prefix = `🏆 ${playerName} unlocked "`;
		const suffix = '"';
		const room = YGOProStocChat.MAX_LENGTH - prefix.length - suffix.length;
		const shown =
			achievementName.length > room
				? `${achievementName.slice(0, Math.max(room - ELLIPSIS.length, 0))}${ELLIPSIS}`
				: achievementName;

		return `${prefix}${shown}${suffix}`;
	}

	private async publishUnlocked(unlocked: AchievementUnlockedDomainEvent): Promise<void> {
		try {
			await this.unlockedPublisher.publish(AchievementUnlockedDomainEvent.DOMAIN_EVENT, unlocked);
		} catch (error) {
			this.logger.error(error instanceof Error ? error : new Error(String(error)), {
				achievement: unlocked.data.code,
				userId: unlocked.data.userId,
			});
		}
	}

	private codesFor(summary: MatchHistorySummary, ladders: string[], won: boolean): string[] {
		const candidates: AwardCandidate[] = [];
		const evaluate = (ladder: string | null, ladderWinsBefore: number): void => {
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
			evaluate(null, 0);
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

	private laddersFor(banListName: string): string[] {
		return laddersForBanList(this.rankGroupResolver, banListName);
	}
}
