import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdminUserManagementPermissions1830000000000
  implements MigrationInterface
{
  name = "AddAdminUserManagementPermissions1830000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      `INSERT INTO "permissions" ("code", "name") VALUES ('users.create', 'Create users'), ('users.delete', 'Delete users') ON CONFLICT ("code") DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId") SELECT role."id", permission."id" FROM "roles" role CROSS JOIN "permissions" permission WHERE role."code" = 'super_admin' AND permission."code" IN ('users.create', 'users.delete') ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" IN ('users.create', 'users.delete')`,
    );
  }
}
