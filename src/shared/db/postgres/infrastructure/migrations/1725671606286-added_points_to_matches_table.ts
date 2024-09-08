import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedPointsToMatchesTable1725671606286 implements MigrationInterface {
	name = "AddedPointsToMatchesTable1725671606286";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "matches" ADD "points" integer NOT NULL`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "points"`);
	}
}
