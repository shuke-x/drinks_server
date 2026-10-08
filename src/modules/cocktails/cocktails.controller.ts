import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard, OptionalAccessTokenGuard } from "../auth/access-token.guard";
import { CocktailsService } from "./cocktails.service";
import { CreateCocktailDto } from "./dto/create-cocktail.dto";
import { QueryCocktailDto } from "./dto/query-cocktail.dto";
import { UpdateCocktailDto } from "./dto/update-cocktail.dto";
import { NormalizeSpiritPipe } from "../../common/pipes/normalize-spirit.pipe";
import { CocktailLanguageInterceptor } from "./cocktail-language.interceptor";
import { CocktailReportsService } from "./cocktail-reports.service";
type OptionalAuthRequest = Request & {
  authUser?: { id: string; email: string };
};
@ApiTags("cocktails")
@Controller("cocktails")
@UseInterceptors(CocktailLanguageInterceptor)
@UseGuards(OptionalAccessTokenGuard,RedisRateLimitGuard)
@RateLimit({scope:"cocktails",limit:120,windowSeconds:60})
export class CocktailsController {
  constructor(private readonly service: CocktailsService, private readonly reports: CocktailReportsService) {}
  @Get() async list(@Query() q: QueryCocktailDto, @Req() req: OptionalAuthRequest) {
    const result = await this.service.list(q);
    return this.reports.filterBlocked(req.authUser?.id, result);
  }
  @Get("recommendations") async recommendations(@Req() req: OptionalAuthRequest) {
    return this.reports.filterBlocked(req.authUser?.id, await this.service.recommendations());
  }
  @Get("today-recommendations") async todayRecommendations(@Req() req: OptionalAuthRequest) {
    return this.reports.filterBlocked(req.authUser?.id, await this.service.todayRecommendations());
  }
  @RateLimit({scope:"cocktails-random",limit:30,windowSeconds:60})
  @Get("random") async random(@Query("spirit", NormalizeSpiritPipe) spirit?: string, @Req() req?: OptionalAuthRequest) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await this.service.random(spirit);
      if (!(await this.reports.isBlocked(req?.authUser?.id, result.publisher?.id))) return result;
    }
    throw new NotFoundException("No available cocktail found");
  }
  @Get(":id") async one(@Param("id") id: string, @Req() req: OptionalAuthRequest) {
    const result = await this.service.one(id, req.authUser?.id);
    if (await this.reports.isBlocked(req.authUser?.id, result.publisher?.id))
      throw new NotFoundException("Cocktail not found");
    return result;
  }
  @Post() create(
    @Body() dto: CreateCocktailDto,
    @Req() req: OptionalAuthRequest,
  ) {
    return this.service.create(dto, req.authUser?.id);
  }
  @Post(":id/submit")
  @UseGuards(AccessTokenGuard)
  submit(@Param("id") id: string, @Req() req: OptionalAuthRequest) {
    return this.service.submit(id, req.authUser!.id);
  }
  @Post(":id/withdraw")
  @UseGuards(AccessTokenGuard)
  withdraw(@Param("id") id: string, @Req() req: OptionalAuthRequest) {
    return this.service.withdraw(id, req.authUser!.id);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateCocktailDto,
    @Req() req: OptionalAuthRequest,
  ) {
    return this.service.update(id, dto, req.authUser?.id);
  }
  @Delete(":id") remove(
    @Param("id") id: string,
    @Req() req: OptionalAuthRequest,
  ) {
    return this.service.remove(id, req.authUser?.id);
  }
}
