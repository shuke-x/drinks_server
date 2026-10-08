import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { FavoriteDto } from "./dto/favorite.dto";
import { UpdateMeDto } from "./dto/update-me.dto";
import { QueryMyCocktailsDto } from "./dto/query-my-cocktails.dto";
import { UsersService } from "./users.service";
import { CocktailLanguageInterceptor } from "../cocktails/cocktail-language.interceptor";

type AuthRequest = Request & { authUser: { id: string; email: string } };

@ApiTags("users")
@ApiBearerAuth("access-token")
@Controller("users/me")
@UseInterceptors(CocktailLanguageInterceptor)
@UseGuards(AccessTokenGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: "获取当前用户资料" })
  @ApiOkResponse({ description: "响应 data 为当前用户资料。" })
  me(@Req() req: AuthRequest) {
    return this.users.me(req.authUser.id);
  }
  @Patch()
  @ApiOperation({ summary: "更新当前用户资料" })
  @ApiBody({ type: UpdateMeDto })
  update(@Req() req: AuthRequest, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(req.authUser.id, dto);
  }
  @Delete()
  @ApiOperation({ summary: "删除当前账号" })
  @ApiOkResponse({
    description:
      "永久删除当前用户，并撤销刷新令牌、清理收藏和角色关联。超级管理员不能通过此接口自删。",
  })
  remove(@Req() req: AuthRequest) {
    return this.users.removeMe(req.authUser.id);
  }
  @Get("blocked-users")
  @ApiOperation({ summary: "获取当前用户屏蔽的用户" })
  blockedUsers(@Req() req: AuthRequest) {
    return this.users.listBlockedUsers(req.authUser.id);
  }
  @Post("blocked-users/:userId")
  @ApiOperation({ summary: "屏蔽用户" })
  blockUser(@Req() req: AuthRequest, @Param("userId") userId: string) {
    return this.users.blockUser(req.authUser.id, userId);
  }
  @Delete("blocked-users/:userId")
  @ApiOperation({ summary: "取消屏蔽用户" })
  unblockUser(@Req() req: AuthRequest, @Param("userId") userId: string) {
    return this.users.unblockUser(req.authUser.id, userId);
  }
  @Get("cocktails")
  @ApiOperation({ summary: "获取当前用户创建的酒单" })
  cocktails(@Req() req: AuthRequest, @Query() query: QueryMyCocktailsDto) {
    return this.users.myCocktails(req.authUser.id, query);
  }
  @Get("favorites")
  @ApiOperation({ summary: "获取当前用户收藏的酒单" })
  favorites(@Req() req: AuthRequest) {
    return this.users.listFavorites(req.authUser.id);
  }
  @Post("favorites")
  @ApiOperation({ summary: "收藏鸡尾酒" })
  @ApiBody({ type: FavoriteDto })
  addFavorite(@Req() req: AuthRequest, @Body() dto: FavoriteDto) {
    return this.users.addFavorite(req.authUser.id, dto.cocktailId);
  }
  @Delete("favorites")
  @ApiOperation({ summary: "取消收藏鸡尾酒" })
  @ApiBody({ type: FavoriteDto })
  removeFavorite(@Req() req: AuthRequest, @Body() dto: FavoriteDto) {
    return this.users.removeFavorite(req.authUser.id, dto.cocktailId);
  }
}
