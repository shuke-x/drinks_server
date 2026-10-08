import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class MediaAccessService {
 constructor(private readonly db:DataSource,private readonly config:ConfigService) {}
 private get base() {return new URL(this.config.get('PUBLIC_BASE_URL','http://localhost:3000'));}
 key(value:string):string|null {
  if(value.length>4096) return null;
  try {const url=new URL(value,this.base);return url.origin===this.base.origin?url.pathname.match(/^\/static\/([A-Za-z0-9_-]{1,128}\.(?:jpg|jpeg|png|webp))$/)?.[1]??null:null;} catch{return null;}
 }
 canonical(key:string) {return `${this.base.origin}/static/${key}`;}
 private digest(value:string) {return createHmac('sha256',this.config.getOrThrow<string>('AUTH_JWT_SECRET')).update(`media-v1:${value}`).digest('base64url');}
 sign(value:string,ownerId:string) {
  const key=this.key(value);if(!key) return value;
  const payload=Buffer.from(JSON.stringify({key,ownerId,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
  return `${this.canonical(key)}?access=${payload}.${this.digest(payload)}`;
 }
 map(value:unknown,ownerId?:string,strip=false):unknown {
  if(typeof value==='string') {const key=this.key(value);return key?(strip?this.canonical(key):ownerId?this.sign(value,ownerId):this.canonical(key)):value;}
  if(Array.isArray(value)) return value.map(v=>this.map(v,ownerId,strip));
  if(value && typeof value==='object' && !(value instanceof Date) && !Buffer.isBuffer(value)) return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,this.map(v,ownerId,strip)]));
  return value;
 }
 private identity(token:unknown,key:string):string|undefined {
  if(typeof token!=='string' || token.length>1024) return;
  const [payload,signature,...rest]=token.split('.');if(!payload||!signature||rest.length) return;
  const expected=Buffer.from(this.digest(payload));const given=Buffer.from(signature);
  if(expected.length!==given.length || !timingSafeEqual(expected,given)) return;
  try {const value=JSON.parse(Buffer.from(payload,'base64url').toString());if(value.key===key && typeof value.ownerId==='string' && Number.isInteger(value.exp) && value.exp>Math.floor(Date.now()/1000)) return value.ownerId;} catch { /* Invalid grants reveal no information. */ }
 }
 async assertReadable(key:string,token:unknown) {
  if(!this.key(this.canonical(key))) throw new NotFoundException('Image not found');
  const url=this.canonical(key);
  const publicRows=await this.db.query(`SELECT 1 FROM cocktails WHERE "deletedAt" IS NULL AND "isPrivate"=false AND status='published' AND images @> $1::jsonb UNION ALL SELECT 1 FROM users WHERE "avatarUrl"=$2 UNION ALL SELECT 1 FROM flavor_directions WHERE data->>'imageUrl'=$2 LIMIT 1`,[JSON.stringify([url]),url]);
  if(publicRows.length) return;
  const userId=this.identity(token,key);
  if(!userId) throw new NotFoundException('Image not found');
  const users=await this.db.query(`SELECT 1 FROM users WHERE id=$1 AND status='active'`,[userId]);
  if(!users.length) throw new NotFoundException('Image not found');
  const owned=await this.db.query(`SELECT 1 FROM upload_assets WHERE url=$1 AND "ownerId"=$2 UNION ALL SELECT 1 FROM cocktails WHERE "ownerId"=$2 AND "deletedAt" IS NULL AND images @> $3::jsonb LIMIT 1`,[url,userId,JSON.stringify([url])]);
  if(owned.length) return;
  // Review permission alone is insufficient: the image must be in a submitted
  // recipe or submitted revision, never an unrelated private upload.
  const reviewable=await this.db.query(`SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp."roleId"=ur."roleId" JOIN permissions p ON p.id=rp."permissionId" WHERE ur."userId"=$1 AND p.code='cocktails.review' AND (EXISTS(SELECT 1 FROM cocktails c WHERE c.status='pending' AND c."isPrivate"=false AND c."deletedAt" IS NULL AND c.images @> $2::jsonb) OR EXISTS(SELECT 1 FROM cocktail_revisions r JOIN cocktails c ON c.id=r."cocktailId" WHERE r.status='pending' AND c."deletedAt" IS NULL AND c."isPrivate"=false AND r.content->'images' @> $2::jsonb)) LIMIT 1`,[userId,JSON.stringify([url])]);
  if(!reviewable.length) throw new NotFoundException('Image not found');
 }
 async assertOwned(urls:string[],ownerId:string) {
  for(const value of urls) {
   const key=this.key(value);
   if(!key) throw new ForbiddenException('Use an image uploaded to this account');
   const rows=await this.db.query(`SELECT 1 FROM upload_assets WHERE url=$1 AND "ownerId"=$2 UNION ALL SELECT 1 FROM cocktails WHERE "ownerId"=$2 AND "deletedAt" IS NULL AND images @> $3::jsonb LIMIT 1`,[this.canonical(key),ownerId,JSON.stringify([this.canonical(key)])]);
   if(!rows.length) throw new ForbiddenException('Image belongs to another account');
  }
 }
}
