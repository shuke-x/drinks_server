import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCocktailTranslations1890000000000 implements MigrationInterface {
  name = "AddCocktailTranslations1890000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE cocktails ALTER COLUMN en SET DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE cocktails
      ADD COLUMN "storyEn" text,
      ADD COLUMN "glassEn" varchar(64),
      ADD COLUMN "garnishEn" varchar(128),
      ADD COLUMN "flavorEn" varchar(255),
      ADD COLUMN "tagsEn" jsonb,
      ADD COLUMN "stepsEn" jsonb`);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE cocktails ALTER COLUMN en SET DEFAULT 'House Original'`);
    await queryRunner.query(`ALTER TABLE cocktails
      DROP COLUMN "stepsEn", DROP COLUMN "tagsEn", DROP COLUMN "flavorEn",
      DROP COLUMN "garnishEn", DROP COLUMN "glassEn", DROP COLUMN "storyEn"`);
  }
}
