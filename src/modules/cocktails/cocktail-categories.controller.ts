import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CocktailCategoriesService } from "./cocktail-categories.service";

@ApiTags("cocktail-categories")
@Controller("cocktail-categories")
export class CocktailCategoriesController {
  constructor(private readonly categories: CocktailCategoriesService) {}
  @Get() list() {
    return this.categories.listPublic();
  }
}
