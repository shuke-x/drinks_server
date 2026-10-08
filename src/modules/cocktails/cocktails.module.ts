import { UploadModule } from "../upload/upload.module";
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
import { CocktailReport } from "./entities/cocktail-report.entity";
import { CocktailReportsController } from "./cocktail-reports.controller";
import { CocktailReportsService } from "./cocktail-reports.service";
import { UserRole } from "../admin/entities/user-role.entity";
import { RolePermission } from "../admin/entities/role-permission.entity";
import { PermissionsGuard } from "../admin/guards/permissions.guard";
import { UserBlock } from "../users/entities/user-block.entity";
@Module({
  imports: [UploadModule,TypeOrmModule.forFeature([Cocktail, CocktailCategory, CocktailReviewLog, CocktailRevision, DailyRecommendation, CocktailReport, UserBlock, User, UserRole, RolePermission]), AuthModule],
  controllers: [CocktailsController, CocktailCategoriesController, CocktailReportsController],
  providers: [CocktailsService, CocktailCategoriesService, CocktailReportsService, PermissionsGuard],
  exports: [CocktailsService, CocktailCategoriesService],
})
export class CocktailsModule {}
