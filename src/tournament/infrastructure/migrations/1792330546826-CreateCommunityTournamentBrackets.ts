import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCommunityTournamentBrackets1792330546826 implements MigrationInterface {
	public name = "CreateCommunityTournamentBrackets1792330546826";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "community_tournament_brackets" ("id" varchar PRIMARY KEY NOT NULL, "organizer_id" varchar NOT NULL, "revision" integer NOT NULL, "active" boolean NOT NULL, "document" text NOT NULL)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_tournament_owner_active" ON "community_tournament_brackets" ("organizer_id", "active") `,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_community_tournament_owner_active"`);
		await queryRunner.query(`DROP TABLE "community_tournament_brackets"`);
	}
}
