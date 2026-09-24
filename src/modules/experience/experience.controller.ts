import { Controller, Header, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException, ParseUUIDPipe, Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { PermissionsGuard } from '../admin/guards/permissions.guard';
import { RequirePermissions } from '../admin/decorators/require-permissions.decorator';
import { RateLimit } from '../../common/security/rate-limit.decorator';
import { RedisRateLimitGuard } from '../../common/security/redis-rate-limit.guard';
import { RecordSharingService } from './record-sharing.service';
import { ArrayUnique, ArrayMaxSize, IsArray, IsInt, Min, Max, IsString, MaxLength, IsIn, IsOptional } from 'class-validator';
import { ExperienceService } from './experience.service';
import { RecordDto, RecordQuery, FlavorDto, DeleteRecordDto } from './experience.dto';
@Injectable()
class RecordAccountGuard implements CanActivate {
 canActivate(context:ExecutionContext) {
  const r=context.switchToHttp().getRequest();
  const expected=r.headers['x-record-account'];
  if(expected && expected!==r.authUser.id) throw new ForbiddenException('Account changed; reopen records');
  return true;
 }
}
@Controller('users/me/drink-records')
@UseGuards(AccessTokenGuard,RecordAccountGuard)
export class RecordsController {
 constructor(private readonly service:ExperienceService) {}
 @Header('Cache-Control','no-store')
 @Get() list(@Req() r:any,@Query() q:RecordQuery) {return this.service.records(r.authUser.id,q);}
 @Header('Cache-Control','no-store')
 @Get(':id') get(@Req() r:any,@Param('id') id:string) {return this.service.record(r.authUser.id,id);}
 @Post('import') import(@Req() r:any,@Body() dto:RecordDto) {return this.service.saveRecord(r.authUser.id,dto,'import');}
 @Post() create(@Req() r:any,@Body() dto:RecordDto) {return this.service.saveRecord(r.authUser.id,dto,'create');}
 @Patch(':id') update(@Req() r:any,@Param('id') id:string,@Body() dto:RecordDto) {
  if(id!==dto.id) throw new BadRequestException('Record ID mismatch');
  return this.service.saveRecord(r.authUser.id,dto,'update');
 }
 @Delete(':id') remove(@Req() r:any,@Param('id') id:string,@Body() dto:DeleteRecordDto) {return this.service.deleteRecord(r.authUser.id,id,dto.version);}
}
@Controller('flavor-directions')
@UseGuards(RedisRateLimitGuard)
@RateLimit({scope:'flavors',limit:120,windowSeconds:60})
export class FlavorsController {
 constructor(private readonly service:ExperienceService) {}
 @Header('Cache-Control','no-store')
 @Get() list() {return this.service.flavors();}
}
export class ShareRecordDto extends DeleteRecordDto {
 @IsString() @MaxLength(2000) caption!:string;
 @IsArray() @ArrayUnique() @ArrayMaxSize(9) @IsInt({each:true}) @Min(0,{each:true}) @Max(8,{each:true}) photoIndexes!:number[];
}
export class ReviewRecordDto extends DeleteRecordDto {
 @IsIn(['approve','reject']) action!:'approve'|'reject';
 @IsOptional() @IsString() @MaxLength(500) reason?:string;
}
@Controller('users/me/drink-records')
@UseGuards(AccessTokenGuard,RecordAccountGuard)
export class RecordSharingController {
 constructor(private readonly service:RecordSharingService) {}
 @Post(':id/submit') submit(@Req() r:any,@Param('id') id:string,@Body() dto:ShareRecordDto) {return this.service.submit(r.authUser.id,id,dto.version,dto.caption,dto.photoIndexes);}
 @Post(':id/withdraw') withdraw(@Req() r:any,@Param('id') id:string,@Body() dto:DeleteRecordDto) {return this.service.withdraw(r.authUser.id,id,dto.version);}
}
@Controller('public/drink-records')
@UseGuards(RedisRateLimitGuard)
@RateLimit({scope:'public-records',limit:60,windowSeconds:60})
export class PublicRecordsController {
 constructor(private readonly service:RecordSharingService) {}
 @Header('Cache-Control','no-store')
 @Get(':ownerId/:id') get(@Param('ownerId',ParseUUIDPipe) ownerId:string,@Param('id') id:string) {return this.service.publicRecord(ownerId,id);}
}
@Controller('admin/drink-records')
@UseGuards(AccessTokenGuard,PermissionsGuard)
@RequirePermissions('records.review')
export class AdminRecordsController {
 constructor(private readonly service:RecordSharingService) {}
 @Header('Cache-Control','no-store')
 @Get() list(@Req() r:any,@Query() q:RecordQuery) {return this.service.pending(r.authUser.id,q.page,q.limit);}
 @Post(':ownerId/:id/review') review(@Req() r:any,@Param('ownerId',ParseUUIDPipe) ownerId:string,@Param('id') id:string,@Body() dto:ReviewRecordDto) {return this.service.review(r.authUser.id,ownerId,id,dto.version,dto.action,dto.reason);}
}
@Controller('admin/flavor-directions')
@UseGuards(AccessTokenGuard,PermissionsGuard)
@RequirePermissions('flavors.manage')
export class AdminFlavorsController {
 constructor(private readonly service:ExperienceService) {}
 @Header('Cache-Control','no-store')
 @Get() list() {return this.service.flavors(true);}
 @Post() create(@Req() r:any,@Body() dto:FlavorDto) {return this.service.saveFlavor(dto,r.authUser.id,true);}
 @Patch(':id') update(@Req() r:any,@Param('id') id:string,@Body() dto:FlavorDto) {
  if(id!==dto.id) throw new BadRequestException('Flavor ID mismatch');
  return this.service.saveFlavor(dto,r.authUser.id,false);
 }
 @Delete(':id') remove(@Req() r:any,@Param('id') id:string) {return this.service.deleteFlavor(id,r.authUser.id);}
}
