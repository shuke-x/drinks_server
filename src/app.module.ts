import { OperationsModule } from './modules/operations/operations.module';
import { ExperienceModule } from './modules/experience/experience.module';
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { typeormConfig } from "./config/typeorm.config";
import { RedisModule } from "./modules/redis/redis.module";
import { CocktailsModule } from "./modules/cocktails/cocktails.module";
import { UploadModule } from "./modules/upload/upload.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { AdminModule } from "./modules/admin/admin.module";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: typeormConfig,
    }),
    RedisModule,
    CocktailsModule,
    UploadModule,
    AuthModule,
    UsersModule,
    AdminModule,
    ExperienceModule,
    OperationsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("{*path}");
  }
}
