import { dataSource } from "../../../evolution-types/src/data-source";
import { RankType } from "../domain/Rank";
import { RankGroupRepository, RankGroupUpsert } from "../domain/RankGroupRepository";

const SELECT_RANK_BY_NAME_QUERY = `
	SELECT id, type
	FROM ranks
	WHERE name = $1
`;

// Same concurrency-safe idiom as RankPostgresRepository: DO NOTHING plus a
// re-SELECT, so a racing creator of the same name never breaks the seeder.
const INSERT_GROUP_QUERY = `
	INSERT INTO ranks (name, type, enabled, only_current)
	VALUES ($1, 'group', $2, $3)
	ON CONFLICT (name) DO NOTHING
`;

const UPDATE_GROUP_QUERY = `
	UPDATE ranks
	SET enabled = $2, only_current = $3
	WHERE id = $1 AND type = 'group'
`;

const DELETE_MEMBERS_QUERY = `
	DELETE FROM rank_members
	WHERE rank_id = $1
`;

const INSERT_MEMBER_QUERY = `
	INSERT INTO rank_members (rank_id, pattern)
	VALUES ($1, $2)
	ON CONFLICT DO NOTHING
`;

const SELECT_GROUP_NAMES_QUERY = `
	SELECT name
	FROM ranks
	WHERE type = 'group'
`;

type RankTypeRow = { id: string; type: RankType };

export class RankGroupPostgresRepository implements RankGroupRepository {
	async upsertGroup(group: RankGroupUpsert): Promise<{ id: string } | null> {
		const existing = await this.findByName(group.name);
		if (existing && existing.type !== "group") {
			return null;
		}

		if (existing) {
			await dataSource.query(UPDATE_GROUP_QUERY, [existing.id, group.enabled, group.onlyCurrent]);

			return { id: existing.id };
		}

		await dataSource.query(INSERT_GROUP_QUERY, [group.name, group.enabled, group.onlyCurrent]);
		const created = await this.findByName(group.name);
		if (!created) {
			throw new Error(`Group rank "${group.name}" could not be created`);
		}
		if (created.type !== "group") {
			// A concurrent writer claimed the name with another type first.
			return null;
		}

		return { id: created.id };
	}

	async replaceMembers(rankId: string, patterns: string[]): Promise<void> {
		await dataSource.query(DELETE_MEMBERS_QUERY, [rankId]);
		for (const pattern of patterns) {
			await dataSource.query(INSERT_MEMBER_QUERY, [rankId, pattern]);
		}
	}

	async findGroupNames(): Promise<string[]> {
		const rows: { name: string }[] = await dataSource.query(SELECT_GROUP_NAMES_QUERY);

		return rows.map((row) => row.name);
	}

	private async findByName(name: string): Promise<RankTypeRow | null> {
		const rows: RankTypeRow[] = await dataSource.query(SELECT_RANK_BY_NAME_QUERY, [name]);

		return rows[0] ?? null;
	}
}
