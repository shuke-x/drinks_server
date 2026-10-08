import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Controller, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { generateKeyPairSync, publicEncrypt, constants, randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import source from '../../config/typeorm.datasource';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccessTokenGuard } from './access-token.guard';
import { RedisService } from '../redis/redis.service';
import { RedisRateLimitGuard } from '../../common/security/redis-rate-limit.guard';
import { cookieSessionSecurity } from '../../common/middleware/cookie-session-security.middleware';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor';
import { User, UserStatus } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { UserRole } from '../admin/entities/user-role.entity';
import { RolePermission } from '../admin/entities/role-permission.entity';
import { hashPassword } from './password-hash.util';

@Controller('test')
class MutationController {
  @Post('mutate') @UseGuards(AccessTokenGuard) mutate() { return { ok: true }; }
}

// Real HTTP/controller/guards/crypto. AUTH_TEST_DB=true uses the isolated compose.security-test.yml services.
describe('cookie authentication HTTP contract', () => {
  let app: INestApplication, auth: AuthService, user: User, db: DataSource | undefined, redisClient: Redis | undefined;
  const useDatabase = process.env.AUTH_TEST_DB === 'true';
  const schema = `auth_test_${randomUUID().replace(/-/g, '')}`;
  const origin = 'https://dash.example.test';
  const password = 'Example!234';
  const records = new Map<string, any>(), cache = new Map<string, any>();
  const config = new ConfigService({ AUTH_COOKIE_ENABLED: 'true', NODE_ENV: 'production', AUTH_COOKIE_SAME_SITE: 'strict', AUTH_JWT_SECRET: 'isolated-test-secret', AUTH_RSA_PRIVATE_KEY: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
  const userQuery: any = { addSelect: () => userQuery, where: () => userQuery, innerJoin: () => userQuery, getOne: async () => user };
  let users: any = { findOneBy: async () => user, createQueryBuilder: () => userQuery };
  let repository: any = {
    create: (value: any) => ({ id: randomUUID(), ...value }),
    save: async (value: any) => { records.set(value.tokenHash, value); return value; },
    findOne: async ({ where }: any) => records.get(where.tokenHash) ?? null,
    manager: { transaction: async (fn: any) => fn({ getRepository: (entity: any) => entity === RefreshToken ? repository : users }) },
  };
  beforeAll(async () => {
    user = { id: randomUUID(), email: 'admin@example.test', name: 'Admin', status: UserStatus.ACTIVE, passwordHash: await hashPassword(password) } as User;
    let redis: any = { withTTL: async (k: string, v: any) => { cache.set(k, v); }, get: async (k: string) => cache.get(k), take: async (k: string) => { const v = cache.get(k); cache.delete(k); return v; } };
    if (useDatabase) {
      // Fixed local test ports/database: never reads production DB_* or REDIS_* variables.
      db = new DataSource({ entities: source.options.entities, type: 'postgres', host: '127.0.0.1', port: 55439, username: 'drinks', password: 'drinks', database: 'security_test', schema, synchronize: false, migrations: [] });
      await db.initialize();
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.synchronize();
      users = db.getRepository(User); repository = db.getRepository(RefreshToken);
      user = await users.save(user);
      redisClient = new Redis({ host: '127.0.0.1', port: 56389, keyPrefix: `${schema}:`, maxRetriesPerRequest: 1 });
      redis = new RedisService(redisClient);
    }
    const module = await Test.createTestingModule({ controllers: [AuthController, MutationController], providers: [AuthService, AccessTokenGuard,
      { provide: ConfigService, useValue: config },
      { provide: RedisService, useValue: redis },
      { provide: getRepositoryToken(User), useValue: users }, { provide: getRepositoryToken(RefreshToken), useValue: repository },
      { provide: getRepositoryToken(UserRole), useValue: db ? db.getRepository(UserRole) : { find: async () => [] } }, { provide: getRepositoryToken(RolePermission), useValue: db ? db.getRepository(RolePermission) : {} },
    ] }).overrideGuard(RedisRateLimitGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); auth = module.get(AuthService);
    app.setGlobalPrefix('api/v1');
    app.use(cookieSessionSecurity(true, [origin], (token, refresh) => auth.validCsrf(token, refresh)));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (redisClient) await redisClient.quit();
    if (db?.isInitialized) { await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.destroy(); }
  });
  beforeEach(async () => { records.clear(); cache.clear(); user.status = UserStatus.ACTIVE; if (db) await users.save(user); });
  const cookies = (res: request.Response) => Object.fromEntries((res.headers['set-cookie'] as unknown as string[] ?? []).map(v => { const pair = v.split(';')[0]; const at = pair.indexOf('='); return [pair.slice(0, at), pair.slice(at + 1)]; }));
  const cookieHeader = (jar: Record<string, string>) => Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
  const post = (path: string, jar: Record<string, string>) => request(app.getHttpServer()).post(`/api/v1${path}`).set('X-Auth-Mode', 'cookie').set('Origin', origin).set('Cookie', cookieHeader(jar)).set('X-CSRF-Token', decodeURIComponent(jar.backbar_csrf ?? ''));
  async function challenge() { return request(app.getHttpServer()).get('/api/v1/auth/challenge').set('X-Auth-Mode', 'cookie').expect(200); }
  function credentials(res: request.Response) { const c = res.body.data; return { challengeId: c.challengeId, ciphertext: publicEncrypt({ key: c.publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(JSON.stringify({ email: user.email, password }))).toString('base64') }; }
  async function login() { const c = await challenge(); return post('/auth/login', cookies(c)).send(credentials(c)).expect(201); }

  it('bootstraps readable CSRF, creates HttpOnly cookies without JSON tokens and restores /me', async () => {
    const c = await challenge();
    expect(c.body.data.csrfToken).toBeUndefined();
    expect(c.headers['cache-control']).toBe('no-store');
    const header = c.headers['set-cookie'][0];
    expect(header).toContain('Path=/'); expect(header).toContain('Secure'); expect(header).toContain('SameSite=Strict'); expect(header).not.toContain('HttpOnly');
    const res = await post('/auth/login', cookies(c)).send(credentials(c)).expect(201);
    expect(res.body.data).toEqual({ expiresIn: 600 });
    expect((res.headers['set-cookie'] as unknown as string[]).filter((v: string) => v.includes('HttpOnly'))).toHaveLength(2);
    const jar = cookies(res);
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(jar)).expect(200);
    expect(me.body.data.user.id).toBe(user.id);
    await post('/test/mutate', jar).send({}).expect(201);
  });
  it('rejects missing headers, forged equal tokens, wrong origins and Bearer CSRF bypass', async () => {
    const c = await challenge(), jar = cookies(c), body = credentials(c);
    await request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Auth-Mode', 'cookie').send(body).expect(403);
    await post('/auth/login', jar).set('Origin', 'https://evil.example').send(body).expect(403);
    await post('/auth/login', jar).set('X-CSRF-Token', 'wrong').send(body).expect(403);
    await post('/auth/login', { backbar_csrf: 'forged' }).send(body).expect(403);
    const session = cookies(await post('/auth/login', jar).send(body).expect(201));
    await post('/test/mutate', { ...session, backbar_csrf: 'forged' }).send({}).expect(403);
    await post('/test/mutate', session).set('Authorization', `Bearer ${session.backbar_access}`).set('Origin', 'https://evil.example').send({}).expect(403);
  });
  it('binds challenges to their bootstrap cookie, rejects replay and transport downgrade', async () => {
    const a = await challenge(), b = await challenge();
    await post('/auth/login', cookies(b)).send(credentials(a)).expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials(a)).expect(403);
    await post('/auth/login', cookies(a)).send(credentials(a)).expect(201);
    await post('/auth/login', cookies(a)).send(credentials(a)).expect(401);
  });
  it('rotates without a JSON body, rejects old refresh/access and revokes access on logout', async () => {
    const old = cookies(await login());
    const refreshed = await post('/auth/refresh', old).expect(201);
    expect(refreshed.body.data).toEqual({ expiresIn: 600 });
    const fresh = cookies(refreshed);
    expect(fresh.backbar_refresh).not.toEqual(old.backbar_refresh);
    await post('/auth/refresh', old).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(old)).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(fresh)).expect(200);
    await post('/test/mutate', { ...fresh, backbar_csrf: old.backbar_csrf }).send({}).expect(403);
    const loggedOut = await post('/auth/logout', fresh).send({}).expect(201);
    expect(loggedOut.headers['set-cookie']).toHaveLength(3);
    expect((loggedOut.headers['set-cookie'] as unknown as string[]).every((v: string) => v.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(fresh)).expect(401);
    await post('/auth/refresh', fresh).expect(401);
  });
  it('restores an expired access cookie using the remaining refresh and CSRF cookies', async () => {
    const jar = cookies(await login()); delete jar.backbar_access;
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(jar)).expect(401);
    const renewed = cookies(await post('/auth/refresh', jar).expect(201));
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(renewed)).expect(200);
  });
  it('rejects disabled accounts for both access and refresh', async () => {
    const jar = cookies(await login()); user.status = UserStatus.DISABLED; if (db) await users.save(user);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieHeader(jar)).expect(401);
    await post('/auth/refresh', jar).expect(401);
  });
  (useDatabase ? it : it.skip)('allows exactly one concurrent refresh with PostgreSQL row locking', async () => {
    const jar = cookies(await login());
    const results = await Promise.all([post('/auth/refresh', jar), post('/auth/refresh', jar)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 401]);
  });
  it('preserves native Bearer login and JSON refresh without setting cookies', async () => {
    const c = await request(app.getHttpServer()).get('/api/v1/auth/challenge').expect(200);
    expect(c.headers['set-cookie']).toBeUndefined();
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials(c)).expect(201);
    expect(res.headers['set-cookie']).toBeUndefined(); expect(res.body.data.refreshToken).toBeDefined();
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`).expect(200);
    const rotated = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: res.body.data.refreshToken }).expect(201);
    expect(rotated.headers['set-cookie']).toBeUndefined(); expect(rotated.body.data.refreshToken).toBeDefined();
  });
});
