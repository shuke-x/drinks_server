import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AdminDailyRecommendationsService } from "./admin-daily-recommendations.service";
import { RequirePermissions } from "./decorators/require-permissions.decorator";
import { ReplaceDailyRecommendationsDto } from "./dto/daily-recommendations.dto";
import { PermissionsGuard } from "./guards/permissions.guard";

type AuthRequest = Request & { authUser: { id: string } };

@ApiTags("admin-daily-recommendations")
@ApiBearerAuth("access-token")
@Controller("admin/daily-recommendations")
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions("recommendations.manage")
export class AdminDailyRecommendationsController {
  constructor(private readonly service: AdminDailyRecommendationsService) {}

  @Get(":date")
  get(@Param("date") date: string) {
    return this.service.get(date);
  }

  @Put(":date")
  replace(
    @Req() req: AuthRequest,
    @Param("date") date: string,
    @Body() dto: ReplaceDailyRecommendationsDto,
  ) {
    return this.service.replace(req.authUser.id, date, dto.cocktailIds);
  }
}
