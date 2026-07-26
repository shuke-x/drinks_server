import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { typeormConfig } from './config/typeorm.config';
import { RedisModule } from './modules/redis/redis.module';
import { CocktailsModule } from './modules/cocktails/cocktails.module';
import { UploadModule } from './modules/upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
@Module({imports:[
  ConfigModule.forRoot({isGlobal:true}),
  TypeOrmModule.forRootAsync({inject:[ConfigService],useFactory:typeormConfig}),
  ServeStaticModule.forRoot(
    {rootPath:join(process.cwd(),'uploads'),serveRoot:'/static'},
    {rootPath:join(process.cwd(),'public'),serveRoot:'/assets'},
  ),
  RedisModule,CocktailsModule,UploadModule,AuthModule,
]})
export class AppModule implements NestModule {configure(consumer:MiddlewareConsumer){consumer.apply(RequestLoggerMiddleware).forRoutes('*');}}
