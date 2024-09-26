import { MigrationInterface, QueryRunner } from "typeorm";

export class UserNameToUserIdInDuels1727124720594 implements MigrationInterface {
	name = "UserNameToUserIdInDuels1727124720594";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "duels" RENAME COLUMN "user_name" TO "user_id"`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "duels" RENAME COLUMN "user_id" TO "user_name"`);
	}
}
