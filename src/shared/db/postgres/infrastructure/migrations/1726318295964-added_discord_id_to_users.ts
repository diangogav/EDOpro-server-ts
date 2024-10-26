import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedDiscordIdToUsers1726318295964 implements MigrationInterface {
	name = "AddedDiscordIdToUsers1726318295964";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "users" ADD "discord_id" character varying`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "discord_id"`);
	}
}
