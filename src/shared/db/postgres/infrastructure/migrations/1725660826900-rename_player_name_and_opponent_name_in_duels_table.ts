import { MigrationInterface, QueryRunner } from "typeorm";

export class RenamePlayerNameAndOpponentNameInDuelsTable1725660826900
	implements MigrationInterface
{
	name = "RenamePlayerNameAndOpponentNameInDuelsTable1725660826900";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "player_name"`);
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "opponent_name"`);
		await queryRunner.query(`ALTER TABLE "duels" ADD "player_names" text NOT NULL`);
		await queryRunner.query(`ALTER TABLE "duels" ADD "opponent_names" text NOT NULL`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "opponent_names"`);
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "player_names"`);
		await queryRunner.query(`ALTER TABLE "duels" ADD "opponent_name" character varying NOT NULL`);
		await queryRunner.query(`ALTER TABLE "duels" ADD "player_name" character varying NOT NULL`);
	}
}
