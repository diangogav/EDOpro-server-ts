import { Rank, RankType } from "../domain/Rank";
import { RankRepository } from "../domain/RankRepository";
import { dataSource } from "../../../evolution-types/src/data-source";

const GLOBAL_RANK_NAME = "Global";

// INSERT ... ON CONFLICT (name) DO NOTHING followed by a plain SELECT keeps
// find-or-create safe under concurrency: two racing callers both reach the
// SELECT with the row guaranteed to exist, whichever INSERT won.
const INSERT_RANK_QUERY = `
	INSERT INTO ranks (name, type, enabled)
	VALUES ($1, $2, $3)
	ON CONFLICT (name) DO NOTHING
`;

const SELECT_RANK_QUERY = `
	SELECT id, name, type, enabled
	FROM ranks
	WHERE name = $1
`;

type RankRow = { id: string; name: string; type: RankType; enabled: boolean };

export class RankPostgresRepository implements RankRepository {
	async findOrCreateByName(name: string, type?: RankType): Promise<Rank> {
		const effectiveType: RankType = type ?? (name === GLOBAL_RANK_NAME ? "global" : "banlist");

		await dataSource.query(INSERT_RANK_QUERY, [name, effectiveType, true]);
		const rows: RankRow[] = await dataSource.query(SELECT_RANK_QUERY, [name]);

		const row = rows[0];
		if (!row) {
			throw new Error(`Rank "${name}" could not be found or created`);
		}

		return { id: row.id, name: row.name, type: row.type, enabled: row.enabled };
	}
}
