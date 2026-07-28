import { join } from "path";
import { DataSource } from "typeorm";
import { RefreshToken } from "../modules/auth/entities/refresh-token.entity";
import { Cocktail } from "../modules/cocktails/entities/cocktail.entity";
import { Favorite } from "../modules/users/entities/favorite.entity";
import { User } from "../modules/users/entities/user.entity";
import { CocktailReviewLog } from "../modules/cocktails/entities/cocktail-review-log.entity";
import { Role } from "../modules/admin/entities/role.entity";
import { Permission } from "../modules/admin/entities/permission.entity";
import { UserRole } from "../modules/admin/entities/user-role.entity";
import { RolePermission } from "../modules/admin/entities/role-permission.entity";
import { AdminAuditLog } from "../modules/admin/entities/audit-log.entity";
import { AdminImportJob } from "../modules/admin/entities/import-job.entity";
import { CocktailRevision } from "../modules/cocktails/entities/cocktail-revision.entity";
export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? "drinks",
  password: process.env.DB_PASS ?? "drinks",
  database: process.env.DB_NAME ?? "tonight_drinks",
  entities: [Cocktail, CocktailReviewLog, CocktailRevision, User, RefreshToken, Favorite, Role, Permission, UserRole, RolePermission, AdminAuditLog, AdminImportJob],
  migrations: [join(__dirname, "../../migrations/*{.ts,.js}")],
  synchronize: false,
});
