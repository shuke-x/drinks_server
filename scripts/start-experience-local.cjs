/** Dedicated local environment: never reads connection or signing settings from the real .env. */
const { generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const argon2 = require('argon2');
process.chdir(join(__dirname, '..'));
Object.assign(process.env, {
  NODE_ENV: 'development', PORT: '3007',
  DB_HOST: '127.0.0.1', DB_PORT: '55438', DB_NAME: 'tonight_experience_local',
  DB_USER: 'drinks', DB_PASS: 'local-experience-only', DB_SYNC: 'false',
  REDIS_HOST: '127.0.0.1', REDIS_PORT: '56388',
  AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
  AUTH_RSA_PRIVATE_KEY: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({type:'pkcs8',format:'pem'}),
  ADMIN_BOOTSTRAP_EMAIL: '',
  CORS_ORIGINS: 'http://127.0.0.1:5178,http://localhost:5178',
  PUBLIC_BASE_URL: 'http://127.0.0.1:3007', SWAGGER_ENABLED: 'true',
});
async function start() {
  execFileSync('docker', ['compose','-f','compose.experience.yml','up','-d','--wait'], {stdio:'inherit'});
  const db = require('../dist/src/config/typeorm.datasource').default;
  await db.initialize();
  await db.runMigrations();
  const { User } = require('../dist/src/modules/users/entities/user.entity');
  const { Role } = require('../dist/src/modules/admin/entities/role.entity');
  const { UserRole } = require('../dist/src/modules/admin/entities/user-role.entity');
  for (const [email,name,isAdmin] of [
    ['local-admin@example.test','本地管理员',true],
    ['local-user@example.test','本地调酒师',false],
  ]) {
    let user = await db.getRepository(User).findOneBy({email});
    if (!user) user = await db.getRepository(User).save({id:randomUUID(),email,name,passwordHash:await argon2.hash('LocalSync123!'),accountSource:isAdmin?'admin':'app'});
    if (isAdmin) {
      const role = await db.getRepository(Role).findOneByOrFail({code:'super_admin'});
      if (!await db.getRepository(UserRole).exists({where:{user:{id:user.id},role:{id:role.id}}}))
        await db.getRepository(UserRole).save({user,role});
    }
  }
  const { Cocktail } = require('../dist/src/modules/cocktails/entities/cocktail.entity');
  const { CocktailCategory } = require('../dist/src/modules/cocktails/entities/cocktail-category.entity');
  const { normalizeSpirit } = require('../dist/src/modules/cocktails/mappers/spirit.mapper');
  const seeds = require('../dist/src/seeds/cocktails.json');
  for (const raw of seeds) {
    if (await db.getRepository(Cocktail).exists({where:{id:raw.id},withDeleted:true})) continue;
    const spirit=normalizeSpirit(raw.base);
    const category=await db.getRepository(CocktailCategory).findOneByOrFail({code:spirit});
    await db.getRepository(Cocktail).save({...raw,spirit,category,images:[],isOfficial:true,status:'published',publishedAt:new Date()});
  }
  await db.destroy();
  console.log('Local API: http://127.0.0.1:3007/api/v1 | Docs: http://127.0.0.1:3007/docs');
  console.log('Local fixture accounts: local-admin@example.test / local-user@example.test (see docs/EXPERIENCE_MODULES.md)');
  require('../dist/src/main');
}
start().catch(error=>{console.error(error);process.exitCode=1;});
