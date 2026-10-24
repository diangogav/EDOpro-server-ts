import "reflect-metadata";

import { Logger } from "@shared/logger/domain/Logger";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { createLoadedBanListNamesProvider } from "src/bootstrap/loadedBanListNamesProvider";
import {
	getActiveRankGroupsConfig,
	loadRankGroupsConfig,
	setActiveRankGroupsConfig,
} from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

import { config } from "../config/index";
import { dataSource } from "../evolution-types/src/data-source";
import { PostgresTypeORM } from "../evolution-types/src/PostgresTypeORM";
import { AchievementCatalog } from "../plugins/achievements/domain/AchievementCatalog";
import { laddersForBanList } from "../plugins/achievements/domain/laddersForBanList";
import { MatchHistoryReplaySource } from "../plugins/achievements/domain/MatchHistoryReplaySource";
import { replayAchievements } from "../plugins/achievements/domain/replayAchievements";
import { UserAchievementRepository } from "../plugins/achievements/domain/UserAchievementRepository";
import { AchievementCatalogPostgresRepository } from "../plugins/achievements/infrastructure/postgres/AchievementCatalogPostgresRepository";
import { MatchHistoryReplayPostgresSource } from "../plugins/achievements/infrastructure/postgres/MatchHistoryReplayPostgresSource";
import { UserAchievementPostgresRepository } from "../plugins/achievements/infrastructure/postgres/UserAchievementPostgresRepository";

// Users whose rows survive hard deletion; matches of deleted accounts are
// skipped, as in the points-ledger backfill.
const SELECT_USER_IDS_QUERY = `SELECT id FROM users`;

// A ladder achievement only exists for ladders the catalog seeds, so a missing
// row for one of them is expected rather than a configuration problem.
const LADDER_CODE_PREFIX = "format_first_win:";

export type BackfillAchievementsDependencies = {
	source: MatchHistoryReplaySource;
	knownUserIds: { fetchRows(): Promise<Array<{ id: string }>> };
	catalog: AchievementCatalog;
	userAchievements: UserAchievementRepository;
	laddersFor: (banListName: string) => string[];
	logger: Pick<Logger, "info" | "debug" | "warn">;
};

export type BackfillAchievementsOptions = { dryRun: boolean };

export type BackfillAchievementsSummary = {
	usersScanned: number;
	usersSkipped: number;
	/** Catalog-backed awards the replay produced, before the held check. */
	awardsPlanned: number;
	awardsInserted: number;
	/** Non-ladder codes the replay reached that have no catalog row. */
	unknownCodes: string[];
};

/**
 * Replays each user's ranked history to award the gameplay achievements the
 * live plugin would have granted. Re-running is safe: only achievements the
 * user does not hold are inserted. A dry run never opens a transaction, so it
 * cannot see held rows and reports every catalog-backed award as planned.
 */
export async function runBackfill(
	deps: BackfillAchievementsDependencies,
	options: BackfillAchievementsOptions,
): Promise<BackfillAchievementsSummary> {
	const known = new Set((await deps.knownUserIds.fetchRows()).map((row) => row.id));
	const userIds = await deps.source.userIdsWithMatches();
	const unknownCodes = new Set<string>();
	const summary: BackfillAchievementsSummary = {
		usersScanned: userIds.length,
		usersSkipped: 0,
		awardsPlanned: 0,
		awardsInserted: 0,
		unknownCodes: [],
	};

	for (const userId of userIds) {
		if (!known.has(userId)) {
			summary.usersSkipped += 1;
			continue;
		}

		const replayed = replayAchievements(await deps.source.historyFor(userId), deps.laddersFor);
		if (replayed.length === 0) {
			continue;
		}

		const rows = await deps.catalog.findByCodes(replayed.map((award) => award.code));
		const idByCode = new Map(rows.map((row) => [row.code, row.id]));
		for (const { code } of replayed) {
			if (!idByCode.has(code) && !code.startsWith(LADDER_CODE_PREFIX) && !unknownCodes.has(code)) {
				unknownCodes.add(code);
				deps.logger.warn(`Achievement code ${code} has no catalog row; it is not awarded`);
			}
		}

		const planned = replayed.filter((award) => idByCode.has(award.code));
		summary.awardsPlanned += planned.length;
		if (options.dryRun || planned.length === 0) {
			continue;
		}

		await deps.userAchievements.transaction(userId, async (tx) => {
			const held = await tx.heldAchievementIds(
				userId,
				planned.map((award) => idByCode.get(award.code) as number),
			);
			for (const award of planned) {
				const achievementId = idByCode.get(award.code) as number;
				if (held.has(achievementId)) {
					continue;
				}
				await tx.award({ userId, achievementId, season: award.season, labels: award.labels });
				summary.awardsInserted += 1;
				deps.logger.debug(
					`Achievement ${award.code} awarded to ${userId} (season ${award.season})`,
				);
			}
		});
	}

	summary.unknownCodes = [...unknownCodes];
	const mode = options.dryRun ? "DRY RUN — nothing written" : "APPLY";
	deps.logger.info(
		`achievements backfill (${mode}); ${summary.usersScanned} users scanned, ` +
			`${summary.usersSkipped} skipped (missing from users), ${summary.awardsPlanned} awards planned, ` +
			`${summary.awardsInserted} inserted, ${summary.unknownCodes.length} codes without a catalog row`,
	);

	return summary;
}

async function main(): Promise<void> {
	const logger = LoggerFactory.getLogger();
	// Dry run by default, like the points-ledger backfill: writing needs --apply.
	const dryRun = !process.argv.includes("--apply");

	const postgres = new PostgresTypeORM();
	await postgres.connect();

	// Group ladders depend on which ban lists are loaded; a standalone script
	// has none, so this matches live awarding only against a fully booted server.
	setActiveRankGroupsConfig(loadRankGroupsConfig(config.rankGroups.path, logger));
	const resolver = new RankGroupResolver(
		getActiveRankGroupsConfig,
		createLoadedBanListNamesProvider(),
	);

	await runBackfill(
		{
			source: new MatchHistoryReplayPostgresSource(),
			knownUserIds: { fetchRows: () => dataSource.query(SELECT_USER_IDS_QUERY) },
			catalog: new AchievementCatalogPostgresRepository(),
			userAchievements: new UserAchievementPostgresRepository(),
			laddersFor: (banListName) => laddersForBanList(resolver, banListName),
			logger,
		},
		{ dryRun },
	);

	await postgres.close();
}

if (require.main === module) {
	main().catch((error) => {
		LoggerFactory.getLogger().error(error as Error);
		process.exitCode = 1;
	});
}
