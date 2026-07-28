import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { CocktailStatus } from "../../cocktails/entities/cocktail.entity";
import { UserStatus } from "../../users/entities/user.entity";
export class AdminCocktailQueryDto extends PaginationDto { @IsOptional() @IsEnum(CocktailStatus) status?: CocktailStatus; @IsOptional() @IsUUID() ownerId?: string; }
export class AdminUserQueryDto extends PaginationDto { @IsOptional() @IsEnum(UserStatus) status?: UserStatus; @IsOptional() @IsString() search?: string; }
export class UpdateUserStatusDto { @IsEnum(UserStatus) status!: UserStatus; @IsOptional() @IsString() @Length(1, 255) reason?: string; }
export class ReplaceUserRolesDto { @IsArray() @IsUUID("4", { each: true }) roleIds!: string[]; }
export class ReviewDto { @IsOptional() @IsString() @Length(1, 500) reason?: string; }
