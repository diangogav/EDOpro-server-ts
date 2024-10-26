import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedTournamentsTable1727123631279 implements MigrationInterface {
	name = "AddedTournamentsTable1727123631279";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TABLE "tournaments" ("id" character varying NOT NULL, "name" character varying NOT NULL, "mode" integer NOT NULL, "userId" character varying NOT NULL, "rule" character varying NOT NULL, "start_date" TIMESTAMP NOT NULL, "type" character varying NOT NULL, "ban_list_name" character varying NOT NULL, "url" character varying NOT NULL, "status" character varying NOT NULL, CONSTRAINT "PK_6d5d129da7a80cf99e8ad4833a9" PRIMARY KEY ("id"))`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "tournaments"`);
	}
}
