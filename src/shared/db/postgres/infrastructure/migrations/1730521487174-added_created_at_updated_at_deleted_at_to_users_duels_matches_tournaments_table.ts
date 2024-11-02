import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedCreatedAtUpdatedAtDeletedAtToUsersDuelsMatchesTournamentsTable1730521487174
	implements MigrationInterface
{
	name = "AddedCreatedAtUpdatedAtDeletedAtToUsersDuelsMatchesTournamentsTable1730521487174";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "duels" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(
			`ALTER TABLE "duels" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(`ALTER TABLE "duels" ADD "deleted_at" TIMESTAMP`);
		await queryRunner.query(
			`ALTER TABLE "matches" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(
			`ALTER TABLE "matches" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(`ALTER TABLE "matches" ADD "deleted_at" TIMESTAMP`);
		await queryRunner.query(
			`ALTER TABLE "users" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP`);
		await queryRunner.query(
			`ALTER TABLE "tournaments" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(
			`ALTER TABLE "tournaments" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`
		);
		await queryRunner.query(`ALTER TABLE "tournaments" ADD "deleted_at" TIMESTAMP`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN "deleted_at"`);
		await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN "updated_at"`);
		await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN "created_at"`);
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_at"`);
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "created_at"`);
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "deleted_at"`);
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "updated_at"`);
		await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "created_at"`);
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "deleted_at"`);
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "updated_at"`);
		await queryRunner.query(`ALTER TABLE "duels" DROP COLUMN "created_at"`);
	}
}
