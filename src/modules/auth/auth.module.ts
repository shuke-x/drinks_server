import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import {
  AccessTokenGuard,
  OptionalAccessTokenGuard,
} from "./access-token.guard";
@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken])],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, OptionalAccessTokenGuard],
  exports: [AuthService, AccessTokenGuard, OptionalAccessTokenGuard],
})
export class AuthModule {}
