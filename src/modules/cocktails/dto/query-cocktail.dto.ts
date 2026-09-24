import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Length } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { transformSpirit } from "../mappers/spirit.mapper";
export class QueryCocktailDto extends PaginationDto {
  @IsOptional() @IsIn(["zh", "en"]) lang?: "zh" | "en";
  @IsOptional() @IsString() @Length(1,160) search?:string;
  @IsOptional() @Transform(transformSpirit) @IsString() @Length(1, 64) spirit?: string;
}
