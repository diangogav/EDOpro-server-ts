import { MigrationInterface, QueryRunner } from "typeorm";

export class AddedRoleToUsers1726317980167 implements MigrationInterface {
	name = "AddedRoleToUsers1726317980167";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user')`);
		await queryRunner.query(
			`ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
		await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
	}
}
