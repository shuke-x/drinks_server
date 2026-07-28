import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
export const typeormConfig = (c: ConfigService): TypeOrmModuleOptions => ({
  type: "postgres",
  host: c.get("DB_HOST", "localhost"),
  port: c.get<number>("DB_PORT", 5432),
  username: c.get("DB_USER", "drinks"),
  password: c.get("DB_PASS", "drinks"),
  database: c.get("DB_NAME", "tonight_drinks"),
  autoLoadEntities: true,
  // Schema changes must be delivered through TypeORM migrations.
  synchronize: c.get("DB_SYNC", "false") === "true",
});
