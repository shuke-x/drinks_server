import { MigrationInterface, QueryRunner } from "typeorm";
export class AddCocktailRevisionsAndImportJobs1760000000000 implements MigrationInterface {
  name = "AddCocktailRevisionsAndImportJobs1760000000000";
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE "cocktail_revisions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "cocktailId" varchar(32) NOT NULL, "authorId" uuid, "content" jsonb NOT NULL, "status" "public"."cocktails_status_enum" NOT NULL DEFAULT 'draft', "rejectReason" varchar(500), "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_cocktail_revisions" PRIMARY KEY ("id"), CONSTRAINT "FK_revision_cocktail" FOREIGN KEY ("cocktailId") REFERENCES "cocktails"("id") ON DELETE CASCADE, CONSTRAINT "FK_revision_author" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX "IDX_revision_cocktail_status" ON "cocktail_revisions" ("cocktailId", "status", "createdAt" DESC)`);
    await q.query(`CREATE TYPE "public"."admin_import_jobs_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed')`);
    await q.query(`CREATE TABLE "admin_import_jobs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creatorId" uuid, "format" varchar(8) NOT NULL, "status" "public"."admin_import_jobs_status_enum" NOT NULL DEFAULT 'pending', "summary" jsonb NOT NULL DEFAULT '{}', "error" text, "payload" bytea NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_admin_import_jobs" PRIMARY KEY ("id"), CONSTRAINT "FK_import_creator" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL)`);
  }
  async down(q: QueryRunner) { await q.query(`DROP TABLE "admin_import_jobs"`); await q.query(`DROP TYPE "public"."admin_import_jobs_status_enum"`); await q.query(`DROP TABLE "cocktail_revisions"`); }
}
