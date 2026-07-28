import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Request } from "express";
import { REQUIRED_PERMISSIONS } from "../decorators/require-permissions.decorator";
import { UserRole } from "../entities/user-role.entity";
import { RolePermission } from "../entities/role-permission.entity";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>, @InjectRepository(RolePermission) private readonly rolePermissions: Repository<RolePermission>) {}
  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) || [];
    if (!required.length) return true;
    const req = context.switchToHttp().getRequest<Request & { authUser?: { id: string } }>();
    if (!req.authUser) return false;
    const roles = await this.userRoles.find({ where: { user: { id: req.authUser.id } }, relations: { role: true } });
    const roleIds = roles.map((x) => x.role.id);
    if (!roleIds.length) throw new ForbiddenException("Insufficient permissions");
    const pairs = await this.rolePermissions.createQueryBuilder("rp").leftJoinAndSelect("rp.permission", "permission").where("rp.roleId IN (:...roleIds)", { roleIds }).getMany();
    const granted = new Set(pairs.map((x) => x.permission.code));
    if (!required.every((code) => granted.has(code))) throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}
