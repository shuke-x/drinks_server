import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDrinkRecordVersion1870000000000 implements MigrationInterface {
  name = 'AddDrinkRecordVersion1870000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE drink_records ADD COLUMN version integer NOT NULL DEFAULT 1');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE drink_records DROP COLUMN version');
  }
}
