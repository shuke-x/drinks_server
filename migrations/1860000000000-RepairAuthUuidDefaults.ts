import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fresh databases must match the UUID generation declared by the auth entities. */
export class RepairAuthUuidDefaults1860000000000 implements MigrationInterface {
  name = 'RepairAuthUuidDefaults1860000000000';
  async up(q: QueryRunner) {
    for (const table of ['users', 'refresh_tokens', 'user_favorites']) {
      await q.query(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`);
    }
  }
  async down(q: QueryRunner) {
    for (const table of ['users', 'refresh_tokens', 'user_favorites']) {
      await q.query(`ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`);
    }
  }
}
