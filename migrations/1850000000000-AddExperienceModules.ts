import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddExperienceModules1850000000000 implements MigrationInterface {
 name='AddExperienceModules1850000000000';
 async up(q:QueryRunner) {
  await q.query(`CREATE TABLE drink_records ("ownerId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, id varchar(64) NOT NULL, "occurredAt" timestamptz NOT NULL, data jsonb NOT NULL, deleted boolean NOT NULL DEFAULT false, "updatedAt" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("ownerId",id))`);
  await q.query(`CREATE INDEX "IDX_records_owner_date" ON drink_records ("ownerId", "occurredAt" DESC)`);
  await q.query(`CREATE TABLE flavor_directions (id varchar(64) PRIMARY KEY, data jsonb NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT 0, "updatedAt" timestamptz NOT NULL DEFAULT now())`);
  const seeds = [{"id": "fresh", "zh": "清爽解渴", "en": "Fresh & bright", "zhSubtitle": "轻盈、明亮，适合慢慢喝", "enSubtitle": "Light, bright and easy to sip", "keywords": ["fresh", "citrus", "清爽", "柑橘", "苏打", "气泡"], "color": "#64D2FF", "primaryWeight": 6, "secondaryWeight": 2, "sortOrder": 0, "isActive": true, "icon": "fresh"}, {"id": "sweet_sour", "zh": "酸甜开胃", "en": "Sweet & sour", "zhSubtitle": "酸度活泼，甜味恰到好处", "enSubtitle": "Lively acidity with a soft finish", "keywords": ["sweet", "sour", "酸甜", "酸", "柠檬", "lime"], "color": "#FF9F0A", "primaryWeight": 6, "secondaryWeight": 2, "sortOrder": 1, "isActive": true, "icon": "sweet_sour"}, {"id": "fruit", "zh": "果香明显", "en": "Fruit forward", "zhSubtitle": "饱满果味，第一口就很鲜明", "enSubtitle": "Juicy fruit that leads the first sip", "keywords": ["fruit", "fruity", "果香", "berry", "莓", "桃", "apple"], "color": "#FF6482", "primaryWeight": 6, "secondaryWeight": 2, "sortOrder": 2, "isActive": true, "icon": "fruit"}, {"id": "tea", "zh": "茶香淡雅", "en": "Tea & herbal", "zhSubtitle": "克制清雅，留一点草本余韵", "enSubtitle": "Quiet tea and herbal aromatics", "keywords": ["tea", "herbal", "茶香", "茶", "草本", "花香"], "color": "#30D158", "primaryWeight": 6, "secondaryWeight": 2, "sortOrder": 3, "isActive": true, "icon": "tea"}, {"id": "rich", "zh": "浓郁顺滑", "en": "Rich & smooth", "zhSubtitle": "醇厚柔和，适合夜色渐深时", "enSubtitle": "Silky, deep and made for late hours", "keywords": ["rich", "smooth", "浓郁", "顺滑", "奶油", "咖啡", "cream"], "color": "#BF5AF2", "primaryWeight": 6, "secondaryWeight": 2, "sortOrder": 4, "isActive": true, "icon": "rich"}];
  for(const f of seeds) await q.query(`INSERT INTO flavor_directions (id,data,"isActive","sortOrder") VALUES ($1,$2,true,$3)`,[f.id,JSON.stringify(f),f.sortOrder]);
  await q.query(`INSERT INTO permissions (code,name) VALUES ('records.manage','Manage tasting records'),('flavors.manage','Manage flavor directions') ON CONFLICT (code) DO NOTHING`);
  await q.query(`INSERT INTO role_permissions ("roleId","permissionId") SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='super_admin' AND p.code IN ('records.manage','flavors.manage') ON CONFLICT DO NOTHING`);
 }
 async down(q:QueryRunner) {
  await q.query(`DELETE FROM permissions WHERE code IN ('records.manage','flavors.manage')`);
  await q.query('DROP TABLE flavor_directions');
  await q.query('DROP TABLE drink_records');
 }
}
