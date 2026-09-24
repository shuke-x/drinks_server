import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { CocktailStatus } from "../../cocktails/entities/cocktail.entity";
import { UserAccountSource, UserStatus } from "../../users/entities/user.entity";
import { CocktailTranslationsDto } from "../../cocktails/dto/cocktail-translations.dto";
import { IsRecipe } from "../../cocktails/validators/recipe-item.validator";
import { RecipeItem } from "../../cocktails/entities/cocktail.entity";
export class AdminCocktailQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(CocktailStatus) status?: CocktailStatus;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() @Length(1, 64) spirit?: string;
  @IsOptional() @IsString() @Length(1, 128) search?: string;
}
export class AdminUserQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsEnum(UserAccountSource) accountSource?: UserAccountSource;
  @IsOptional() @IsString() search?: string;
}
export class CreateAdminUserDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(1, 64) name!: string;
  @IsString()
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/)
  password!: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) roleIds?: string[];
}
export class AdminAuditQueryDto extends PaginationDto {
  @IsOptional() @IsString() @Length(1, 64) targetType?: string;
  @IsOptional() @IsString() @Length(1, 96) action?: string;
  @IsOptional() @IsUUID() actorId?: string;
}
export class UpdateUserStatusDto { @IsEnum(UserStatus) status!: UserStatus; @IsOptional() @IsString() @Length(1, 255) reason?: string; }
export class ReplaceUserRolesDto { @IsArray() @IsUUID("4", { each: true }) roleIds!: string[]; }
export class ReviewDto { @IsOptional() @IsString() @Length(1, 500) reason?: string; }
export class AdminUpdateCocktailDto extends CocktailTranslationsDto {
  @IsOptional() @IsString() @MaxLength(64) glass?: string;
  @IsOptional() @IsString() @MaxLength(128) garnish?: string;
  @IsOptional() @IsString() @MaxLength(255) flavor?: string;
  @IsOptional() @IsRecipe() recipe?: RecipeItem[];
  @IsOptional() @IsArray() @IsString({ each: true }) steps?: string[];
  @IsOptional() @IsString() @Length(1, 64) zh?: string;
  @IsOptional() @IsString() @MaxLength(128) en?: string;
  @IsOptional() @IsString() @Length(1, 64) spirit?: string;
  @IsOptional() @IsInt() @Min(0) @Max(99) abv?: number;
  @IsOptional() @IsString() @MaxLength(2000) story?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsUrl({ require_tld: false }, { each: true }) images?: string[];
}
export class CreateRoleDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,63}$/) code!: string;
  @IsString() @Length(1, 128) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) permissionIds?: string[];
}
export class CreatePermissionDto {
  @IsString()
  @Length(3, 96)
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  code!: string;

  @IsString()
  @Length(1, 128)
  name!: string;
}
export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(1, 128) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) permissionIds?: string[];
}
