import { Controller, Get, Inject, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { RedisRateLimitGuard } from '../../common/security/redis-rate-limit.guard';
import { MediaAccessService } from './media-access.service';
import { STORAGE, StorageProvider } from './storage.provider';
@Controller('static')
export class MediaController {
 constructor(private readonly access:MediaAccessService,@Inject(STORAGE) private readonly storage:StorageProvider) {}
 @Get(':key')
 @UseGuards(RedisRateLimitGuard)
 @RateLimit({scope:'media-read',limit:300,windowSeconds:60})
 async read(@Param('key') key:string,@Query('access') token:unknown,@Res() res:Response) {
  await this.access.assertReadable(key,token);
  let bytes:Buffer;
  try {bytes=await this.storage.read(key);} catch {throw new NotFoundException('Image not found');}
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.type(key.endsWith('.webp')?'image/webp':key.endsWith('.png')?'image/png':'image/jpeg').send(bytes);
 }
}
