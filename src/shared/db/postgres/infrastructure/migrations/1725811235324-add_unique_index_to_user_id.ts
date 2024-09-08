import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueIndexToUserId1725811235324 implements MigrationInterface {
	name = "AddUniqueIndexToUserId1725811235324";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_UNIQUE_USER_ID" ON "player_stats" ("user_id") `
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "public"."IDX_UNIQUE_USER_ID"`);
	}
}
