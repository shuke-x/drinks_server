import { MigrationInterface, QueryRunner } from "typeorm";
export class AddCocktailPrivacy1740000000000 implements MigrationInterface {
  name = "AddCocktailPrivacy1740000000000";
  async up(q: QueryRunner) {
    await q.query(
      'ALTER TABLE "cocktails" ADD "isPrivate" boolean NOT NULL DEFAULT false',
    );
    await q.query('ALTER TABLE "cocktails" ADD "ownerId" uuid');
    await q.query(
      'ALTER TABLE "cocktails" ADD CONSTRAINT "FK_cocktails_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL',
    );
    await q.query(
      'CREATE INDEX "IDX_cocktails_owner" ON "cocktails" ("ownerId")',
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP INDEX "IDX_cocktails_owner"');
    await q.query(
      'ALTER TABLE "cocktails" DROP CONSTRAINT "FK_cocktails_owner"',
    );
    await q.query('ALTER TABLE "cocktails" DROP COLUMN "ownerId"');
    await q.query('ALTER TABLE "cocktails" DROP COLUMN "isPrivate"');
  }
}
