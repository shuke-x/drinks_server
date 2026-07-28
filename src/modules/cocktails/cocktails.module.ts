import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { User } from "../users/entities/user.entity";
import { Cocktail } from "./entities/cocktail.entity";
import { CocktailReviewLog } from "./entities/cocktail-review-log.entity";
import { CocktailsController } from "./cocktails.controller";
import { CocktailsService } from "./cocktails.service";
@Module({
  imports: [TypeOrmModule.forFeature([Cocktail, CocktailReviewLog, User]), AuthModule],
  controllers: [CocktailsController],
  providers: [CocktailsService],
  exports: [CocktailsService],
})
export class CocktailsModule {}
