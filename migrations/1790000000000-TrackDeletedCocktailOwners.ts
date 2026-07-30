import { MigrationInterface, QueryRunner } from "typeorm";

export class TrackDeletedCocktailOwners1790000000000
  implements MigrationInterface
{
  name = "TrackDeletedCocktailOwners1790000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      `ALTER TABLE "cocktails" ADD "ownerDeletedAt" timestamptz`,
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(
      `ALTER TABLE "cocktails" DROP COLUMN "ownerDeletedAt"`,
    );
  }
}
