import { dataSource } from "../../../../evolution-types/src/data-source";
import { AchievementCatalog, CatalogAchievement } from "../../domain/AchievementCatalog";

export class AchievementCatalogPostgresRepository implements AchievementCatalog {
	async findByCodes(codes: string[]): Promise<CatalogAchievement[]> {
		if (codes.length === 0) {
			return [];
		}

		const rows: Array<{ id: number; code: string }> = await dataSource.query(
			`SELECT id, code FROM achievements WHERE code = ANY($1) AND deleted_at IS NULL`,
			[codes],
		);

		return rows.map((row) => ({ id: Number(row.id), code: row.code }));
	}
}
