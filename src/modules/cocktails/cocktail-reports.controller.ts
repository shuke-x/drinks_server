import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
import { RequirePermissions } from "../admin/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../admin/guards/permissions.guard";
import { CocktailReportsService } from "./cocktail-reports.service";
import { CreateCocktailReportDto } from "./dto/create-cocktail-report.dto";
import { UpdateCocktailReportStatusDto } from "./dto/update-cocktail-report-status.dto";

type AuthRequest = Request & { authUser: { id: string } };

@ApiTags("cocktail-reports")
@ApiBearerAuth("access-token")
@Controller()
export class CocktailReportsController {
  constructor(private readonly reports: CocktailReportsService) {}

  @Post("cocktails/:id/reports")
  @UseGuards(AccessTokenGuard, RedisRateLimitGuard)
  @RateLimit({ scope: "cocktail-reports", limit: 15, windowSeconds: 3600 })
  report(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateCocktailReportDto) {
    return this.reports.create(req.authUser.id, id, dto);
  }

  @Get("admin/reports")
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions("reports.manage")
  list() { return this.reports.listOpen(); }

  @Patch("admin/reports/:id")
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions("reports.manage")
  update(@Param("id") id: string, @Body() dto: UpdateCocktailReportStatusDto) {
    return this.reports.setStatus(id, dto.status);
  }
}
