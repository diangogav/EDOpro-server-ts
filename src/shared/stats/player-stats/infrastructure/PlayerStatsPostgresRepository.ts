import { EntityManager } from "typeorm";

import { ADVISORY_LOCK_QUERY } from "../../infrastructure/advisoryLockQuery";
import { dataSource } from "../../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../../evolution-types/src/entities/PlayerStatsEntity";
import { PlayerStats } from "../domain/PlayerStats";
import {
	PlayerStatsRepository,
	PlayerStatsTransaction,
	PointsLedgerEntry,
} from "../domain/PlayerStatsRepository";
import { config } from "./../../../../config/index";

// Target-less ON CONFLICT DO NOTHING: forward compatible with future unique
// indexes on points_ledger, unlike naming the current columns explicitly.
const INSERT_LEDGER_ENTRY_QUERY = `
	INSERT INTO points_ledger (game_id, user_id, rank_id, season, kind, cycle, points_delta, wins_delta, losses_delta)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT DO NOTHING
	RETURNING id
`;

export class PlayerStatsPostgresRepository implements PlayerStatsRepository {
	async findByUserIdAndRankId(userId: string, rankId: string): Promise<PlayerStats> {
		const repository = dataSource.getRepository(PlayerStatsEntity);
		const playerStatsResponse = await repository.findOneBy({
			rankId,
			userId,
			season: config.season,
		});
		if (!playerStatsResponse) {
			return PlayerStats.initialize({
				rankId,
				userId,
				season: config.season,
			});
		}

		return PlayerStats.from(playerStatsResponse);
	}

	async save(playerStats: PlayerStats): Promise<void> {
		const repository = dataSource.getRepository(PlayerStatsEntity);

		const playerStatsEntity = repository.create({
			id: playerStats.id,
			rankId: playerStats.rankId,
			wins: playerStats.wins,
			losses: playerStats.losses,
			points: playerStats.points,
			userId: playerStats.userId,
			season: config.season,
		});

		await repository.save(playerStatsEntity);
	}

	async transaction<T>(
		userId: string,
		rankIds: string[],
		season: number,
		work: (tx: PlayerStatsTransaction) => Promise<T>,
	): Promise<T> {
		return dataSource.transaction(async (manager) => {
			const orderedRankIds = [...rankIds].sort();

			await this.acquireLadderLocks(manager, userId, orderedRankIds, season);
			const tx = new PlayerStatsPostgresTransaction(manager, season);

			return work(tx);
		});
	}

	private async acquireLadderLocks(
		manager: EntityManager,
		userId: string,
		orderedRankIds: string[],
		season: number,
	): Promise<void> {
		for (const rankId of orderedRankIds) {
			await manager.query(ADVISORY_LOCK_QUERY, [userId, rankId, season]);
		}
	}
}

class PlayerStatsPostgresTransaction implements PlayerStatsTransaction {
	constructor(
		private readonly manager: EntityManager,
		private readonly season: number,
	) {}

	async findByUserIdAndRankId(userId: string, rankId: string): Promise<PlayerStats> {
		const repository = this.manager.getRepository(PlayerStatsEntity);
		const row = await repository.findOneBy({ userId, rankId, season: this.season });
		if (!row) {
			return PlayerStats.initialize({ rankId, userId, season: this.season });
		}

		return PlayerStats.from(row);
	}

	async save(playerStats: PlayerStats): Promise<void> {
		const repository = this.manager.getRepository(PlayerStatsEntity);

		const entity = repository.create({
			id: playerStats.id,
			rankId: playerStats.rankId,
			wins: playerStats.wins,
			losses: playerStats.losses,
			points: playerStats.points,
			userId: playerStats.userId,
			season: this.season,
		});

		await repository.save(entity);
	}

	async insertLedgerEntry(entry: PointsLedgerEntry): Promise<boolean> {
		const rows = await this.manager.query(INSERT_LEDGER_ENTRY_QUERY, [
			entry.gameId,
			entry.userId,
			entry.rankId,
			entry.season,
			entry.kind,
			entry.cycle,
			entry.pointsDelta,
			entry.winsDelta,
			entry.lossesDelta,
		]);

		return rows.length > 0;
	}
}
