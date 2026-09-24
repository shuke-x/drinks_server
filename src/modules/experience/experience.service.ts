import { isDeepStrictEqual } from 'util';
import { validateRecordPayload } from './record-validation';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DataSource, MoreThan } from 'typeorm';
import { DrinkRecordEntity, FlavorEntity } from './experience.entities';
import { RecordDto, RecordQuery, FlavorDto } from './experience.dto';
import { AdminAuditLog } from '../admin/entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
@Injectable()
export class ExperienceService {
 constructor(private readonly db: DataSource) {}
 async records(ownerId: string | undefined, q: RecordQuery) {
  const qb = this.db.getRepository(DrinkRecordEntity).createQueryBuilder('r').where('r.deleted = false AND r.expiresAt > NOW()');
  if(ownerId) qb.andWhere('r.ownerId = :ownerId', {ownerId});
  if(q.scene) qb.andWhere("r.data->>'scene' = :scene", {scene:q.scene});
  if(q.search) qb.andWhere("(r.data->>'name' ILIKE :search OR r.data->>'venue' ILIKE :search)", {search:`%${q.search}%`});
  const [items,total] = await qb.orderBy('r.occurredAt','DESC').addOrderBy('r.id','ASC').skip((q.page-1)*q.limit).take(q.limit).getManyAndCount();
  return {items:items.map(r=>({...r.data, ownerId:r.ownerId, updatedAt:r.updatedAt, version:r.version, createdAt:r.createdAt, expiresAt:r.expiresAt, sharingStatus:r.sharingStatus, sharingReason:r.sharingReason})), total, page:q.page, limit:q.limit};
 }
 async record(ownerId:string,id:string) {
  const r = await this.db.getRepository(DrinkRecordEntity).findOneBy({ownerId,id,deleted:false,expiresAt:MoreThan(new Date())});
  if(!r) throw new NotFoundException('Record not found');
  return this.output(r);
 }
 async saveRecord(ownerId:string,dto:RecordDto, mode:'create'|'update'|'import',actorId?:string) {
  if(Buffer.byteLength(JSON.stringify(dto))>3*1024*1024) throw new BadRequestException('Record exceeds 3 MB');
  if(dto.photoBase64 && Buffer.from(dto.photoBase64,'base64').length>2*1024*1024) throw new BadRequestException('Photo exceeds 2 MB');
  validateRecordPayload(dto);
  const {id,version,...body} = dto;
  // Keep owner identity out of the snapshot, including admin DTOs.
  delete (body as any).ownerId;
  return this.db.transaction(async m=>{
   if(!await m.exists(User,{where:{id:ownerId}})) throw new NotFoundException('Account not found');
   if(mode==='import') {
    if(new Date(dto.occurredAt).getTime() <= Date.now()-7*86400000) return {id};
    await m.createQueryBuilder().insert().into(DrinkRecordEntity).values({ownerId,id,occurredAt:new Date(dto.occurredAt),data:{id,...body}}).orIgnore().execute();
    return {id}; // Existing records and tombstones always win over legacy imports.
   }
   if(mode==='update') {
    if(!Number.isInteger(version) || version! < 1) throw new BadRequestException('Record version is required; reload before editing');
    const result=await m.update(DrinkRecordEntity,{ownerId,id,deleted:false,version,expiresAt:MoreThan(new Date())},{data:{id,...body},occurredAt:new Date(dto.occurredAt),sharingStatus:'private',sharingSnapshot:null,sharingReason:null,version:()=> '"version" + 1'});
    if(!result.affected) {
     if(!await m.exists(DrinkRecordEntity,{where:{ownerId,id,deleted:false,expiresAt:MoreThan(new Date())}})) throw new NotFoundException('Record not found');
     throw new ConflictException('Record changed; reload before editing');
    }
   } else {
    const result=await m.createQueryBuilder().insert().into(DrinkRecordEntity).values({ownerId,id,occurredAt:new Date(dto.occurredAt),data:{id,...body}}).orIgnore().returning('id').execute();
    if(!result.raw.length) {
     const existing=await m.findOneBy(DrinkRecordEntity,{ownerId,id,deleted:false,expiresAt:MoreThan(new Date())});
     if(existing && isDeepStrictEqual(existing.data,JSON.parse(JSON.stringify({id,...body})))) return this.output(existing);
     throw new ConflictException('Record ID already exists');
    }
   }
   if(actorId) await this.audit(m,actorId,`records.${mode}`,id,{ownerId});
   return this.output(await m.findOneByOrFail(DrinkRecordEntity,{ownerId,id}));
  });
 }
 async deleteRecord(ownerId:string,id:string,version:number,actorId?:string) {
  return this.db.transaction(async m=>{
   if(!Number.isInteger(version) || version < 1) throw new BadRequestException('Record version is required; reload before deleting');
   const result=await m.update(DrinkRecordEntity,{ownerId,id,deleted:false,version,expiresAt:MoreThan(new Date())},{deleted:true,data:{id},sharingStatus:'private',sharingSnapshot:null,sharingReason:null,version:()=> '"version" + 1'});
   if(!result.affected) {
    if(!await m.exists(DrinkRecordEntity,{where:{ownerId,id,deleted:false,expiresAt:MoreThan(new Date())}})) throw new NotFoundException('Record not found');
    throw new ConflictException('Record changed; reload before deleting');
   }
   if(actorId) await this.audit(m,actorId,'records.delete',id,{ownerId});
   return {id};
  });
 }
 private output(r:DrinkRecordEntity) { return {...r.data,version:r.version,createdAt:r.createdAt,expiresAt:r.expiresAt,sharingStatus:r.sharingStatus,sharingReason:r.sharingReason}; }
 async flavors(admin=false) {
  return (await this.db.getRepository(FlavorEntity).find({where:admin?{}:{isActive:true},order:{sortOrder:'ASC',id:'ASC'}})).map(f=>({...f.data,id:f.id,isActive:f.isActive,sortOrder:f.sortOrder}));
 }
 async saveFlavor(dto:FlavorDto,actorId:string,create:boolean) {
  return this.db.transaction(async m=>{
   const values={id:dto.id,data:{...dto},isActive:dto.isActive,sortOrder:dto.sortOrder};
   if(create) {
    const result=await m.createQueryBuilder().insert().into(FlavorEntity).values(values).orIgnore().returning('id').execute();
    if(!result.raw.length) throw new ConflictException('Flavor ID already exists');
   } else {
    const result=await m.update(FlavorEntity,{id:dto.id},values);
    if(!result.affected) throw new NotFoundException('Flavor not found');
   }
   await this.audit(m,actorId,create?'flavors.create':'flavors.update',dto.id,dto);
   return dto;
  });
 }
 async deleteFlavor(id:string,actorId:string) {
  return this.db.transaction(async m=>{
   const result=await m.delete(FlavorEntity,{id});
   if(!result.affected) throw new NotFoundException('Flavor not found');
   await this.audit(m,actorId,'flavors.delete',id,null);
   return {id};
  });
 }
 private async audit(m:any,actorId:string,action:string,targetId:string,after:object|null) {
  await m.save(AdminAuditLog,m.create(AdminAuditLog,{actor:{id:actorId},action,targetType:action.startsWith('records.')?'drink_record':'flavor_direction',targetId,before:null,after}));
 }
}
