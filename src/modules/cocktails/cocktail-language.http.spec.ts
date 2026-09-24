import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { CocktailsController } from "./cocktails.controller";
import { CocktailsService } from "./cocktails.service";
import { UsersController } from "../users/users.controller";
import { UsersService } from "../users/users.service";
import { AccessTokenGuard, OptionalAccessTokenGuard } from "../auth/access-token.guard";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
import { ResponseInterceptor } from "../../common/interceptors/response.interceptor";
import { CocktailCategoriesController } from "./cocktail-categories.controller";
import { CocktailCategoriesService } from "./cocktail-categories.service";
import { AdminCategoriesController } from "../admin/admin-categories.controller";
import { AdminCategoriesService } from "../admin/admin-categories.service";
import { PermissionsGuard } from "../admin/guards/permissions.guard";

describe("public cocktail language HTTP contract", () => {
  let app: INestApplication;
  const cocktail = { id: "test", zh: "测试", en: "Test", spirit: "gin", recipe: [{ n: "金酒", nEn: "Gin", ml: 30 }], story: "中文", storyEn: "English" };
  const paged = { __paged: true, data: [cocktail], meta: { page: 1, limit: 20, total: 1 } };
  const categories = [
    { id: "gin", code: "gin", name: "金酒", nameEn: "Gin", description: "杜松子风味", descriptionEn: "Juniper flavored", isActive: true, sortOrder: 1 },
    { id: "other", code: "other", name: "其他", nameEn: null, description: "其他基酒", descriptionEn: " ", isActive: true, sortOrder: 2 },
  ];

  beforeAll(async () => {
    const allow = { canActivate: (context: any) => { context.switchToHttp().getRequest().authUser = { id: "user" }; return true; } };
    const module = await Test.createTestingModule({
      controllers: [CocktailsController, UsersController, CocktailCategoriesController, AdminCategoriesController],
      providers: [
        { provide: CocktailCategoriesService, useValue: { listPublic: () => categories } },
        { provide: AdminCategoriesService, useValue: { list: () => categories } },
        { provide: CocktailsService, useValue: { list: () => paged, one: () => cocktail, random: () => cocktail, recommendations: () => [cocktail], todayRecommendations: () => ({ items: [cocktail] }) } },
        { provide: UsersService, useValue: { myCocktails: () => paged, listFavorites: () => [{ cocktail }] } },
      ],
    }).overrideGuard(AccessTokenGuard).useValue(allow)
      .overrideGuard(PermissionsGuard).useValue(allow)
      .overrideGuard(OptionalAccessTokenGuard).useValue(allow)
      .overrideGuard(RedisRateLimitGuard).useValue(allow).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it.each(["/cocktails", "/cocktails/test", "/cocktails/random", "/cocktails/recommendations", "/cocktails/today-recommendations", "/users/me/cocktails", "/users/me/favorites"])("localizes %s and accepts lang through strict query validation", async path => {
    const english = await request(app.getHttpServer()).get(`${path}?lang=en`).expect(200);
    expect(JSON.stringify(english.body.data)).toContain('"story":"English"');
    expect(JSON.stringify(english.body.data)).not.toContain('"storyEn"');
    const chinese = await request(app.getHttpServer()).get(path).expect(200);
    expect(JSON.stringify(chinese.body.data)).toContain('"story":"中文"');
    expect(cocktail.story).toBe("中文");
  });

  it("rejects unsupported languages", async () => {
    await request(app.getHttpServer()).get("/cocktails/test?lang=fr").expect(400);
  });

  it("localizes category names and descriptions with stable keys and per-field fallback", async () => {
    const english = await request(app.getHttpServer()).get("/cocktail-categories?lang=en").expect(200);
    const chinese = await request(app.getHttpServer()).get("/cocktail-categories").expect(200);
    expect(english.body.data[0]).toMatchObject({ code: "gin", name: "Gin", nameEn: "Gin", description: "Juniper flavored", sortOrder: 1 });
    expect(english.body.data[1]).toMatchObject({ name: "其他", description: "其他基酒" });
    expect(chinese.body.data[0]).toMatchObject({ name: "金酒", description: "杜松子风味" });
    expect(english.body.data[0]).not.toHaveProperty("descriptionEn");
    expect(Object.keys(english.body.data[0])).toEqual(Object.keys(chinese.body.data[0]));
    const explicitChinese = await request(app.getHttpServer()).get("/cocktail-categories?lang=zh").expect(200);
    expect(explicitChinese.body).toEqual(chinese.body);
    expect(categories[0].name).toBe("金酒");
  });

  it("keeps both category languages in admin responses", async () => {
    const response = await request(app.getHttpServer()).get("/admin/cocktail-categories?lang=en").expect(200);
    expect(response.body.data).toEqual(categories);
  });

  it("rejects unsupported and repeated category languages", async () => {
    await request(app.getHttpServer()).get("/cocktail-categories?lang=fr").expect(400);
    await request(app.getHttpServer()).get("/cocktail-categories?lang=en&lang=zh").expect(400);
  });
});
