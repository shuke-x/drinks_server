import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard, OptionalAccessTokenGuard } from "../auth/access-token.guard";
import { CocktailsService } from "./cocktails.service";
import { CreateCocktailDto } from "./dto/create-cocktail.dto";
import { QueryCocktailDto } from "./dto/query-cocktail.dto";
import { UpdateCocktailDto } from "./dto/update-cocktail.dto";
import { NormalizeSpiritPipe } from "../../common/pipes/normalize-spirit.pipe";
type OptionalAuthRequest = Request & {
  authUser?: { id: string; email: string };
};
@ApiTags("cocktails")
@Controller("cocktails")
@UseGuards(OptionalAccessTokenGuard)
export class CocktailsController {
  constructor(private readonly service: CocktailsService) {}
  @Get() list(@Query() q: QueryCocktailDto) {
    return this.service.list(q);
  }
  @Get("recommendations") recommendations() {
    return this.service.recommendations();
  }
  @Get("random") random(@Query("spirit", NormalizeSpiritPipe) spirit?: string) {
    return this.service.random(spirit);
  }
  @Get(":id") one(@Param("id") id: string, @Req() req: OptionalAuthRequest) {
    return this.service.one(id, req.authUser?.id);
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
