import { PartialType } from "@nestjs/swagger";
import { CreateCocktailDto } from "./create-cocktail.dto";
export class UpdateCocktailDto extends PartialType(CreateCocktailDto) {}
