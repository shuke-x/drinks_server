import { MigrationInterface, QueryRunner } from 'typeorm';
export class RecordRetentionAndReview1880000000000 implements MigrationInterface {
 name='RecordRetentionAndReview1880000000000';
 async up(q:QueryRunner) {
  await q.query(`ALTER TABLE drink_records ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(), ADD COLUMN "expiresAt" timestamptz NOT NULL DEFAULT (now() + interval '7 days'), ADD COLUMN "sharingStatus" varchar(16) NOT NULL DEFAULT 'private', ADD COLUMN "sharingSnapshot" jsonb, ADD COLUMN "sharingReason" varchar(500)`);
  await q.query(`CREATE INDEX "IDX_records_expiry" ON drink_records ("expiresAt")`);
  await q.query(`INSERT INTO permissions (code,name) VALUES ('records.review','Review submitted record snapshots') ON CONFLICT (code) DO NOTHING`);
  await q.query(`INSERT INTO role_permissions ("roleId","permissionId") SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='super_admin' AND p.code='records.review' ON CONFLICT DO NOTHING`);
 }
 async down(q:QueryRunner) {
  await q.query(`DELETE FROM permissions WHERE code='records.review'`);
  await q.query(`ALTER TABLE drink_records DROP COLUMN "sharingReason", DROP COLUMN "sharingSnapshot", DROP COLUMN "sharingStatus", DROP COLUMN "expiresAt", DROP COLUMN "createdAt"`);
 }
}
