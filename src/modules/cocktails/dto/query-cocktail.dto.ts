import { Transform } from "class-transformer";
import { IsEnum, IsOptional } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { Spirit, transformSpirit } from "../mappers/spirit.mapper";
export class QueryCocktailDto extends PaginationDto {
  @IsOptional() @Transform(transformSpirit) @IsEnum(Spirit) spirit?: Spirit;
}
