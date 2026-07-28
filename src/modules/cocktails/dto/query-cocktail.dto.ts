import { Transform } from "class-transformer";
import { IsOptional, IsString, Length } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { transformSpirit } from "../mappers/spirit.mapper";
export class QueryCocktailDto extends PaginationDto {
  @IsOptional() @Transform(transformSpirit) @IsString() @Length(1, 64) spirit?: string;
}
