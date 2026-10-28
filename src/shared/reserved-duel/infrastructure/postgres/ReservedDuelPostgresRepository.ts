import { dataSource } from "src/evolution-types/src/data-source";

import { Reservation } from "../../domain/Reservation";
import {
	ReservedDuelAbandon,
	ReservedDuelRepository,
	ReservedDuelResult,
} from "../../domain/ReservedDuelRepository";

/** Raw SQL over the shared data source; every terminal write requires an open row. */
export class ReservedDuelPostgresRepository implements ReservedDuelRepository {
	public async open(input: {
		reservation: Reservation;
		instanceId: string;
		roomId: number;
		joinedSeat: number;
	}): Promise<void> {
		const { reservation } = input;
		await dataSource.transaction(async (manager) => {
			await manager.query(
				`INSERT INTO "reserved_duels"
					("reservation_id", "format", "mode", "room_id", "server_instance_id", "joined_at")
				VALUES ($1, $2, $3, $4, $5, now())`,
				[reservation.id, reservation.format, reservation.mode, input.roomId, input.instanceId],
			);
			for (const participant of reservation.participants) {
				await manager.query(
					`INSERT INTO "reserved_duel_participants"
						("reservation_id", "seat", "kind", "user_id", "bot_name", "joined_at")
					VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN now() END)`,
					[
						reservation.id,
						participant.seat,
						participant.kind,
						participant.kind === "user" ? participant.userId : null,
						participant.kind === "windbot" ? participant.botName : null,
						participant.seat === input.joinedSeat,
					],
				);
			}
		});
	}

	public async exists(reservationId: string): Promise<boolean> {
		const rows: unknown[] = await dataSource.query(
			`SELECT true AS "exists" FROM "reserved_duels" WHERE "reservation_id" = $1`,
			[reservationId],
		);

		return rows.length > 0;
	}

	public async claimSeat(reservationId: string, seat: number): Promise<boolean> {
		const affected = await this.execute(
			`UPDATE "reserved_duel_participants" SET "joined_at" = now()
			WHERE "reservation_id" = $1 AND "seat" = $2 AND "joined_at" IS NULL`,
			[reservationId, seat],
		);

		return affected > 0;
	}

	public async markStarted(reservationId: string, matchId: string): Promise<void> {
		await this.execute(
			`UPDATE "reserved_duels" SET "started_at" = now(), "match_id" = $2
			WHERE "reservation_id" = $1 AND "started_at" IS NULL AND "ended_at" IS NULL`,
			[reservationId, matchId],
		);
	}

	public async recordAbandon(
		reservationId: string,
		abandon: ReservedDuelAbandon,
	): Promise<boolean> {
		const affected = await this.execute(
			`UPDATE "reserved_duels"
			SET "outcome" = 'abandoned', "abandoned_by_seat" = $2, "reason" = $3, "ended_at" = now(),
				"started_at" = CASE WHEN $4::boolean THEN COALESCE("started_at", now()) ELSE "started_at" END
			WHERE "reservation_id" = $1 AND "ended_at" IS NULL`,
			[reservationId, abandon.seat, abandon.reason, abandon.started === true],
		);

		return affected > 0;
	}

	public async recordResult(reservationId: string, result: ReservedDuelResult): Promise<boolean> {
		const affected = await this.execute(
			`UPDATE "reserved_duels"
			SET "outcome" = $2, "winner_seat" = $3, "reason" = $4, "duels" = $5::jsonb,
				"match_id" = $6, "ended_at" = now(), "started_at" = COALESCE("started_at", now())
			WHERE "reservation_id" = $1 AND "ended_at" IS NULL`,
			[
				reservationId,
				result.outcome,
				result.winnerSeat,
				result.reason,
				JSON.stringify(result.duels),
				result.matchId,
			],
		);

		return affected > 0;
	}

	public async closeLeftovers(instanceId: string): Promise<number> {
		return this.execute(
			`UPDATE "reserved_duels"
			SET "outcome" = 'abandoned', "reason" = 'server_restart', "abandoned_by_seat" = NULL,
				"ended_at" = now()
			WHERE "ended_at" IS NULL AND "server_instance_id" = $1`,
			[instanceId],
		);
	}

	private async execute(sql: string, parameters: unknown[]): Promise<number> {
		const runner = dataSource.createQueryRunner();
		try {
			const result = await runner.query(sql, parameters, true);

			return result.affected ?? 0;
		} finally {
			await runner.release();
		}
	}
}
