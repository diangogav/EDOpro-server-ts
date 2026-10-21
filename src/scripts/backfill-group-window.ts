import "reflect-metadata";

import * as fs from "fs/promises";
import * as path from "path";
import { EntityManager } from "typeorm";

import { USER_ACHIEVEMENTS_LOCK_QUERY } from "src/plugins/achievements/infrastructure/postgres/UserAchievementPostgresRepository";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

import { dataSource } from "../evolution-types/src/data-source";
import { PostgresTypeORM } from "../evolution-types/src/PostgresTypeORM";
import { RatingProperties } from "../shared/stats/rating/domain/Rating";
import {
	baselineAtWindowStart,
	compareReplayWithStored,
	RatingStep,
	replayRatingWindow,
	StoredWindowRow,
	validateWindowGame,
	WindowGame,
} from "../shared/stats/rating/domain/replayRatingWindow";

/**
 * Re-credits a group ladder (e.g. "TCG") for ranked games played on one
 * banlist (e.g. "2026.09 TCG") that the group skipped while the servers
 * disagreed on its newest list, and recomputes the group's Elo from the
 * window start in game order.
 *
 * Usage:
 *   pnpm build && node dist/src/scripts/backfill-group-window.js --group TCG --banlist "2026.09 TCG" \
 *     --since 2026-10-19T00:00:00Z --season 7 --report-dir <dir> [--apply]
 *
 * Without --apply it runs in a read-only transaction and only writes the
 * report. With --apply it locks player_ratings (blocking live Elo writes for
 * the duration), exports every row it will change, refuses to continue if
 * replaying the stored window does not reproduce it, then writes.
 */

const RANK_ID_QUERY = `SELECT id FROM ranks WHERE name = $1 AND type = $2`;

const WINDOW_HISTORY_QUERY = `
	SELECT match_id::text AS "gameId", user_id AS "userId", kind, cycle,
		previous_rating AS "previousRating", delta, k_factor AS "kFactor", opponent_rating AS "opponentRating"
	FROM rating_history
	WHERE rank_id = $1 AND season = $2 AND created_at >= $3
	ORDER BY created_at ASC, id ASC
`;

const PRE_WINDOW_HISTORY_QUERY = `
	SELECT user_id AS "userId", previous_rating AS "previousRating", delta
	FROM rating_history
	WHERE rank_id = $1 AND season = $2 AND created_at < $3 AND user_id = ANY($4)
`;

// Games of the banlist inside the window that the group never credited.
const MISSING_GAMES_QUERY = `
	SELECT DISTINCT m.game_id::text AS "gameId"
	FROM matches m
	WHERE m.ban_list_name = $1 AND m.created_at >= $2 AND m.season = $3
		AND NOT m.anulled AND m.deleted_at IS NULL
		AND NOT EXISTS (
			SELECT 1 FROM points_ledger l WHERE l.game_id = m.game_id AND l.rank_id = $4
		)
`;

// The banlist rank's applied rows of the missing games: they mark the games
// Elo rated live and carry the moment each player's rating was computed.
const RATED_ON_BANLIST_QUERY = `
	SELECT match_id::text AS "gameId", user_id AS "userId", created_at AS "createdAt"
	FROM rating_history
	WHERE rank_id = $1 AND season = $2 AND match_id::text = ANY($3)
		AND kind = 'applied' AND cycle = 0
`;

const GROUP_HISTORY_FOR_GAMES_QUERY = `
	SELECT DISTINCT match_id::text AS "gameId" FROM rating_history
	WHERE rank_id = $1 AND match_id::text = ANY($2)
`;

const GAME_ROWS_QUERY = `
	SELECT game_id::text AS "gameId", user_id AS "userId", winner, points, season, created_at AS "createdAt"
	FROM matches
	WHERE game_id::text = ANY($1) AND NOT anulled AND deleted_at IS NULL
	ORDER BY created_at ASC, id ASC
`;

const RATINGS_QUERY = `
	SELECT user_id AS "userId", rating AS value, games_played AS "gamesPlayed", peak
	FROM player_ratings
	WHERE rank_id = $1 AND season = $2 AND user_id = ANY($3)
`;

