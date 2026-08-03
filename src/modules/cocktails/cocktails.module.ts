import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { User } from "../users/entities/user.entity";
import { Cocktail } from "./entities/cocktail.entity";
import { CocktailReviewLog } from "./entities/cocktail-review-log.entity";
import { CocktailCategory } from "./entities/cocktail-category.entity";
import { CocktailCategoriesController } from "./cocktail-categories.controller";
import { CocktailCategoriesService } from "./cocktail-categories.service";
import { CocktailRevision } from "./entities/cocktail-revision.entity";
import { CocktailsController } from "./cocktails.controller";
import { CocktailsService } from "./cocktails.service";
import { DailyRecommendation } from "./entities/daily-recommendation.entity";
@Module({
  imports: [TypeOrmModule.forFeature([Cocktail, CocktailCategory, CocktailReviewLog, CocktailRevision, DailyRecommendation, User]), AuthModule],
  controllers: [CocktailsController, CocktailCategoriesController],
  providers: [CocktailsService, CocktailCategoriesService],
  exports: [CocktailsService, CocktailCategoriesService],
})
export class CocktailsModule {}
