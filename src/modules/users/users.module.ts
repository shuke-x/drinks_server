import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Cocktail } from "../cocktails/entities/cocktail.entity";
import { Favorite } from "./entities/favorite.entity";
import { User } from "./entities/user.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
@Module({
  imports: [TypeOrmModule.forFeature([User, Favorite, Cocktail, CocktailRevision]), AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
