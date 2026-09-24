import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryTranslation1900000000000 implements MigrationInterface {
  name = "AddCategoryTranslation1900000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE cocktail_categories ADD COLUMN "descriptionEn" text`);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE cocktail_categories DROP COLUMN "descriptionEn"`);
  }
}
