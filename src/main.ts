import { NestExpressApplication } from '@nestjs/platform-express';
import express from "express";
import { join } from "path";
import { MediaAccessService } from "./modules/upload/media-access.service";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { AllExceptionFilter } from "./common/filters/http-exception.filter";
import helmet from "helmet";
import { AuthService } from "./modules/auth/auth.service";
import { cookieSessionSecurity } from "./common/middleware/cookie-session-security.middleware";
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '3mb', type: (req: { url?: string }) =>
    /^\/api\/v1\/(?:users\/me|admin)\/drink-records(?:[/?]|$)/.test(req.url ?? '') });
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '100kb' });
  const env = app.get(ConfigService);
  const nodeEnv = env.get<string>("NODE_ENV", "development");
  const swaggerEnabled =
    env.get<string>(
      "SWAGGER_ENABLED",
      nodeEnv === "production" ? "false" : "true",
    ) === "true";
  const corsOrigins = env
    .get<string>("CORS_ORIGINS", "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const cookieEnabled = env.get<string>("AUTH_COOKIE_ENABLED", "false") === "true";
  if (cookieEnabled && corsOrigins.length === 0) throw new Error("Cookie sessions require explicit CORS_ORIGINS, including the admin origin");
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set("trust proxy", env.get<string>("TRUST_PROXY", "loopback"));
  app.use(
    swaggerEnabled
      ? helmet({
          contentSecurityPolicy: false,
          crossOriginResourcePolicy: { policy: "cross-origin" },
        })
      : helmet({
          crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
  );
  app.setGlobalPrefix("api/v1",{exclude:[{path:'static/{*path}',method:RequestMethod.ALL}]});
  app.use('/assets',express.static(join(process.cwd(),'public'),{dotfiles:'deny'}));
  const media=app.get(MediaAccessService);
  app.use((req:express.Request,_res:express.Response,next:express.NextFunction)=>{if(req.body) req.body=media.map(req.body,undefined,true);next();});
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: ["Authorization", "Content-Type", "X-Record-Account", "X-CSRF-Token", "X-Auth-Mode"],
    credentials: cookieEnabled,
    maxAge: 86400,
  });
  app.use(cookieSessionSecurity(
    cookieEnabled,
    corsOrigins,
    (token, refreshToken) => app.get(AuthService).validCsrf(token, refreshToken),
  ));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor(media));
  app.useGlobalFilters(new AllExceptionFilter());
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("今晚喝什么 API")
      .setDescription(
        '所有成功响应均为 `{ code: 0, message: "ok", data: ... }`。需要登录的接口使用 Bearer accessToken。',
      )
      .setVersion("1.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "填写登录或刷新接口返回的 accessToken。",
        },
        "access-token",
      )
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
  }
  app.enableShutdownHooks();
  await app.listen(env.get<number>("PORT", 3000));
}
void bootstrap();
