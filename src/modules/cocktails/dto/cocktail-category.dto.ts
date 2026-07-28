import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from "class-validator";

export class CreateCocktailCategoryDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-z0-9][a-z0-9_-]*$/)
  code!: string;

  @IsString() @Length(1, 64) name!: string;
  @IsOptional() @IsString() @Length(1, 128) nameEn?: string;
  @IsOptional() @IsString() @Length(1, 2000) description?: string;
  @IsOptional()
  @IsUrl({ require_tld: false })
  @Length(1, 2048)
  iconUrl?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCocktailCategoryDto {
  @IsOptional() @IsString() @Length(1, 64) name?: string;
  @IsOptional() @IsString() @Length(1, 128) nameEn?: string;
  @IsOptional() @IsString() @Length(1, 2000) description?: string;
  @IsOptional()
  @IsUrl({ require_tld: false })
  @Length(1, 2048)
  iconUrl?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
