import { BadRequestException } from '@nestjs/common';
import { RecordDto } from './experience.dto';

/** Validate the snapshot fields consumed by mobile without looking up or rewriting the original recipe. */
export function validateRecordPayload(dto: RecordDto) {
 const fail=()=>{throw new BadRequestException('Invalid recipe snapshot');};
 const r=dto.reference;
 if(r) {
  if(Buffer.byteLength(JSON.stringify(r))>256*1024) fail();
  for(const key of ['id','zh','base']) if(typeof r[key]!=='string') fail();
  for(const key of ['en','spirit','color','glass','garnish','flavor','story','rejectReason','offlineReason'])
   if(r[key]!=null && typeof r[key]!=='string') fail();
  for(const key of ['images','tags','steps'])
   if(r[key]!=null && (!Array.isArray(r[key]) || !r[key].every((v:unknown)=>typeof v==='string'))) fail();
  for(const key of ['isPrivate','isOfficial']) if(r[key]!=null && typeof r[key]!=='boolean') fail();
  if(r.abv!=null && (typeof r.abv!=='number' || !Number.isFinite(r.abv))) fail();
  if(r.recipe!=null && (!Array.isArray(r.recipe) || !r.recipe.every((v:any)=>v && typeof v.n==='string' && (v.ml==null || typeof v.ml==='number') && (v.t==null || typeof v.t==='string')))) fail();
  if(r.publisher!=null) {
   if(typeof r.publisher!=='object' || Array.isArray(r.publisher)) fail();
   for(const key of ['id','name','avatarUrl']) if(r.publisher[key]!=null && typeof r.publisher[key]!=='string') fail();
   if(r.publisher.deleted!=null && typeof r.publisher.deleted!=='boolean') fail();
  }
  if(r.latestRevision!=null && (typeof r.latestRevision!=='object' || typeof r.latestRevision.id!=='string' || (r.latestRevision.rejectReason!=null && typeof r.latestRevision.rejectReason!=='string'))) fail();
 }
 const photos = [...(dto.photosBase64 ?? []), ...(dto.photoBase64 ? [dto.photoBase64] : [])];
 if (photos.reduce((sum, photo) => sum + Buffer.from(photo, 'base64').length, 0) > 2*1024*1024) throw new BadRequestException('Photos exceed 2 MB total');
 for (const photo of photos) {
  const image=Buffer.from(photo,'base64');
  if(image.toString('base64')!==photo || image.length>2*1024*1024) throw new BadRequestException('Invalid photo or exceeds 2 MB');
  const jpg=image.subarray(0,3).equals(Buffer.from([255,216,255]));
  const png=image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=image.subarray(0,4).toString()==='RIFF' && image.subarray(8,12).toString()==='WEBP';
  if(!jpg&&!png&&!webp) throw new BadRequestException('Photo must be JPEG, PNG or WebP');
 }
}
