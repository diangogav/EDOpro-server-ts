import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1725656144597 implements MigrationInterface {
	name = "InitialMigration1725656144597";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "duels" ("id" character varying NOT NULL, "user_name" character varying NOT NULL, "player_name" character varying NOT NULL, "opponent_name" character varying NOT NULL, "date" TIMESTAMP NOT NULL, "ban_list_name" character varying NOT NULL, "ban_list_hash" character varying NOT NULL, "result" character varying NOT NULL, "turns" integer NOT NULL, "match_id" character varying NOT NULL, "season" integer NOT NULL, CONSTRAINT "PK_138743a525868817b14d09a0d3e" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE TABLE "matches" ("id" character varying NOT NULL, "user_id" character varying NOT NULL, "best_of" integer NOT NULL, "player_name" character varying NOT NULL, "opponent_name" character varying NOT NULL, "date" TIMESTAMP NOT NULL, "ban_list_name" character varying NOT NULL, "ban_list_hash" character varying NOT NULL, "player_score" integer NOT NULL, "opponent_score" integer NOT NULL, "winner" boolean NOT NULL, "season" integer NOT NULL, CONSTRAINT "PK_8a22c7b2e0828988d51256117f4" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE TABLE "player_stats" ("id" character varying NOT NULL, "ban_list_name" character varying NOT NULL, "wins" integer NOT NULL, "losses" integer NOT NULL, "points" integer NOT NULL, "user_id" character varying NOT NULL, CONSTRAINT "PK_22e2d8ec820a98efbfdbf84d925" PRIMARY KEY ("id"))`
		);
		await queryRunner.query(
			`CREATE TABLE "users" ("id" character varying NOT NULL, "username" character varying NOT NULL, "password" character varying NOT NULL, "email" character varying NOT NULL, "avatar" text, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "users"`);
		await queryRunner.query(`DROP TABLE "player_stats"`);
		await queryRunner.query(`DROP TABLE "matches"`);
		await queryRunner.query(`DROP TABLE "duels"`);
	}
}
