import { MigrationInterface, QueryRunner } from "typeorm";

export class AddImportPermission1770000000000 implements MigrationInterface {
  name = "AddImportPermission1770000000000";

  async up(q: QueryRunner) {
    await q.query(
      `INSERT INTO "permissions" ("code", "name") VALUES ('imports.manage', 'Manage cocktail imports') ON CONFLICT ("code") DO NOTHING`,
    );
    await q.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId") SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."code" = 'imports.manage' WHERE r."code" = 'super_admin' ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
    );
    await q.query(
      `CREATE INDEX "IDX_admin_import_jobs_status_created" ON "admin_import_jobs" ("status", "createdAt" DESC)`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(`DROP INDEX "IDX_admin_import_jobs_status_created"`);
    await q.query(
      `DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT "id" FROM "permissions" WHERE "code" = 'imports.manage')`,
    );
    await q.query(`DELETE FROM "permissions" WHERE "code" = 'imports.manage'`);
  }
}
