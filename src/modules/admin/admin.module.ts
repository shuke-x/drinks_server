import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Cocktail } from "../cocktails/entities/cocktail.entity";
import { CocktailReviewLog } from "../cocktails/entities/cocktail-review-log.entity";
import { User } from "../users/entities/user.entity";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminAuditLog } from "./entities/audit-log.entity";
import { Permission } from "./entities/permission.entity";
import { Role } from "./entities/role.entity";
import { RolePermission } from "./entities/role-permission.entity";
import { UserRole } from "./entities/user-role.entity";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RedisModule } from "../redis/redis.module";
import { AdminBootstrapService } from "./admin-bootstrap.service";
import { AdminImportJob } from "./entities/import-job.entity";
import { ImportJobsController } from "./import-jobs.controller";
import { ImportJobsService } from "./import-jobs.service";
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Cocktail,
      CocktailReviewLog,
      Role,
      Permission,
      UserRole,
      RolePermission,
      AdminAuditLog,
      AdminImportJob,
    ]),
    AuthModule,
    RedisModule,
  ],
  controllers: [AdminController, ImportJobsController],
  providers: [
    AdminService,
    PermissionsGuard,
    AdminBootstrapService,
    ImportJobsService,
  ],
})
export class AdminModule {}
