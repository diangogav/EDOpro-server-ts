import { mkdir } from "fs/promises";
import { dirname } from "path";
import { DataSource } from "typeorm";

import { TournamentError, TournamentPrimitives } from "../domain/Tournament";
import { TournamentRepository } from "../domain/TournamentRepository";
import { TournamentRowSchema } from "./TournamentRow";

export const MAX_ACTIVE_TOURNAMENTS_PER_ORGANIZER = 8;

export class SqliteTournamentRepository implements TournamentRepository {
	private opening: Promise<void> | null = null;

	public constructor(private readonly database: DataSource) {}

	public async initialize(): Promise<void> {
		if (this.opening) {
			await this.opening;
			return;
		}
		if (this.database.isInitialized) return;
		if (!this.opening)
			this.opening = this.open().catch((error: unknown) => {
				this.opening = null;
				throw error;
			});
		await this.opening;
	}

	public async close(): Promise<void> {
		if (this.opening) await this.opening;
		if (this.database.isInitialized) await this.database.destroy();
		this.opening = null;
	}

	private async open(): Promise<void> {
		await mkdir(dirname(String(this.database.options.database)), { recursive: true });
		await this.database.initialize();
		try {
			await this.database.runMigrations();
		} catch (error) {
			await this.database.destroy();
			throw error;
		}
	}

	public async create(tournament: TournamentPrimitives): Promise<void> {
		await this.initialize();
		// One SQL statement makes the account quota atomic across concurrent requests.
		const inserted: { id: string }[] = await this.database.query(
			`INSERT INTO community_tournament_brackets (id, organizer_id, revision, active, document)
			 SELECT ?, ?, ?, 1, ? WHERE (SELECT COUNT(*) FROM community_tournament_brackets
			 WHERE organizer_id = ? AND active = 1) < ? RETURNING id`,
			[
				tournament.id,
				tournament.organizerId,
				tournament.revision,
				JSON.stringify(tournament),
				tournament.organizerId,
				MAX_ACTIVE_TOURNAMENTS_PER_ORGANIZER,
			],
		);
		if (inserted.length !== 1)
			throw new TournamentError("capacity", "Organizer has too many active tournaments");
	}

	public async find(id: string): Promise<TournamentPrimitives | null> {
		await this.initialize();
		const row = await this.database.getRepository(TournamentRowSchema).findOneBy({ id });
		return row ? (JSON.parse(row.document) as TournamentPrimitives) : null;
	}

	public async save(tournament: TournamentPrimitives, expectedRevision: number): Promise<void> {
		await this.initialize();
		const active = tournament.status === "registration" || tournament.status === "running";
		const updated: { id: string }[] = await this.database.query(
			`UPDATE community_tournament_brackets SET revision = ?, active = ?, document = ?
			 WHERE id = ? AND revision = ? RETURNING id`,
			[
				tournament.revision,
				active ? 1 : 0,
				JSON.stringify(tournament),
				tournament.id,
				expectedRevision,
			],
		);
		if (updated.length !== 1)
			throw new TournamentError(
				"conflict",
				"Tournament changed; fetch it and retry with its latest revision",
			);
	}
}
