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
import { CocktailCategory } from "../cocktails/entities/cocktail-category.entity";
import { CocktailCategoriesService } from "../cocktails/cocktail-categories.service";
import { AdminCategoriesController } from "./admin-categories.controller";
import { AdminCategoriesService } from "./admin-categories.service";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
import { AdminRevisionsService } from "./admin-revisions.service";
import { DailyRecommendation } from "../cocktails/entities/daily-recommendation.entity";
import { AdminDailyRecommendationsController } from "./admin-daily-recommendations.controller";
import { AdminDailyRecommendationsService } from "./admin-daily-recommendations.service";
import { UsersModule } from "../users/users.module";
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
      CocktailCategory,
      CocktailRevision,
      DailyRecommendation,
    ]),
    AuthModule,
    RedisModule,
    UsersModule,
  ],
  controllers: [AdminController, ImportJobsController, AdminCategoriesController, AdminDailyRecommendationsController],
  providers: [
    AdminService,
    PermissionsGuard,
    AdminBootstrapService,
    ImportJobsService,
    CocktailCategoriesService,
    AdminCategoriesService,
    AdminRevisionsService,
    AdminDailyRecommendationsService,
  ],
})
export class AdminModule {}
