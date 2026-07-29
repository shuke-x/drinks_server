import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { UserRole } from "../admin/entities/user-role.entity";
import { RolePermission } from "../admin/entities/role-permission.entity";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import {
  AccessTokenGuard,
  OptionalAccessTokenGuard,
} from "./access-token.guard";
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, UserRole, RolePermission]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard, OptionalAccessTokenGuard],
  exports: [AuthService, AccessTokenGuard, OptionalAccessTokenGuard],
})
export class AuthModule {}
