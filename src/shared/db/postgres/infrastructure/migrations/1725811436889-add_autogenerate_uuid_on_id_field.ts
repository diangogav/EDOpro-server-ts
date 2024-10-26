import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutogenerateUuidOnIdField1725811436889 implements MigrationInterface {
	name = "AddAutogenerateUuidOnIdField1725811436889";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "player_stats" DROP CONSTRAINT "PK_22e2d8ec820a98efbfdbf84d925"`
		);
		await queryRunner.query(`ALTER TABLE "player_stats" DROP COLUMN "id"`);
		await queryRunner.query(
			`ALTER TABLE "player_stats" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`
		);
		await queryRunner.query(
			`ALTER TABLE "player_stats" ADD CONSTRAINT "PK_22e2d8ec820a98efbfdbf84d925" PRIMARY KEY ("id")`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "player_stats" DROP CONSTRAINT "PK_22e2d8ec820a98efbfdbf84d925"`
		);
		await queryRunner.query(`ALTER TABLE "player_stats" DROP COLUMN "id"`);
		await queryRunner.query(`ALTER TABLE "player_stats" ADD "id" character varying NOT NULL`);
		await queryRunner.query(
			`ALTER TABLE "player_stats" ADD CONSTRAINT "PK_22e2d8ec820a98efbfdbf84d925" PRIMARY KEY ("id")`
		);
	}
}
