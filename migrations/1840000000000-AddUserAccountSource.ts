import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserAccountSource1840000000000 implements MigrationInterface {
  name = "AddUserAccountSource1840000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      `CREATE TYPE "public"."users_account_source_enum" AS ENUM ('app', 'admin')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "accountSource" "public"."users_account_source_enum" NOT NULL DEFAULT 'app'`,
    );
    await queryRunner.query(
      `UPDATE "users" user_account SET "accountSource" = 'admin' FROM "user_roles" user_role JOIN "roles" role ON role."id" = user_role."roleId" WHERE user_role."userId" = user_account."id" AND role."code" <> 'user'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_account_source" ON "users" ("accountSource")`,
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`DROP INDEX "IDX_users_account_source"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "accountSource"`);
    await queryRunner.query(`DROP TYPE "public"."users_account_source_enum"`);
  }
}