const PLAYER_STATS_QUERY = `
	SELECT user_id AS "userId", wins, losses, points
	FROM player_stats
	WHERE rank_id = $1 AND season = $2 AND user_id = ANY($3)
`;

const ACHIEVEMENT_ID_QUERY = `SELECT id FROM achievements WHERE code = $1`;

const ACHIEVEMENT_HOLDERS_QUERY = `
	SELECT DISTINCT user_id AS "userId" FROM user_achievements
	WHERE achievement_id = $1 AND user_id = ANY($2)
`;

const UPDATE_HISTORY_QUERY = `
	UPDATE rating_history
	SET previous_rating = $5, delta = $6, k_factor = $7, opponent_rating = $8
	WHERE match_id::text = $1 AND user_id = $2 AND rank_id = $3 AND season = $4
		AND kind = 'applied' AND cycle = 0
	RETURNING id
`;

const INSERT_HISTORY_QUERY = `
	INSERT INTO rating_history (match_id, user_id, rank_id, season, kind, previous_rating, delta, k_factor, opponent_rating, cycle, created_at)
	VALUES ($1, $2, $3, $4, 'applied', $5, $6, $7, $8, 0, $9)
	ON CONFLICT DO NOTHING
	RETURNING id
`;

const UPSERT_RATING_QUERY = `
	INSERT INTO player_ratings (user_id, rank_id, season, rating, games_played, peak)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (user_id, rank_id, season)
	DO UPDATE SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, peak = EXCLUDED.peak, updated_at = now()
`;

const INSERT_LEDGER_QUERY = `
	INSERT INTO points_ledger (game_id, user_id, rank_id, season, kind, cycle, points_delta, wins_delta, losses_delta)
	VALUES ($1, $2, $3, $4, 'applied', 0, $5, $6, $7)
	ON CONFLICT DO NOTHING
	RETURNING id
`;

const UPSERT_PLAYER_STATS_QUERY = `
	INSERT INTO player_stats (user_id, rank_id, season, points, wins, losses)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (user_id, rank_id, season)
	DO UPDATE SET points = player_stats.points + EXCLUDED.points,
		wins = player_stats.wins + EXCLUDED.wins,
		losses = player_stats.losses + EXCLUDED.losses
`;

const INSERT_ACHIEVEMENT_QUERY = `
	INSERT INTO user_achievements (id, user_id, achievement_id, labels, unlocked_at, season)
	VALUES (gen_random_uuid(), $1, $2, $3, now(), $4)
`;

type Options = {
	group: string;
	banList: string;
	since: Date;
	season: number;
	reportDir: string;
	apply: boolean;
};

type HistoryRow = StoredWindowRow & { kind: string; cycle: number };

type GameRow = {
	gameId: string;
	userId: string;
	winner: boolean;
	points: number;
	season: number;
};

type LedgerCredit = {
	gameId: string;
	userId: string;
	points: number;
	winner: boolean;
};

class BackfillAbort extends Error {}

export function parseOptions(argv: string[]): Options {
	const value = (flag: string): string => {
		const index = argv.indexOf(flag);
		const found = index === -1 ? undefined : argv[index + 1];
		if (found === undefined || found.startsWith("--")) {
			throw new BackfillAbort(`Missing required option ${flag}`);
		}

		return found;
	};
	const since = new Date(value("--since"));
	if (Number.isNaN(since.getTime())) {
		throw new BackfillAbort("--since must be an ISO timestamp");
	}
	const season = Number(value("--season"));
	if (!Number.isInteger(season)) {
		throw new BackfillAbort("--season must be an integer");
	}

	return {
		group: value("--group"),
		banList: value("--banlist"),
		since,
		season,
		reportDir: value("--report-dir"),
		apply: argv.includes("--apply"),
	};
}

