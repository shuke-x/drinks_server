import 'reflect-metadata';
import sharp from 'sharp';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'crypto';
import source from '../../config/typeorm.datasource';
import { RecordsController, FlavorsController, AdminRecordsController, AdminFlavorsController, RecordSharingController, PublicRecordsController } from './experience.controller';
import { RecordSharingService, RecordRetentionService } from './record-sharing.service';
import { RedisRateLimitGuard } from '../../common/security/redis-rate-limit.guard';
import { ExperienceService } from './experience.service';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../admin/guards/permissions.guard';
import { UserRole } from '../admin/entities/user-role.entity';
import { RolePermission } from '../admin/entities/role-permission.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../admin/entities/role.entity';
import { AdminAuditLog } from '../admin/entities/audit-log.entity';
import { DrinkRecordEntity } from './experience.entities';

const enabled=process.env.EXPERIENCE_TEST_DB==='true';
(enabled?describe:describe.skip)('experience PostgreSQL API integration',()=>{
 let app:INestApplication,db:DataSource;
 const owner=randomUUID(),other=randomUUID(),admin=randomUUID();
 const record={id:'record-1',name:'测试酸酒',occurredAt:new Date().toISOString(),scene:'home',verdict:'liked',note:'private note',actualRecipe:[{n:'苦精',t:'2 dash'}],reference:{id:'source',zh:'原配方',en:'Source',base:'金酒',recipe:[{n:'Gin',ml:30}]}};
 const flavor={id:'test-flavor',zh:'测试风味',en:'Test',zhSubtitle:'描述',enSubtitle:'Description',keywords:['茶'],icon:'tea',color:'#30D158',imageUrl:'https://cdn.example.com/flavor.webp',primaryWeight:9,secondaryWeight:1,isActive:true,sortOrder:99};
 const api=(method:'get'|'post'|'patch'|'delete',path:string,user=owner)=>request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization',`Bearer ${user}`);
 beforeAll(async()=>{
  const module=await Test.createTestingModule({imports:[TypeOrmModule.forRoot({...source.options,host:'127.0.0.1',port:Number(process.env.EXPERIENCE_TEST_PORT||55439),database:'security_test',username:'drinks',password:'drinks',synchronize:false,migrationsRun:true} as any),TypeOrmModule.forFeature([UserRole,RolePermission])],controllers:[RecordsController,FlavorsController,AdminRecordsController,AdminFlavorsController,RecordSharingController,PublicRecordsController],providers:[ExperienceService,PermissionsGuard,RecordSharingService]})
   .overrideGuard(RedisRateLimitGuard).useValue({canActivate:()=>true})
   .overrideGuard(AccessTokenGuard).useValue({canActivate(context:any){const r=context.switchToHttp().getRequest();const id=r.headers.authorization?.replace('Bearer ','');if(![owner,other,admin].includes(id))throw new UnauthorizedException();r.authUser={id};return true;}}).compile();
  app=module.createNestApplication();app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.init();db=module.get(DataSource);
  for(const id of [owner,other,admin])await db.getRepository(User).save({id,email:`${id}@example.test`,name:'Test',passwordHash:'test-only'});
  const role=await db.getRepository(Role).findOneByOrFail({code:'super_admin'});
  await db.getRepository(UserRole).save({user:{id:admin},role});
 },30000);
 afterAll(async()=>{if(app)await app.close();});
 it('seeds five public flavors and rejects anonymous record access',async()=>{
  expect((await request(app.getHttpServer()).get('/api/v1/flavor-directions').expect(200)).body).toHaveLength(5);
  await request(app.getHttpServer()).get('/api/v1/users/me/drink-records').expect(401);
 });
 it('creates once, retries safely, paginates and keeps owner identity server controlled',async()=>{
  await api('post','/users/me/drink-records').send(record).expect(201);
  await api('post','/users/me/drink-records').send(record).expect(201);
  const list=await api('get',`/users/me/drink-records?ownerId=${other}&page=1&limit=1`).expect(200);
  expect(list.body.total).toBe(1);expect(list.body.items[0].actualRecipe[0].t).toBe('2 dash');
  expect(list.body.items[0].reference.recipe[0].ml).toBe(30);
  expect((await api('get','/users/me/drink-records',other)).body.items).toHaveLength(0);
  await api('get','/users/me/drink-records/record-1',other).expect(404);
  await api('patch','/users/me/drink-records/record-1',other).send({...record,version:1}).expect(404);
  await api('delete','/users/me/drink-records/record-1',other).send({version:1}).expect(404);
  await api('get','/users/me/drink-records').set('X-Record-Account',other).expect(403);
 });
 it('rejects invalid payloads and malformed snapshots before persistence',async()=>{
  for(const patch of [{ownerId:other},{scene:'invalid'},{actualRecipe:[{n:'Gin',ml:-3}]},{reference:{id:'bad'}},{name:' '},{photoBase64:'aGVsbG8='}])
   await api('post','/users/me/drink-records').send({...record,id:randomUUID(),...patch}).expect(400);
  await api('get','/users/me/drink-records?limit=1000').expect(400);
 });
 it('allows one concurrent writer and rejects stale updates and deletes',async()=>{
  const path='/users/me/drink-records/concurrent';
  const initial={...record,id:'concurrent'};
  expect((await api('post','/users/me/drink-records').send(initial).expect(201)).body.version).toBe(1);
  await api('patch',path).send({...initial,note:'missing version'}).expect(400);
  await api('delete',path).expect(400);
  const results=await Promise.all([
   api('patch',path).send({...initial,note:'first',version:1}),
   api('patch',path).send({...initial,note:'second',version:1}),
  ]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  const current=(await api('get',path).expect(200)).body;
  expect(current.version).toBe(2);
  await api('delete',path).send({version:1}).expect(409);
  expect((await api('get',path).expect(200)).body.note).toBe(current.note);
  await api('delete',path).send({version:2}).expect(200);
 });
 it('imports without overwriting edits and never resurrects a deletion',async()=>{
  await api('patch','/users/me/drink-records/record-1').send({...record,note:'updated',version:1}).expect(200);
  await api('post','/users/me/drink-records/import').send(record).expect(201);
  expect((await api('get','/users/me/drink-records/record-1')).body.note).toBe('updated');
  await api('delete','/users/me/drink-records/record-1').send({version:2}).expect(200);
  await api('post','/users/me/drink-records/import').send(record).expect(201);
  await api('get','/users/me/drink-records/record-1').expect(404);
  expect((await db.getRepository(DrinkRecordEntity).findOneByOrFail({ownerId:owner,id:record.id})).data).toEqual({id:record.id});
 });
 it('reviews only explicitly submitted snapshots and never exposes private fields',async()=>{
  const draft={...record,id:'shared',venue:'secret venue',price:'secret price'};
  const created=(await api('post','/users/me/drink-records').send(draft).expect(201)).body;
  expect(new Date(created.expiresAt).getTime()-new Date(created.createdAt).getTime()).toBe(7*86400000);
  expect((await api('get','/admin/drink-records',admin).expect(200)).body.items).toHaveLength(0);
  await api('get',`/public/drink-records/${owner}/shared`).expect(404);
  await api('get','/admin/drink-records').expect(403);
  await api('post','/users/me/drink-records/shared/submit').send({version:1,caption:'public caption',photoIndexes:[],note:'leak'}).expect(400);
  await api('post','/users/me/drink-records/shared/submit').send({version:1,caption:'public caption',photoIndexes:[]}).expect(201);
  const pending=(await api('get','/admin/drink-records',admin).expect(200)).body.items[0];
  expect(pending.snapshot.caption).toBe('public caption');
  expect(JSON.stringify(pending)).not.toMatch(/private note|secret venue|secret price/);
  await api('get',`/admin/drink-records/${owner}/shared`,admin).expect(404);
  await api('post',`/admin/drink-records/${owner}/shared/review`,admin).send({version:2,action:'reject'}).expect(400);
  await api('post',`/admin/drink-records/${owner}/shared/review`,admin).send({version:2,action:'approve'}).expect(201);
  const visible=(await api('get',`/public/drink-records/${owner}/shared`).expect(200)).body;
  expect(visible.caption).toBe('public caption');expect(visible.note).toBeUndefined();
  await api('post',`/admin/drink-records/${owner}/shared/review`,admin).send({version:2,action:'approve'}).expect(409);
  // Editing resets visibility and never resets the retention clock.
  const changed=(await api('patch','/users/me/drink-records/shared').send({...draft,version:3,name:'edited'}).expect(200)).body;
  expect(changed.expiresAt).toBe(created.expiresAt);
  await api('get',`/public/drink-records/${owner}/shared`).expect(404);
  const logs=await db.getRepository(AdminAuditLog).findBy({targetId:'shared',actor:{id:admin}});
  expect(logs.length).toBeGreaterThanOrEqual(2);expect(JSON.stringify(logs)).not.toMatch(/private note|secret venue|public caption/);
 });
 it('strips image metadata from explicitly selected public photos',async()=>{
  const photo=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).jpeg().withMetadata().toBuffer();
  expect((await sharp(photo).metadata()).exif).toBeDefined();
  await api('post','/users/me/drink-records').send({...record,id:'photo-share',photosBase64:[photo.toString('base64')]}).expect(201);
  await api('post','/users/me/drink-records/photo-share/submit').send({version:1,caption:'photo',photoIndexes:[0]}).expect(201);
  const pending=(await api('get','/admin/drink-records',admin).expect(200)).body.items.find((r:any)=>r.id==='photo-share');
  const metadata=await sharp(Buffer.from(pending.snapshot.photosBase64[0],'base64')).metadata();
  expect(metadata.exif).toBeUndefined();expect(metadata.format).toBe('webp');
  await api('post','/users/me/drink-records/photo-share/withdraw').send({version:2}).expect(201);
 });
 it('rejects self review, supports withdrawal, and expires all copies',async()=>{
  const draft={...record,id:'expire'};
  await api('post','/users/me/drink-records',admin).send(draft).expect(201);
  await api('post','/users/me/drink-records/expire/submit',admin).send({version:1,caption:'shared',photoIndexes:[]}).expect(201);
  await api('post',`/admin/drink-records/${admin}/expire/review`,admin).send({version:2,action:'approve'}).expect(403);
  await api('post','/users/me/drink-records/expire/withdraw',admin).send({version:2}).expect(201);
  expect((await api('get','/admin/drink-records',admin).expect(200)).body.items).toHaveLength(0);
  await db.query(`UPDATE drink_records SET "expiresAt"=NOW()-interval '1 second' WHERE id='expire'`);
  await api('get','/users/me/drink-records/expire',admin).expect(404);
  await api('patch','/users/me/drink-records/expire',admin).send({...draft,version:3}).expect(404);
  await new RecordRetentionService(db).purge();
  expect(await db.getRepository(DrinkRecordEntity).countBy({id:'expire'})).toBe(0);
 });
 it('admin flavor edits and deactivation reach public catalog and are audited',async()=>{
  await api('post','/admin/flavor-directions',admin).send(flavor).expect(201);
  await api('post','/admin/flavor-directions',admin).send(flavor).expect(409);
  await api('patch','/admin/flavor-directions/test-flavor',admin).send({...flavor,primaryWeight:17}).expect(200);
  expect((await api('get','/flavor-directions')).body.find((f:any)=>f.id===flavor.id)).toMatchObject({primaryWeight:17,imageUrl:'https://cdn.example.com/flavor.webp'});
  await api('patch','/admin/flavor-directions/test-flavor',admin).send({...flavor,isActive:false}).expect(200);
  expect((await api('get','/flavor-directions')).body.find((f:any)=>f.id===flavor.id)).toBeUndefined();
  await api('delete','/admin/flavor-directions/test-flavor',admin).expect(200);
  expect(await db.getRepository(AdminAuditLog).countBy({targetId:flavor.id,actor:{id:admin}})).toBe(4);
 });
 it('deleting an account removes records and tombstones',async()=>{
  await db.getRepository(User).delete(other);
  expect(await db.getRepository(DrinkRecordEntity).countBy({ownerId:other})).toBe(0);
 });
 it('new migration rolls back and reapplies cleanly',async()=>{
  await db.undoLastMigration(); // Retention and review
  await db.undoLastMigration(); // Record versions
  await db.undoLastMigration(); // Auth UUID defaults
  await db.undoLastMigration(); // Experience tables
  expect((await db.query("SELECT to_regclass('drink_records') AS name"))[0].name).toBeNull();
  await db.runMigrations();
  expect((await api('get','/flavor-directions')).body).toHaveLength(5);
 });
});
