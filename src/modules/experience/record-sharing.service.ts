import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import sharp from 'sharp';
import { DataSource, EntityManager } from 'typeorm';
import { AdminAuditLog } from '../admin/entities/audit-log.entity';
import { DrinkRecordEntity } from './experience.entities';

@Injectable()
export class RecordSharingService {
 constructor(private readonly db:DataSource) {}
 private async locked(m:EntityManager, ownerId:string, id:string, version:number) {
  const r=await m.getRepository(DrinkRecordEntity).createQueryBuilder('r').setLock('pessimistic_write').where('r.ownerId=:ownerId AND r.id=:id AND r.deleted=false AND r.expiresAt > NOW()',{ownerId,id}).getOne();
  if(!r) throw new NotFoundException('Record not found or expired');
  if(r.version!==version) throw new ConflictException('Record changed; refresh before continuing');
  return r;
 }
 async submit(ownerId:string,id:string,version:number,caption:string,photoIndexes:number[]) {
  return this.db.transaction(async m=>{
   const r=await this.locked(m,ownerId,id,version);
   if(r.sharingStatus==='pending') throw new ConflictException('Already awaiting review');
   const data=r.data as Record<string,any>;
   const photos:Array<string>=data.photosBase64?.length ? data.photosBase64 : data.photoBase64 ? [data.photoBase64] : [];
   if(photoIndexes.some(i=>i<0 || i>=photos.length)) throw new BadRequestException('Invalid photo selection');
   // A separate, explicitly confirmed snapshot. Never copy notes, venue, price,
   // full recipe references or embedded publisher/identity metadata.
   const sharedPhotos:string[]=[];
   for(const index of photoIndexes) {
    try {sharedPhotos.push((await sharp(Buffer.from(photos[index],'base64'),{limitInputPixels:16000000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer()).toString('base64'));}
    catch {throw new BadRequestException('Selected photo could not be processed');}
   }
   r.sharingSnapshot={name:data.name,verdict:data.verdict,actualRecipe:data.actualRecipe,caption,photosBase64:sharedPhotos};
   r.sharingStatus='pending'; r.sharingReason=null; r.version++;
   await m.save(r); await this.audit(m,ownerId,'records.submit',r);
   return {version:r.version,sharingStatus:r.sharingStatus,expiresAt:r.expiresAt};
  });
 }
 async withdraw(ownerId:string,id:string,version:number) {
  return this.db.transaction(async m=>{
   const r=await this.locked(m,ownerId,id,version);
   r.sharingStatus='private';r.sharingSnapshot=null;r.sharingReason=null;r.version++;
   await m.save(r);await this.audit(m,ownerId,'records.withdraw',r);
   return {version:r.version,sharingStatus:r.sharingStatus};
  });
 }
 async pending(actorId:string,page:number,limit:number) {
  return this.db.transaction(async m=>{
   const [rows,total]=await m.getRepository(DrinkRecordEntity).createQueryBuilder('r').where("r.sharingStatus='pending' AND r.deleted=false AND r.expiresAt > NOW()").orderBy('r.createdAt','ASC').addOrderBy('r.id','ASC').skip((page-1)*limit).take(limit).getManyAndCount();
   for(const r of rows) await this.audit(m,actorId,'records.review_read',r);
   return {items:rows.map(r=>({id:r.id,ownerId:r.ownerId,version:r.version,expiresAt:r.expiresAt,sharingStatus:r.sharingStatus,snapshot:r.sharingSnapshot})),total,page,limit};
  });
 }
 async review(actorId:string,ownerId:string,id:string,version:number,action:'approve'|'reject',reason?:string) {
  if(actorId===ownerId) throw new ForbiddenException('You cannot review your own submission');
  if(action==='reject' && !reason?.trim()) throw new BadRequestException('Rejection reason is required');
  return this.db.transaction(async m=>{
   const r=await this.locked(m,ownerId,id,version);
   if(r.sharingStatus!=='pending') throw new ConflictException('Only pending records can be reviewed');
   r.sharingStatus=action==='approve'?'published':'rejected';r.sharingReason=action==='reject'?reason!.trim():null;r.version++;
   await m.save(r);await this.audit(m,actorId,`records.${action}`,r);
   return {id,version:r.version,sharingStatus:r.sharingStatus};
  });
 }
 async publicRecord(ownerId:string,id:string) {
  const r=await this.db.getRepository(DrinkRecordEntity).createQueryBuilder('r').where("r.ownerId=:ownerId AND r.id=:id AND r.deleted=false AND r.sharingStatus='published' AND r.expiresAt > NOW()",{ownerId,id}).getOne();
  if(!r) throw new NotFoundException('Record not found or expired');
  return {id:r.id,expiresAt:r.expiresAt,...r.sharingSnapshot};
 }
 private async audit(m:EntityManager,actorId:string,action:string,r:DrinkRecordEntity) {
  await m.save(AdminAuditLog,m.create(AdminAuditLog,{actor:{id:actorId},action,targetType:'drink_record',targetId:r.id,before:null,after:{ownerId:r.ownerId,version:r.version,status:r.sharingStatus}}));
 }
}

@Injectable()
export class RecordRetentionService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;
 private running=false;
 private readonly log=new Logger('RecordRetention');
 constructor(private readonly db:DataSource) {}
 async purge() {
  if(this.running) return;
  this.running=true;
  try {
   // Keep tombstones only until the original expiry; photos are embedded in
   // data/snapshot JSON, so deleting the row removes both private and shared copies.
   await this.db.query(`WITH expired AS (SELECT "ownerId",id FROM drink_records WHERE "expiresAt"<=NOW() LIMIT 500 FOR UPDATE SKIP LOCKED) DELETE FROM drink_records r USING expired e WHERE r."ownerId"=e."ownerId" AND r.id=e.id`);
   await this.db.query(`DELETE FROM admin_audit_logs WHERE "targetType"='drink_record' AND "createdAt" < NOW()-interval '7 days'`);
  } finally { this.running=false; }
 }
 async onModuleInit() {
  await this.purge();
  this.timer=setInterval(()=>{void this.purge().catch(()=>this.log.error('Record cleanup failed'));},60000);
  this.timer.unref();
 }
 onModuleDestroy() { if(this.timer) clearInterval(this.timer); }
}
