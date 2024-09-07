import { MigrationInterface, QueryRunner } from "typeorm";

export class RenamePlayerNameAndOpponentNameInMatchesTable1725660689355
	implements MigrationInterface
{
	name = "RenamePlayerNameAndOpponentNameInMatchesTable1725660689355";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "player_name"`);
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "opponent_name"`);
		await queryRunner.query(`ALTER TABLE "matches" ADD "player_names" text NOT NULL`);
		await queryRunner.query(`ALTER TABLE "matches" ADD "opponent_names" text NOT NULL`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "opponent_names"`);
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "player_names"`);
		await queryRunner.query(`ALTER TABLE "matches" ADD "opponent_name" character varying NOT NULL`);
		await queryRunner.query(`ALTER TABLE "matches" ADD "player_name" character varying NOT NULL`);
	}
}
