import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { AllExceptionFilter } from "./common/filters/http-exception.filter";
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionFilter());
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
  const env = app.get(ConfigService);
  await app.listen(env.get<number>("PORT", 3000));
}
void bootstrap();
