import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AdminService } from "./admin.service";
import { RequirePermissions } from "./decorators/require-permissions.decorator";
import {
  AdminAuditQueryDto,
  AdminCocktailQueryDto,
  AdminUpdateCocktailDto,
  AdminUserQueryDto,
  CreateAdminUserDto,
  CreatePermissionDto,
  CreateRoleDto,
  ReplaceUserRolesDto,
  ReviewDto,
  UpdateRoleDto,
  UpdateUserStatusDto,
} from "./dto/admin.dto";
import { PermissionsGuard } from "./guards/permissions.guard";
import { AdminRevisionsService } from "./admin-revisions.service";
type AuthRequest = Request & { authUser: { id: string } };
@ApiTags("admin") @ApiBearerAuth("access-token") @Controller("admin") @UseGuards(AccessTokenGuard, PermissionsGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly revisions: AdminRevisionsService) {}
  @Get("users") @RequirePermissions("users.read") users(@Query() q: AdminUserQueryDto) { return this.admin.usersList(q); }
  @Post("users") @RequirePermissions("users.create") createUser(@Req() r: AuthRequest, @Body() dto: CreateAdminUserDto) { return this.admin.createUser(r.authUser.id, dto); }
  @Get("users/:id") @RequirePermissions("users.read") user(@Param("id") id: string) { return this.admin.userDetail(id); }
  @Delete("users/:id") @RequirePermissions("users.delete") deleteUser(@Req() r: AuthRequest, @Param("id") id: string) { return this.admin.removeUser(r.authUser.id, id); }
  @Patch("users/:id/status") @RequirePermissions("users.update_status") status(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: UpdateUserStatusDto) { return this.admin.setUserStatus(r.authUser.id, id, dto); }
  @Put("users/:id/roles") @RequirePermissions("users.assign_roles") roles(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: ReplaceUserRolesDto) { return this.admin.replaceRoles(r.authUser.id, id, dto.roleIds); }
  @Get("cocktails") @RequirePermissions("cocktails.read") cocktails(@Query() q: AdminCocktailQueryDto) { return this.admin.cocktailsList(q); }
  @Get("cocktails/:id") @RequirePermissions("cocktails.read") cocktail(@Param("id") id: string) { return this.admin.cocktailDetail(id); }
  @Patch("cocktails/:id") @RequirePermissions("cocktails.update") updateCocktail(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: AdminUpdateCocktailDto) { return this.admin.updateCocktail(r.authUser.id, id, dto); }
  @Post("cocktails/:id/approve") @RequirePermissions("cocktails.review") approve(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: ReviewDto) { return this.admin.review(r.authUser.id, id, "approve", dto.reason); }
  @Post("cocktails/:id/reject") @RequirePermissions("cocktails.review") reject(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: ReviewDto) { return this.admin.review(r.authUser.id, id, "reject", dto.reason); }
  @Post("cocktails/:id/offline") @RequirePermissions("cocktails.offline") offline(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: ReviewDto) { return this.admin.review(r.authUser.id, id, "offline", dto.reason); }
  @Post("cocktails/:id/publish") @RequirePermissions("cocktails.publish") publish(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: ReviewDto) { return this.admin.review(r.authUser.id, id, "publish", dto.reason); }
  @Post("cocktails/:id/revisions/:revisionId/approve") @RequirePermissions("cocktails.review") approveRevision(@Req() r: AuthRequest, @Param("id") id: string, @Param("revisionId") revisionId: string, @Body() dto: ReviewDto) { return this.revisions.review(r.authUser.id, id, revisionId, "approve", dto.reason); }
  @Post("cocktails/:id/revisions/:revisionId/reject") @RequirePermissions("cocktails.review") rejectRevision(@Req() r: AuthRequest, @Param("id") id: string, @Param("revisionId") revisionId: string, @Body() dto: ReviewDto) { return this.revisions.review(r.authUser.id, id, revisionId, "reject", dto.reason); }
  @Delete("cocktails/:id") @RequirePermissions("cocktails.delete") remove(@Req() r: AuthRequest, @Param("id") id: string) { return this.admin.removeCocktail(r.authUser.id, id); }
  @Get("audit-logs") @RequirePermissions("audit_logs.read") auditLogs(@Query() q: AdminAuditQueryDto) { return this.admin.auditLogs(q); }
  @Get("roles") @RequirePermissions("roles.read") rolesList() { return this.admin.listRoles(); }
  @Post("permissions") @RequirePermissions("roles.manage") createPermission(@Req() r: AuthRequest, @Body() dto: CreatePermissionDto) { return this.admin.createPermission(r.authUser.id, dto); }
  @Post("roles") @RequirePermissions("roles.manage") createRole(@Req() r: AuthRequest, @Body() dto: CreateRoleDto) { return this.admin.createRole(r.authUser.id, dto); }
  @Patch("roles/:id") @RequirePermissions("roles.manage") updateRole(@Req() r: AuthRequest, @Param("id") id: string, @Body() dto: UpdateRoleDto) { return this.admin.updateRole(r.authUser.id, id, dto); }
}
