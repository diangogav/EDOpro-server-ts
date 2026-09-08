import "reflect-metadata";

import * as fs from "fs/promises";
import * as path from "path";

import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { Rank } from "@shared/rank/domain/Rank";
import { RankRepository } from "@shared/rank/domain/RankRepository";
import { InMemoryLoadedBanListNamesProvider } from "@shared/rank/infrastructure/InMemoryLoadedBanListNamesProvider";
import {
	getActiveRankGroupsConfig,
	loadRankGroupsConfig,
	setActiveRankGroupsConfig,
} from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import { RankPostgresRepository } from "@shared/rank/infrastructure/RankPostgresRepository";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";
import {
	PlayerStatsRepository,
	PointsLedgerEntry,
} from "src/shared/stats/player-stats/domain/PlayerStatsRepository";
import { PlayerStatsPostgresRepository } from "src/shared/stats/player-stats/infrastructure/PlayerStatsPostgresRepository";

import { config } from "../config/index";
import { dataSource } from "../evolution-types/src/data-source";
import { PostgresTypeORM } from "../evolution-types/src/PostgresTypeORM";
import {
	AchievementPointsRow,
	buildReconciliationReport,
	PlayerStatsSnapshotRow,
	ReconciliationReport,
} from "../shared/stats/points-ledger/domain/buildReconciliationReport";
import { fanOutAchievementPoints } from "../shared/stats/points-ledger/domain/fanOutAchievementPoints";
import {
	BackfillMatchRow,
	GroupsFor,
	PlanLedgerBackfillResult,
	planLedgerBackfill,
	RanksByName,
	ResolveAlias,
} from "../shared/stats/points-ledger/domain/planLedgerBackfill";

const DEFAULT_BATCH_SIZE = 200;
const GLOBAL_RANK_NAME = "Global";

const SELECT_MATCH_ROWS_QUERY = `
	SELECT user_id, game_id, season, ban_list_name, winner, points, anulled
	FROM matches
	WHERE deleted_at IS NULL
`;

// Quoted aliases so the returned row shape already IS PlayerStatsSnapshotRow.
const SELECT_PLAYER_STATS_QUERY = `
	SELECT ps.user_id AS "userId", ps.rank_id AS "rankId", r.name AS "rankName", ps.season, ps.wins, ps.losses, ps.points
	FROM player_stats ps
	JOIN ranks r ON r.id = ps.rank_id
`;

// Mirrors rebuild-player-stats.sql's achievement_points CTE.
const SELECT_ACHIEVEMENT_POINTS_QUERY = `
	SELECT ua.user_id AS "userId", label AS "rankName", ua.season, SUM(a.earned_points)::int AS points
	FROM user_achievements ua
	JOIN achievements a ON a.id = ua.achievement_id
	CROSS JOIN LATERAL json_array_elements_text(ua.labels) AS label
	GROUP BY 1, 2, 3
`;

export interface LedgerEntryInsertPort {
	insert(entry: PointsLedgerEntry): Promise<boolean>;
}

export type BackfillDependencies = {
	matchRows: { fetchRows(): Promise<BackfillMatchRow[]> };
	resolveAlias: ResolveAlias;
	groupsFor: GroupsFor;
	ranksByName: RanksByName;
	ledgerInserter: LedgerEntryInsertPort;
	playerStatsRows: { fetchRows(): Promise<PlayerStatsSnapshotRow[]> };
	achievementPointsRows: { fetchRows(): Promise<AchievementPointsRow[]> };
	writeReport(report: ReconciliationReport): Promise<void>;
	logger: { info(message: string): void };
};

export type BackfillRunOptions = { apply: boolean; batchSize?: number };

export type RunBackfillResult = { plan: PlanLedgerBackfillResult; report: ReconciliationReport };

/** Thin IO shell over the pure `planLedgerBackfill` and `buildReconciliationReport`. */
export async function runBackfill(
	deps: BackfillDependencies,
	options: BackfillRunOptions,
): Promise<RunBackfillResult> {
	const rows = await deps.matchRows.fetchRows();
	const plan = planLedgerBackfill(rows, deps.resolveAlias, deps.groupsFor, deps.ranksByName);
	const inserted = options.apply
		? await insertInBatches(
				plan.entries,
				deps.ledgerInserter,
				options.batchSize ?? DEFAULT_BATCH_SIZE,
			)
		: 0;
	const mode = options.apply
		? `APPLY — ${inserted}/${plan.entries.length} rows newly inserted`
		: "DRY RUN — nothing written";
	deps.logger.info(
		`points-ledger backfill (${mode}); ${plan.rankSummaries.length} ranks, ` +
			`${plan.unmappedBanLists.length} unmapped ban lists, ` +
			`${plan.preFlaggedGameIds.length} pre-flagged games`,
	);

	const [playerStats, achievementPointsRows] = await Promise.all([
		deps.playerStatsRows.fetchRows(),
		deps.achievementPointsRows.fetchRows(),
	]);
	const { rows: achievementPoints, unmappedLabels: unmappedAchievementLabels } =
		fanOutAchievementPoints(
			achievementPointsRows,
			deps.resolveAlias,
			deps.groupsFor,
			deps.ranksByName,
		);
	const report = buildReconciliationReport({
		planResult: plan,
		gameIds: [...new Set(rows.map((row) => row.gameId))],
		playerStats,
		achievementPoints,
		unmappedAchievementLabels,
	});
	await deps.writeReport(report);

	return { plan, report };
}

