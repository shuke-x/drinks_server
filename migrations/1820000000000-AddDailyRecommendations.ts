import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDailyRecommendations1820000000000 implements MigrationInterface {
  name = "AddDailyRecommendations1820000000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "daily_recommendations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "recommendationDate" date NOT NULL, "cocktailId" varchar(32) NOT NULL, "sortOrder" smallint NOT NULL, "createdById" uuid, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_daily_recommendations" PRIMARY KEY ("id"), CONSTRAINT "UQ_daily_recommendations_date_position" UNIQUE ("recommendationDate", "sortOrder"), CONSTRAINT "UQ_daily_recommendations_date_cocktail" UNIQUE ("recommendationDate", "cocktailId"), CONSTRAINT "CHK_daily_recommendations_position" CHECK ("sortOrder" BETWEEN 1 AND 4), CONSTRAINT "FK_daily_recommendations_cocktail" FOREIGN KEY ("cocktailId") REFERENCES "cocktails"("id") ON DELETE CASCADE, CONSTRAINT "FK_daily_recommendations_creator" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL)`,
    );
    await q.query(
      `CREATE INDEX "IDX_daily_recommendations_date" ON "daily_recommendations" ("recommendationDate")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "daily_recommendations"`);
  }
}
