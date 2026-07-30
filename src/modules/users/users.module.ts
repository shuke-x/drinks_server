import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Cocktail } from "../cocktails/entities/cocktail.entity";
import { Favorite } from "./entities/favorite.entity";
import { User } from "./entities/user.entity";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
import { UserRole } from "../admin/entities/user-role.entity";
import { UploadModule } from "../upload/upload.module";
import { RedisModule } from "../redis/redis.module";
import { UploadAsset } from "../upload/entities/upload-asset.entity";
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Favorite,
      Cocktail,
      CocktailRevision,
      UserRole,
      UploadAsset,
    ]),
    AuthModule,
    UploadModule,
    RedisModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
