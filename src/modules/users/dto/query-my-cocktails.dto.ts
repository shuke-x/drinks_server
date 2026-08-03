import { IsEnum, IsOptional } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { CocktailStatus } from "../../cocktails/entities/cocktail.entity";

export class QueryMyCocktailsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CocktailStatus)
  status?: CocktailStatus;
}