async function rankId(manager: EntityManager, name: string, type: string): Promise<string> {
	const rows: Array<{ id: string }> = await manager.query(RANK_ID_QUERY, [name, type]);
	if (rows.length !== 1) {
		throw new BackfillAbort(
			`Expected exactly one ${type} rank named "${name}", found ${rows.length}`,
		);
	}

	return rows[0].id;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const list = groups.get(key(item)) ?? [];
		list.push(item);
		groups.set(key(item), list);
	}

	return groups;
}

async function run(manager: EntityManager, options: Options): Promise<Record<string, unknown>> {
	if (options.apply) {
		// EXCLUSIVE blocks the live path's SELECT ... FOR UPDATE on player_ratings,
		// so no Elo write lands between the reads below and this commit.
		await manager.query(`LOCK TABLE player_ratings IN EXCLUSIVE MODE`);
	} else {
		await manager.query(`SET TRANSACTION READ ONLY`);
	}

	const groupRankId = await rankId(manager, options.group, "group");
	const banListRankId = await rankId(manager, options.banList, "banlist");

	const windowHistory: HistoryRow[] = await manager.query(WINDOW_HISTORY_QUERY, [
		groupRankId,
		options.season,
		options.since,
	]);
	const unexpected = windowHistory.filter((row) => row.kind !== "applied" || row.cycle !== 0);
	if (unexpected.length > 0) {
		throw new BackfillAbort(
			`Window holds ${unexpected.length} ${options.group} history rows that are not applied/cycle 0`,
		);
	}

	const missingGameIds: string[] = (
		await manager.query(MISSING_GAMES_QUERY, [
			options.banList,
			options.since,
			options.season,
			groupRankId,
		])
	).map((row: { gameId: string }) => row.gameId);
	const alreadyRated: Array<{ gameId: string }> = await manager.query(
		GROUP_HISTORY_FOR_GAMES_QUERY,
		[groupRankId, missingGameIds],
	);
	if (alreadyRated.length > 0) {
		throw new BackfillAbort(
			`${alreadyRated.length} uncredited games already have ${options.group} rating history`,
		);
	}
	const banListRows: Array<{ gameId: string; userId: string; createdAt: Date }> =
		await manager.query(RATED_ON_BANLIST_QUERY, [banListRankId, options.season, missingGameIds]);
	const ratedMissing = new Set(banListRows.map((row) => row.gameId));
	// Inserted rows keep the live timestamp, so history ordered by created_at
	// (and a later run of this script) sees them where the game happened.
	const ratedAt = new Map(banListRows.map((row) => [`${row.gameId}:${row.userId}`, row.createdAt]));

	const existingGameIds = [...new Set(windowHistory.map((row) => row.gameId))];
	const gameRows: GameRow[] = await manager.query(GAME_ROWS_QUERY, [
		[...existingGameIds, ...missingGameIds],
	]);
	const otherSeason = gameRows.filter((row) => row.season !== options.season);
	if (otherSeason.length > 0) {
		throw new BackfillAbort(`${otherSeason.length} window match rows belong to another season`);
	}

	// Map insertion order follows GAME_ROWS_QUERY's created_at order, so games
	// replay in the order they finished.
	const rowsByGame = groupBy(gameRows, (row) => row.gameId);
	const missing = new Set(missingGameIds);
	const games: WindowGame[] = [...rowsByGame].map(([gameId, rows]) => ({
		gameId,
		players: rows.map((row) => ({ userId: row.userId, winner: row.winner })),
		rated: missing.has(gameId) ? ratedMissing.has(gameId) : true,
	}));
	for (const gameId of [...existingGameIds, ...missingGameIds]) {
		if (!rowsByGame.has(gameId)) {
			throw new BackfillAbort(`Game ${gameId} has no countable match rows`);
		}
	}
	const invalid = games
		.map(validateWindowGame)
		.filter((reason): reason is string => reason !== null);
	if (invalid.length > 0) {
		throw new BackfillAbort(invalid.join("; "));
	}

	const userIds = [...new Set(gameRows.map((row) => row.userId))];
	const currentRows: Array<RatingProperties & { userId: string }> = await manager.query(
		RATINGS_QUERY,
		[groupRankId, options.season, userIds],
	);
	const current = new Map(
		currentRows.map((row) => [
			row.userId,
			{ value: row.value, gamesPlayed: row.gamesPlayed, peak: row.peak },
		]),
	);
	const preWindow: Array<RatingStep & { userId: string }> = await manager.query(
		PRE_WINDOW_HISTORY_QUERY,
		[groupRankId, options.season, options.since, userIds],
	);
	const preWindowByUser = groupBy(preWindow, (row) => row.userId);
	const windowByUser = groupBy(windowHistory, (row) => row.userId);
	const baselines = new Map(
		userIds.map((userId) => [
			userId,
			baselineAtWindowStart(
				current.get(userId) ?? null,
				windowByUser.get(userId) ?? [],
				preWindowByUser.get(userId) ?? [],
			),
		]),
	);

	// Self-check: replaying only what is stored must reproduce it exactly.
	const storedOnly = replayRatingWindow(
		baselines,
		games.filter((game) => !missing.has(game.gameId)),
	);
	const rowMismatches = compareReplayWithStored(windowHistory, storedOnly.rows);
	const ratingMismatches = [...windowByUser.keys()]
		.map((userId) => ({
			userId,
			stored: current.get(userId),
			replayed: storedOnly.finals.get(userId),
		}))
		.filter(({ stored, replayed }) => JSON.stringify(stored) !== JSON.stringify(replayed));

	const replay = replayRatingWindow(baselines, games);
	const existingKeys = new Set(windowHistory.map((row) => `${row.gameId}:${row.userId}`));
	const historyUpdates = replay.rows.filter((row) =>
		existingKeys.has(`${row.gameId}:${row.userId}`),
	);
	const historyInserts = replay.rows.filter(
		(row) => !existingKeys.has(`${row.gameId}:${row.userId}`),
	);
	const changedHistory = compareReplayWithStored(windowHistory, historyUpdates);
	const ratedUsers = [...new Set(replay.rows.map((row) => row.userId))];

	const ledgerCredits: LedgerCredit[] = gameRows
		.filter((row) => missing.has(row.gameId))
		.map((row) => ({
			gameId: row.gameId,
			userId: row.userId,
			points: row.points,
			winner: row.winner,
		}));
	const achievementCode = `format_first_win:${options.group}`;
	const achievementRows: Array<{ id: number }> = await manager.query(ACHIEVEMENT_ID_QUERY, [
		achievementCode,
	]);
	const achievementId = achievementRows[0]?.id ?? null;
	const winners = [...new Set(ledgerCredits.filter((row) => row.winner).map((row) => row.userId))];
	const holders = new Set(
		achievementId === null
			? []
			: (await manager.query(ACHIEVEMENT_HOLDERS_QUERY, [achievementId, winners])).map(
					(row: { userId: string }) => row.userId,
				),
	);
	const newAchievementHolders =
		achievementId === null ? [] : winners.filter((id) => !holders.has(id));

	const report = {
		options: { ...options, since: options.since.toISOString() },
		groupRankId,
		banListRankId,
		windowGames: games.length,
		existingGames: existingGameIds.length,
		missingGames: missingGameIds.length,
		missingGamesRated: ratedMissing.size,
		selfCheck: { rowMismatches, ratingMismatches },
		historyRowsChanged: changedHistory.length,
		historyRowsInserted: historyInserts.length,
		ledgerRowsToInsert: ledgerCredits.length,
		achievement: { code: achievementCode, id: achievementId, newHolders: newAchievementHolders },
		ratings: ratedUsers
			.map((userId) => ({
				userId,
				before: current.get(userId) ?? null,
				after: replay.finals.get(userId),
			}))
			.sort((left, right) => (right.after?.value ?? 0) - (left.after?.value ?? 0)),
		historyChanges: changedHistory,
		historyInserts,
	};

	if (!options.apply) {
		return report;
	}
	if (rowMismatches.length > 0 || ratingMismatches.length > 0) {
		throw new BackfillAbort(
			`Self-check failed (${rowMismatches.length} history rows, ${ratingMismatches.length} ratings); nothing was written`,
		);
	}

	const statsBefore = await manager.query(PLAYER_STATS_QUERY, [
		groupRankId,
		options.season,
		[...new Set(ledgerCredits.map((row) => row.userId))],
	]);
	await writeJson(options.reportDir, "export", {
		windowHistory,
		playerRatings: currentRows,
		playerStats: statsBefore,
		achievementHolders: [...holders],
	});

	for (const row of historyUpdates) {
		const [updated] = await manager.query(UPDATE_HISTORY_QUERY, [
			row.gameId,
			row.userId,
			groupRankId,
			options.season,
			row.previousRating,
			row.delta,
			row.kFactor,
			row.opponentRating,
		]);
		if (updated.length !== 1) {
			throw new BackfillAbort(
				`Expected one history row for ${row.gameId}/${row.userId}, updated ${updated.length}`,
			);
		}
	}
	for (const row of historyInserts) {
		const createdAt = ratedAt.get(`${row.gameId}:${row.userId}`);
		if (createdAt === undefined) {
			throw new BackfillAbort(`No ${options.banList} rating row for ${row.gameId}/${row.userId}`);
		}
		const inserted = await manager.query(INSERT_HISTORY_QUERY, [
			row.gameId,
			row.userId,
			groupRankId,
			options.season,
			row.previousRating,
			row.delta,
			row.kFactor,
			row.opponentRating,
			createdAt,
		]);
		if (inserted.length !== 1) {
			throw new BackfillAbort(`History row for ${row.gameId}/${row.userId} already existed`);
		}
	}
	for (const userId of ratedUsers) {
		const final = replay.finals.get(userId) as RatingProperties;
		await manager.query(UPSERT_RATING_QUERY, [
			userId,
			groupRankId,
			options.season,
			final.value,
			final.gamesPlayed,
			final.peak,
		]);
	}

	let ledgerInserted = 0;
	for (const credit of ledgerCredits) {
		const inserted = await manager.query(INSERT_LEDGER_QUERY, [
			credit.gameId,
			credit.userId,
			groupRankId,
			options.season,
			credit.points,
			credit.winner ? 1 : 0,
			credit.winner ? 0 : 1,
		]);
		// player_stats is not idempotent: only a ledger row that was really
		// inserted may move it.
		if (inserted.length === 1) {
			ledgerInserted += 1;
			await manager.query(UPSERT_PLAYER_STATS_QUERY, [
				credit.userId,
				groupRankId,
				options.season,
				credit.points,
				credit.winner ? 1 : 0,
				credit.winner ? 0 : 1,
			]);
		}
	}

	for (const userId of newAchievementHolders) {
		// Same per-user lock and held check as the live award path, so a live
		// award landing meanwhile cannot produce a duplicate.
		await manager.query(USER_ACHIEVEMENTS_LOCK_QUERY, [userId]);
		const held = await manager.query(ACHIEVEMENT_HOLDERS_QUERY, [achievementId, [userId]]);
		if (held.length > 0) {
			continue;
		}
		await manager.query(INSERT_ACHIEVEMENT_QUERY, [
			userId,
			achievementId,
			JSON.stringify([options.group]),
			options.season,
		]);
	}

	return { ...report, applied: { ledgerInserted } };
}

async function writeJson(dir: string, name: string, content: unknown): Promise<string> {
	await fs.mkdir(dir, { recursive: true });
	const file = path.join(dir, `group-window-${name}-${Date.now()}.json`);
	await fs.writeFile(file, JSON.stringify(content, null, 2));

	return file;
}

async function main(): Promise<void> {
	const logger = LoggerFactory.getLogger();
	const options = parseOptions(process.argv.slice(2));

	const postgres = new PostgresTypeORM();
	await postgres.connect();
	try {
		const report = await dataSource.transaction((manager) => run(manager, options));
		const file = await writeJson(options.reportDir, options.apply ? "applied" : "dry-run", report);
		logger.info(`Group window backfill ${options.apply ? "applied" : "dry-run"}; report: ${file}`);
	} finally {
		await postgres.close();
	}
}

if (require.main === module) {
	main().catch((error) => {
		LoggerFactory.getLogger().error(error as Error);
		process.exitCode = 1;
	});
}
