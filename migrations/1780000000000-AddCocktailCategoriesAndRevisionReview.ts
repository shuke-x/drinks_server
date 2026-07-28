import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCocktailCategoriesAndRevisionReview1780000000000
  implements MigrationInterface
{
  name = "AddCocktailCategoriesAndRevisionReview1780000000000";

  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE "cocktail_categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" varchar(64) NOT NULL, "name" varchar(64) NOT NULL, "nameEn" varchar(128), "description" text, "iconUrl" varchar(2048), "sortOrder" integer NOT NULL DEFAULT 0, "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_cocktail_categories" PRIMARY KEY ("id"), CONSTRAINT "UQ_cocktail_categories_code" UNIQUE ("code"))`,
    );
    await q.query(
      `INSERT INTO "cocktail_categories" ("code", "name", "nameEn", "sortOrder") VALUES ('gin','金酒','Gin',10), ('whiskey','威士忌','Whiskey',20), ('rum','朗姆','Rum',30), ('tequila','龙舌兰','Tequila',40), ('vodka','伏特加','Vodka',50), ('other','其他','Other',999)`,
    );
    await q.query(
      `ALTER TABLE "cocktails" ALTER COLUMN "spirit" TYPE varchar(64) USING "spirit"::text`,
    );
    await q.query(`DROP TYPE "public"."cocktails_spirit_enum"`);
    await q.query(`ALTER TABLE "cocktails" ADD "categoryId" uuid`);
    await q.query(
      `UPDATE "cocktails" c SET "categoryId" = category."id" FROM "cocktail_categories" category WHERE category."code" = c."spirit"`,
    );
    await q.query(
      `ALTER TABLE "cocktails" ALTER COLUMN "categoryId" SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "cocktails" ADD CONSTRAINT "FK_cocktails_category" FOREIGN KEY ("categoryId") REFERENCES "cocktail_categories"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `CREATE INDEX "IDX_cocktails_category" ON "cocktails" ("categoryId")`,
    );
    await q.query(
      `ALTER TABLE "cocktail_revisions" ADD "reviewerId" uuid, ADD "reviewedAt" timestamptz, ADD "updatedAt" timestamptz NOT NULL DEFAULT now()`,
    );
    await q.query(
      `ALTER TABLE "cocktail_revisions" ADD CONSTRAINT "FK_revision_reviewer" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_revision_pending_cocktail" ON "cocktail_revisions" ("cocktailId") WHERE "status" = 'pending'`,
    );
    await q.query(
      `INSERT INTO "permissions" ("code", "name") VALUES ('categories.manage', 'Manage cocktail categories') ON CONFLICT ("code") DO NOTHING`,
    );
    await q.query(
      `INSERT INTO "role_permissions" ("roleId", "permissionId") SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON p."code" = 'categories.manage' WHERE r."code" = 'super_admin' ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(
      `DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT "id" FROM "permissions" WHERE "code" = 'categories.manage')`,
    );
    await q.query(
      `DELETE FROM "permissions" WHERE "code" = 'categories.manage'`,
    );
    await q.query(`DROP INDEX "UQ_revision_pending_cocktail"`);
    await q.query(
      `ALTER TABLE "cocktail_revisions" DROP CONSTRAINT "FK_revision_reviewer"`,
    );
    await q.query(
      `ALTER TABLE "cocktail_revisions" DROP COLUMN "updatedAt", DROP COLUMN "reviewedAt", DROP COLUMN "reviewerId"`,
    );
    await q.query(`DROP INDEX "IDX_cocktails_category"`);
    await q.query(
      `ALTER TABLE "cocktails" DROP CONSTRAINT "FK_cocktails_category"`,
    );
    await q.query(`ALTER TABLE "cocktails" DROP COLUMN "categoryId"`);
    await q.query(
      `CREATE TYPE "public"."cocktails_spirit_enum" AS ENUM ('gin','whiskey','rum','tequila','vodka','other')`,
    );
    await q.query(
      `ALTER TABLE "cocktails" ALTER COLUMN "spirit" TYPE "public"."cocktails_spirit_enum" USING "spirit"::"public"."cocktails_spirit_enum"`,
    );
    await q.query(`DROP TABLE "cocktail_categories"`);
  }
}