async function insertInBatches(
	entries: PointsLedgerEntry[],
	inserter: LedgerEntryInsertPort,
	batchSize: number,
): Promise<number> {
	let inserted = 0;
	for (let start = 0; start < entries.length; start += batchSize) {
		const results = await Promise.all(
			entries.slice(start, start + batchSize).map((entry) => inserter.insert(entry)),
		);
		inserted += results.filter(Boolean).length;
	}

	return inserted;
}

async function fetchMatchRows(): Promise<BackfillMatchRow[]> {
	const rows: {
		user_id: string;
		game_id: string;
		season: number;
		ban_list_name: string;
		winner: boolean;
		points: number;
		anulled: boolean;
	}[] = await dataSource.query(SELECT_MATCH_ROWS_QUERY);

	return rows.map((row) => ({
		userId: row.user_id,
		gameId: row.game_id,
		season: row.season,
		banListName: row.ban_list_name,
		winner: row.winner,
		points: row.points,
		anulled: row.anulled,
	}));
}

// Pre-fetches every rank name the plan could need (lookup-only — never
// findOrCreateByName) into a synchronous in-memory snapshot for the planner.
async function buildRanksByName(
	rows: BackfillMatchRow[],
	resolveAlias: ResolveAlias,
	groupsFor: GroupsFor,
	rankRepository: RankRepository,
): Promise<RanksByName> {
	const names = new Set<string>([GLOBAL_RANK_NAME]);
	for (const row of rows) {
		if (!row.banListName) {
			continue;
		}
		const isRankedBanList = row.banListName !== "N/A";
		const resolved = isRankedBanList ? resolveAlias(row.banListName) : row.banListName;
		names.add(resolved);
		if (isRankedBanList) {
			groupsFor(resolved).forEach((groupName) => names.add(groupName));
		}
	}

	const found = await Promise.all(
		[...names].map(
			async (name): Promise<[string, Rank | null]> => [name, await rankRepository.findByName(name)],
		),
	);
	const catalogue = new Map(found.filter((entry): entry is [string, Rank] => entry[1] !== null));

	return (name) => catalogue.get(name);
}

function ledgerInserterFor(playerStatsRepository: PlayerStatsRepository): LedgerEntryInsertPort {
	return {
		insert: (entry) =>
			playerStatsRepository.transaction(entry.userId, [entry.rankId], entry.season, (tx) =>
				tx.insertLedgerEntry(entry),
			),
	};
}

const fetchPlayerStatsRows = (): Promise<PlayerStatsSnapshotRow[]> =>
	dataSource.query(SELECT_PLAYER_STATS_QUERY);
const fetchAchievementPointsRows = (): Promise<AchievementPointsRow[]> =>
	dataSource.query(SELECT_ACHIEVEMENT_POINTS_QUERY);

async function writeReportToFile(report: ReconciliationReport): Promise<void> {
	const dir = path.join(process.cwd(), "reports");
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(
		path.join(dir, `points-ledger-reconciliation-${Date.now()}.json`),
		JSON.stringify(report, null, 2),
	);
}

async function main(): Promise<void> {
	const logger = LoggerFactory.getLogger();
	const apply = process.argv.includes("--apply");

	const postgres = new PostgresTypeORM();
	await postgres.connect();

	// Group currency depends on which banlists are "loaded" right now; a
	// standalone script has none, so this only matches live crediting when run
	// alongside a fully booted server (see design's Open Questions).
	setActiveRankGroupsConfig(loadRankGroupsConfig(config.rankGroups.path, logger));
	const resolver = new RankGroupResolver(
		getActiveRankGroupsConfig,
		new InMemoryLoadedBanListNamesProvider(),
	);
	const resolveAlias: ResolveAlias = (name) => resolver.resolveAlias(name);
	const groupsFor: GroupsFor = (name) => resolver.groupsFor(name);

	const rows = await fetchMatchRows();
	const ranksByName = await buildRanksByName(
		rows,
		resolveAlias,
		groupsFor,
		new RankPostgresRepository(),
	);

	await runBackfill(
		{
			matchRows: { fetchRows: () => Promise.resolve(rows) },
			resolveAlias,
			groupsFor,
			ranksByName,
			ledgerInserter: ledgerInserterFor(new PlayerStatsPostgresRepository()),
			playerStatsRows: { fetchRows: fetchPlayerStatsRows },
			achievementPointsRows: { fetchRows: fetchAchievementPointsRows },
			writeReport: writeReportToFile,
			logger,
		},
		{ apply },
	);

	await postgres.close();
}

if (require.main === module) {
	main().catch((error) => {
		LoggerFactory.getLogger().error(error as Error);
		process.exitCode = 1;
	});
}
