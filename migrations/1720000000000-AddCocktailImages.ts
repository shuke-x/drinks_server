import { MigrationInterface, QueryRunner } from "typeorm";
export class AddCocktailImages1720000000000 implements MigrationInterface {
  name = "AddCocktailImages1720000000000";
  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE "cocktails" ADD "images" jsonb NOT NULL DEFAULT '[]'`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(`ALTER TABLE "cocktails" DROP COLUMN "images"`);
  }
}
