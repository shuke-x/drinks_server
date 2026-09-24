import { IsString, Length, IsIn, IsISO8601, IsOptional, IsObject, IsArray, ArrayMaxSize, IsInt, Min, Max, IsBoolean, Matches, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { IsRecipe } from '../cocktails/validators/recipe-item.validator';
export class RecordDto {
 @IsOptional() @IsInt() @Min(1) @Max(2147483646) version?: number;
 @IsString() @Matches(/^[a-zA-Z0-9_-]{1,64}$/) id!: string;
 @IsString() @Length(1,160) @Matches(/\S/) name!: string;
 @IsISO8601() occurredAt!: string;
 @IsIn(['home','out']) scene!: string;
 @IsIn(['loved','liked','notForMe']) verdict!: string;
 @IsOptional() @IsString() @MaxLength(10000) note?: string;
 @IsOptional() @IsString() @MaxLength(300) venue?: string;
 @IsOptional() @IsString() @MaxLength(100) price?: string;
 @IsOptional() @IsString() @MaxLength(10000) adjustments?: string;
 @IsOptional() @IsString() @MaxLength(2796204) @Matches(/^[A-Za-z0-9+/]*={0,2}$/) photoBase64?: string | null;
 @IsOptional() @IsArray() @ArrayMaxSize(9) @IsString({each:true}) @MaxLength(2796204,{each:true}) @Matches(/^[A-Za-z0-9+/]+={0,2}$/, {each:true}) photosBase64?: string[];
 @IsOptional() @IsObject() reference?: Record<string, any> | null;
 @IsArray() @ArrayMaxSize(100) @IsRecipe() actualRecipe!: any[];
}
export class AdminRecordDto extends RecordDto { @IsUUID() ownerId!: string; }
export class RecordQuery {
 @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
 @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
 @IsOptional() @IsUUID() ownerId?: string;
 @IsOptional() @IsString() @MaxLength(160) search?: string;
 @IsOptional() @IsIn(['home','out']) scene?: string;
}
export class FlavorDto {
 @IsString() @Matches(/^[a-z0-9_-]{1,64}$/) id!: string;
 @IsString() @Length(1,80) zh!: string;
 @IsString() @Length(1,80) en!: string;
 @IsString() @MaxLength(300) zhSubtitle!: string;
 @IsString() @MaxLength(300) enSubtitle!: string;
 @IsArray() @ArrayMaxSize(80) @IsString({each:true}) @Length(1,50,{each:true}) keywords!: string[];
 @IsIn(['fresh','sweet_sour','fruit','tea','rich']) icon!: string;
 @Matches(/^#[0-9a-fA-F]{6}$/) color!: string;
 @IsInt() @Min(0) @Max(100) primaryWeight!: number;
 @IsInt() @Min(0) @Max(100) secondaryWeight!: number;
 @IsInt() @Min(0) @Max(10000) sortOrder!: number;
 @IsBoolean() isActive!: boolean;
}

export class DeleteRecordDto {
 @IsInt() @Min(1) @Max(2147483646) version!: number;
}
