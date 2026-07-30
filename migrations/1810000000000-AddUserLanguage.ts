import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserLanguage1810000000000 implements MigrationInterface {
  name = "AddUserLanguage1810000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "language" varchar(16)`,
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "language"`);
  }
}
