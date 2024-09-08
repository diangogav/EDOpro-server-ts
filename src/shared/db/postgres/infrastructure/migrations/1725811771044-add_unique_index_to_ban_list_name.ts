import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueIndexToBanListName1725811771044 implements MigrationInterface {
	name = "AddUniqueIndexToBanListName1725811771044";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "public"."IDX_UNIQUE_USER_ID"`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_3fef284ca080f86ca80a050260" ON "player_stats" ("user_id", "ban_list_name") `
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "public"."IDX_3fef284ca080f86ca80a050260"`);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_UNIQUE_USER_ID" ON "player_stats" ("user_id") `
		);
	}
}
