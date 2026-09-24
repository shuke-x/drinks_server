import { Controller, Get, UseGuards, UseInterceptors } from "@nestjs/common";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { CocktailCategoriesService } from "./cocktail-categories.service";
import { CocktailLanguageInterceptor } from "./cocktail-language.interceptor";

@ApiTags("cocktail-categories")
@Controller("cocktail-categories")
@UseInterceptors(CocktailLanguageInterceptor)
@UseGuards(RedisRateLimitGuard)
@RateLimit({scope:"public-categories",limit:120,windowSeconds:60})
export class CocktailCategoriesController {
  constructor(private readonly categories: CocktailCategoriesService) {}
  @Get()
  @ApiQuery({ name: "lang", required: false, enum: ["zh", "en"], description: "展示语言，默认中文；缺失翻译回退中文" })
  list() {
    return this.categories.listPublic();
  }
}
