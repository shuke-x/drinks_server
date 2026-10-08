import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCocktailReports1910000000000 implements MigrationInterface {
  name = "AddCocktailReports1910000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`CREATE TYPE "cocktail_reports_status_enum" AS ENUM ('open', 'reviewed', 'dismissed')`);
    await queryRunner.query(`CREATE TABLE "cocktail_reports" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reporterId" uuid NOT NULL,
      "cocktailId" character varying(32) NOT NULL,
      "reason" character varying(64) NOT NULL,
      "details" character varying(2000),
      "status" "cocktail_reports_status_enum" NOT NULL DEFAULT 'open',
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_cocktail_reports" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_cocktail_reports_reporter_cocktail" UNIQUE ("reporterId", "cocktailId"),
      CONSTRAINT "FK_cocktail_reports_reporter" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_cocktail_reports_cocktail" FOREIGN KEY ("cocktailId") REFERENCES "cocktails"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`INSERT INTO "permissions" ("code", "name") VALUES ('reports.manage', 'Manage user content reports') ON CONFLICT ("code") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "role_permissions" ("roleId", "permissionId") SELECT role."id", permission."id" FROM "roles" role CROSS JOIN "permissions" permission WHERE role."code" IN ('super_admin', 'operator', 'reviewer') AND permission."code" = 'reports.manage' ON CONFLICT ("roleId", "permissionId") DO NOTHING`);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'reports.manage'`);
    await queryRunner.query(`DROP TABLE "cocktail_reports"`);
    await queryRunner.query(`DROP TYPE "cocktail_reports_status_enum"`);
  }
}
