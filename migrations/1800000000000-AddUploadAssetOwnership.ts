import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUploadAssetOwnership1800000000000
  implements MigrationInterface
{
  name = "AddUploadAssetOwnership1800000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      `CREATE TABLE "upload_assets" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "url" varchar(2048) NOT NULL, "ownerId" uuid NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_upload_assets" PRIMARY KEY ("id"), CONSTRAINT "UQ_upload_assets_url" UNIQUE ("url"), CONSTRAINT "FK_upload_assets_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_assets_owner" ON "upload_assets" ("ownerId")`,
    );
    await queryRunner.query(
      `INSERT INTO "upload_assets" ("url", "ownerId") SELECT "avatarUrl", "id" FROM "users" WHERE "avatarUrl" IS NOT NULL ON CONFLICT ("url") DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO "upload_assets" ("url", "ownerId") SELECT image.url, cocktail."ownerId" FROM "cocktails" cocktail CROSS JOIN LATERAL jsonb_array_elements_text(cocktail."images") image(url) WHERE cocktail."ownerId" IS NOT NULL ON CONFLICT ("url") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`DROP TABLE "upload_assets"`);
  }
}
