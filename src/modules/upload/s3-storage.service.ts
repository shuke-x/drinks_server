import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { LocalStorageService } from './local-storage.service';
import { SaveImageOptions, StorageProvider } from './storage.provider';

@Injectable()
export class S3StorageService implements StorageProvider,OnModuleDestroy {
 private readonly client:S3Client;
 private readonly bucket:string;
 constructor(private readonly config:ConfigService) {
  this.bucket=config.getOrThrow<string>('S3_BUCKET');
  this.client=new S3Client({region:config.get('S3_REGION','auto'),endpoint:config.get('S3_ENDPOINT'),forcePathStyle:config.get('S3_FORCE_PATH_STYLE','true')==='true',credentials:{accessKeyId:config.getOrThrow('S3_ACCESS_KEY_ID'),secretAccessKey:config.getOrThrow('S3_SECRET_ACCESS_KEY')},requestHandler:{connectionTimeout:3000,requestTimeout:10000},maxAttempts:3});
 }
 async save(file:Express.Multer.File,options:SaveImageOptions={}) {
  const output=await LocalStorageService.encode(file,options);
  const key=`${nanoid(16)}.webp`;
  await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:output,ContentType:'image/webp'}));
  return `${this.config.get('PUBLIC_BASE_URL','http://localhost:3000')}/static/${key}`;
 }
 async read(key:string) {
  if(!/^[A-Za-z0-9_-]{1,128}\.(?:jpg|jpeg|png|webp)$/.test(key)) throw new Error('Invalid image key');
  const result=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
  if(!result.Body || (result.ContentLength??0)>15*1024*1024) throw new Error('Invalid image size');
  const bytes=Buffer.from(await result.Body.transformToByteArray());
  if(bytes.length>15*1024*1024) throw new Error('Invalid image size');
  return bytes;
 }
 async remove(url:string) {
  const base=new URL(this.config.get('PUBLIC_BASE_URL','http://localhost:3000'));
  const target=new URL(url,base);
  const key=target.pathname.match(/^\/static\/([A-Za-z0-9_-]{1,128}\.(?:jpg|jpeg|png|webp))$/)?.[1];
  if(target.origin!==base.origin || !key) return;
  await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}));
 }
 async ready() {await this.client.send(new HeadBucketCommand({Bucket:this.bucket}));}
 onModuleDestroy() {this.client.destroy();}
}
