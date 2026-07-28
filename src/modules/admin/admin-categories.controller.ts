import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AccessTokenGuard } from "../auth/access-token.guard";
import {
  CreateCocktailCategoryDto,
  UpdateCocktailCategoryDto,
} from "../cocktails/dto/cocktail-category.dto";
import { RequirePermissions } from "./decorators/require-permissions.decorator";
import { PermissionsGuard } from "./guards/permissions.guard";
import { AdminCategoriesService } from "./admin-categories.service";

type AuthRequest = Request & { authUser: { id: string } };

@ApiTags("admin-categories")
@ApiBearerAuth("access-token")
@Controller("admin/cocktail-categories")
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions("categories.manage")
export class AdminCategoriesController {
  constructor(private readonly categories: AdminCategoriesService) {}
  @Get() list() {
    return this.categories.list();
  }
  @Post() create(@Req() req: AuthRequest, @Body() dto: CreateCocktailCategoryDto) {
    return this.categories.create(req.authUser.id, dto);
  }
  @Patch(":id") update(
    @Req() req: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCocktailCategoryDto,
  ) {
    return this.categories.update(req.authUser.id, id, dto);
  }
  @Delete(":id") remove(@Req() req: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.categories.remove(req.authUser.id, id);
  }
}
