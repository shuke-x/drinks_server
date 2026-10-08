import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserBlocks1920000000000 implements MigrationInterface {
  name = "AddUserBlocks1920000000000";

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`CREATE TABLE "user_blocks" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "blockerId" uuid NOT NULL,
      "blockedId" uuid NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_user_blocks" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_user_blocks_pair" UNIQUE ("blockerId", "blockedId"),
      CONSTRAINT "CK_user_blocks_not_self" CHECK ("blockerId" <> "blockedId"),
      CONSTRAINT "FK_user_blocks_blocker" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_user_blocks_blocked" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`DROP TABLE "user_blocks"`);
  }
}
