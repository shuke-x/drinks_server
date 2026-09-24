import { IsEnum, IsIn, IsOptional } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { CocktailStatus } from "../../cocktails/entities/cocktail.entity";

export class QueryMyCocktailsDto extends PaginationDto {
  @IsOptional() @IsIn(["zh", "en"]) lang?: "zh" | "en";
  @IsOptional()
  @IsEnum(CocktailStatus)
  status?: CocktailStatus;
}
