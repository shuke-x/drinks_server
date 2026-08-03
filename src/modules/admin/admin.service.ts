import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import {
  Cocktail,
  CocktailStatus,
} from "../cocktails/entities/cocktail.entity";
import { CocktailCategory } from "../cocktails/entities/cocktail-category.entity";
import { CocktailReviewLog } from "../cocktails/entities/cocktail-review-log.entity";
import { CocktailRevision } from "../cocktails/entities/cocktail-revision.entity";
import { RedisService } from "../redis/redis.service";
import {
  User,
  UserAccountSource,
  UserStatus,
} from "../users/entities/user.entity";
import { UsersService } from "../users/users.service";
import { hashPassword } from "../auth/password-hash.util";
import {
  AdminAuditQueryDto,
  AdminCocktailQueryDto,
  AdminUpdateCocktailDto,
  AdminUserQueryDto,
  CreateAdminUserDto,
  CreatePermissionDto,
  CreateRoleDto,
  UpdateRoleDto,
  UpdateUserStatusDto,
} from "./dto/admin.dto";
import { AdminAuditLog } from "./entities/audit-log.entity";
import { Permission } from "./entities/permission.entity";
import { Role } from "./entities/role.entity";
import { RolePermission } from "./entities/role-permission.entity";
import { UserRole } from "./entities/user-role.entity";

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Cocktail) private readonly cocktails: Repository<Cocktail>,
    @InjectRepository(CocktailCategory)
    private readonly categories: Repository<CocktailCategory>,
    @InjectRepository(CocktailReviewLog)
    private readonly reviewLogs: Repository<CocktailReviewLog>,
    @InjectRepository(CocktailRevision)
    private readonly revisions: Repository<CocktailRevision>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissions: Repository<Permission>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
    private readonly redis: RedisService,
    private readonly usersService: UsersService,
  ) {}

  async createUser(actorId: string, dto: CreateAdminUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ where: { email } }))
      throw new ConflictException("Email is already registered");
    const roles = await this.resolveRoles(dto.roleIds ?? []);
    const actor = await this.users.findOneBy({ id: actorId });
    if (!actor) throw new NotFoundException("Administrator not found");
    const actorIsSuperAdmin = await this.userRoles.exists({
      where: { user: { id: actorId }, role: { code: "super_admin" } },
    });
    if (
      !actorIsSuperAdmin &&
      roles.some((role) => role.code !== "user")
    )
      throw new ConflictException(
        "Only super admins can create administrator accounts",
      );
    const passwordHash = await hashPassword(dto.password);
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          email,
          passwordHash,
          name: dto.name.trim(),
          status: UserStatus.ACTIVE,
          accountSource: UserAccountSource.ADMIN,
          avatarUrl: null,
          disabledAt: null,
          disabledReason: null,
        }),
      );
      if (roles.length)
        await manager.save(
          UserRole,
          roles.map((role) =>
            manager.create(UserRole, { user, role, assignedBy: actor }),
          ),
        );
      await this.audit(
        manager,
        actorId,
        "users.create",
        "user",
        user.id,
        null,
        { email: user.email, name: user.name, roleIds: roles.map((role) => role.id) },
      );
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return { ...safeUser, roles };
    });
  }

  async removeUser(actorId: string, id: string) {
    if (actorId === id)
      throw new ConflictException("You cannot delete your own account");
    const [actorIsSuperAdmin, user, targetRoles] = await Promise.all([
      this.userRoles.exists({
        where: { user: { id: actorId }, role: { code: "super_admin" } },
      }),
      this.users.findOneBy({ id }),
      this.userRoles.find({ where: { user: { id } }, relations: { role: true } }),
    ]);
    if (!actorIsSuperAdmin)
      throw new ConflictException("Only super admins can delete users");
    if (!user) throw new NotFoundException("User not found");
    if (targetRoles.some((item) => item.role.code === "super_admin")) {
      const superAdminCount = await this.userRoles.count({
        where: { role: { code: "super_admin" } },
      });
      if (superAdminCount <= 1)
        throw new ConflictException("The last super admin cannot be deleted");
    }
    const before = {
      email: user.email,
      name: user.name,
      status: user.status,
      roleIds: targetRoles.map((item) => item.role.id),
    };
    await this.usersService.removeByAdmin(id);
    await this.dataSource.transaction((manager) =>
      this.audit(manager, actorId, "users.delete", "user", id, before, null),
    );
    return { id };
  }

  async usersList(query: AdminUserQueryDto) {
    const builder = this.users.createQueryBuilder("user");
    if (query.status)
      builder.where("user.status = :status", { status: query.status });
    if (query.accountSource)
      builder.andWhere("user.accountSource = :accountSource", {
        accountSource: query.accountSource,
      });
    if (query.search)
      builder.andWhere("(user.email ILIKE :search OR user.name ILIKE :search)", {
        search: `%${query.search}%`,
      });
    const [users, total] = await builder
      .orderBy("user.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const [assignments, cocktailCounts] = users.length
      ? await Promise.all([
          this.userRoles.find({
            where: { user: { id: In(users.map((user) => user.id)) } },
            relations: { user: true, role: true },
          }),
          this.cocktails
            .createQueryBuilder("cocktail")
            .select('cocktail."ownerId"', "userId")
            .addSelect("COUNT(*)", "count")
            .where('cocktail."ownerId" IN (:...userIds)', {
              userIds: users.map((user) => user.id),
            })
            .groupBy('cocktail."ownerId"')
            .getRawMany<{ userId: string; count: string }>(),
        ])
      : [[], []];
    const rolesByUser = new Map<string, Role[]>();
    for (const assignment of assignments) {
      const roles = rolesByUser.get(assignment.user.id) ?? [];
      roles.push(assignment.role);
      rolesByUser.set(assignment.user.id, roles);
    }
    const cocktailCountByUser = new Map(
      cocktailCounts.map((item) => [item.userId, Number(item.count)]),
    );
    return {
      __paged: true,
      data: users.map((user) => ({
        ...user,
        roles: rolesByUser.get(user.id) ?? [],
        cocktailCount: cocktailCountByUser.get(user.id) ?? 0,
      })),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async userDetail(id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    const [assignments, cocktails] = await Promise.all([
      this.userRoles.find({
        where: { user: { id } },
        relations: { role: true },
      }),
      this.cocktails.find({
        where: { owner: { id } },
        relations: { category: true },
        order: { updatedAt: "DESC" },
        take: 5,
      }),
    ]);
    const counts = await this.cocktails
      .createQueryBuilder("cocktail")
      .select("cocktail.status", "status")
      .addSelect("COUNT(*)", "count")
      .where("cocktail.ownerId = :id", { id })
      .groupBy("cocktail.status")
      .getRawMany<{ status: CocktailStatus; count: string }>();
    const stats: Record<string, number> = {
      total: counts.reduce((sum, item) => sum + Number(item.count), 0),
    };
    for (const item of counts) stats[item.status] = Number(item.count);
    return {
      user: { ...user, roles: assignments.map((item) => item.role) },
      stats,
      recentCocktails: cocktails,
    };
  }

  async cocktailsList(query: AdminCocktailQueryDto) {
    const builder = this.cocktails
      .createQueryBuilder("cocktail")
      .leftJoinAndSelect("cocktail.owner", "owner")
      .leftJoinAndSelect("cocktail.reviewer", "reviewer")
      .leftJoinAndSelect("cocktail.category", "category");
    if (query.status)
      builder.andWhere("cocktail.status = :status", { status: query.status });
    if (query.ownerId)
      builder.andWhere("cocktail.ownerId = :ownerId", {
        ownerId: query.ownerId,
      });
    if (query.spirit)
      builder.andWhere("cocktail.spirit = :spirit", { spirit: query.spirit });
    if (query.search)
      builder.andWhere(
        "(cocktail.zh ILIKE :search OR cocktail.en ILIKE :search)",
        { search: `%${query.search}%` },
      );
    const [data, total] = await builder
      .orderBy("cocktail.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      __paged: true,
      data,
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async cocktailDetail(id: string) {
    const cocktail = await this.cocktails.findOne({
      where: { id },
      relations: { owner: true, reviewer: true, category: true },
    });
    if (!cocktail) throw new NotFoundException("Cocktail not found");
    const [reviewLogs, revisions] = await Promise.all([
      this.reviewLogs.find({
        where: { cocktail: { id } },
        relations: { reviewer: true },
        order: { createdAt: "DESC" },
      }),
      this.revisions.find({
        where: { cocktail: { id } },
        relations: { author: true, reviewer: true },
        order: { createdAt: "DESC" },
      }),
    ]);
    return { cocktail, revisions, reviewLogs };
  }

  async updateCocktail(
    actorId: string,
    id: string,
    dto: AdminUpdateCocktailDto,
  ) {
    const cocktail = await this.cocktails.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!cocktail) throw new NotFoundException("Cocktail not found");
    const before = this.cocktailSnapshot(cocktail);
    if (dto.spirit !== undefined && dto.spirit !== cocktail.spirit) {
      const category = await this.categories.findOneBy({
        code: dto.spirit,
        isActive: true,
      });
      if (!category)
        throw new BadRequestException("Cocktail category does not exist or is inactive");
      cocktail.spirit = category.code;
      cocktail.category = category;
    }
    for (const field of ["zh", "en", "abv", "story", "tags", "images"] as const) {
      if (dto[field] !== undefined) (cocktail as any)[field] = dto[field];
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.save(cocktail);
      await this.audit(
        manager,
        actorId,
        "cocktails.update",
        "cocktail",
        id,
        before,
        this.cocktailSnapshot(cocktail),
      );
    });
    await this.invalidateCocktailCache();
    return this.cocktailDetail(id).then((result) => result.cocktail);
  }

  async removeCocktail(actorId: string, id: string) {
    const cocktail = await this.cocktails.findOneBy({ id });
    if (!cocktail) throw new NotFoundException("Cocktail not found");
    await this.dataSource.transaction(async (manager) => {
      await manager.softRemove(cocktail);
      await this.audit(
        manager,
        actorId,
        "cocktails.delete",
        "cocktail",
        id,
        { status: cocktail.status },
        null,
      );
    });
    await this.invalidateCocktailCache();
    return { id };
  }

  async auditLogs(query: AdminAuditQueryDto) {
    const builder = this.dataSource
      .getRepository(AdminAuditLog)
      .createQueryBuilder("audit")
      .leftJoinAndSelect("audit.actor", "actor");
    if (query.targetType)
      builder.andWhere("audit.targetType = :targetType", {
        targetType: query.targetType,
      });
    if (query.action)
      builder.andWhere("audit.action = :action", { action: query.action });
    if (query.actorId)
      builder.andWhere("audit.actorId = :actorId", { actorId: query.actorId });
    const [data, total] = await builder
      .orderBy("audit.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return {
      __paged: true,
      data,
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async listRoles() {
    const [roles, permissions, pairs, assignments] = await Promise.all([
      this.roles.find({ order: { code: "ASC" } }),
      this.permissions.find({ order: { code: "ASC" } }),
      this.rolePermissions.find({ relations: { role: true, permission: true } }),
      this.userRoles.find({ relations: { role: true } }),
    ]);
    return {
      roles: roles.map((role) => ({
        ...role,
        permissionIds: pairs
          .filter((pair) => pair.role.id === role.id)
          .map((pair) => pair.permission.id),
        memberCount: assignments.filter(
          (assignment) => assignment.role.id === role.id,
        ).length,
      })),
      permissions,
    };
  }

  async createRole(actorId: string, dto: CreateRoleDto) {
    if (await this.roles.exists({ where: { code: dto.code } }))
      throw new ConflictException("Role code already exists");
    const permissions = await this.resolvePermissions(dto.permissionIds ?? []);
    return this.dataSource.transaction(async (manager) => {
      const role = await manager.save(
        manager.create(Role, {
          code: dto.code,
          name: dto.name,
          description: dto.description || null,
          isSystem: false,
        }),
      );
      if (permissions.length)
        await manager.save(
          RolePermission,
          permissions.map((permission) =>
            manager.create(RolePermission, { role, permission }),
          ),
        );
      await this.audit(
        manager,
        actorId,
        "roles.create",
        "role",
        role.id,
        null,
        { ...role, permissionIds: permissions.map((item) => item.id) },
      );
      return role;
    });
  }

  async createPermission(actorId: string, dto: CreatePermissionDto) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (await this.permissions.exists({ where: { code } }))
      throw new ConflictException("Permission code already exists");

    return this.dataSource.transaction(async (manager) => {
      const permission = await manager.save(
        manager.create(Permission, { code, name }),
      );
      const superAdmin = await manager.findOneBy(Role, {
        code: "super_admin",
      });
      if (!superAdmin)
        throw new ConflictException("Super admin role does not exist");
      await manager.save(
        manager.create(RolePermission, {
          role: superAdmin,
          permission,
        }),
      );
      await this.audit(
        manager,
        actorId,
        "permissions.create",
        "permission",
        permission.id,
        null,
        permission,
      );
      return permission;
    });
  }

  async updateRole(actorId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.roles.findOneBy({ id });
    if (!role) throw new NotFoundException("Role not found");
    if (role.code === "super_admin" && dto.permissionIds !== undefined)
      throw new ConflictException("Super admin permissions cannot be changed");
    const before = { ...role };
    const permissions =
      dto.permissionIds === undefined
        ? null
        : await this.resolvePermissions(dto.permissionIds);
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined)
      role.description = dto.description || null;
    await this.dataSource.transaction(async (manager) => {
      await manager.save(role);
      if (permissions) {
        await manager.delete(RolePermission, { role: { id } });
        if (permissions.length)
          await manager.save(
            RolePermission,
            permissions.map((permission) =>
              manager.create(RolePermission, { role, permission }),
            ),
          );
      }
      await this.audit(
        manager,
        actorId,
        "roles.update",
        "role",
        id,
        before,
        {
          ...role,
          ...(permissions
            ? { permissionIds: permissions.map((item) => item.id) }
            : {}),
        },
      );
    });
    return role;
  }

  async setUserStatus(
    actorId: string,
    id: string,
    dto: UpdateUserStatusDto,
  ) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("User not found");
    if (id === actorId && dto.status === UserStatus.DISABLED)
      throw new ConflictException("You cannot disable yourself");
    if (dto.status === UserStatus.DISABLED) {
      const current = await this.userRoles.find({
        where: { user: { id } },
        relations: { role: true },
      });
      if (current.some((item) => item.role.code === "super_admin")) {
        const activeAdmins = await this.userRoles
          .createQueryBuilder("userRole")
          .innerJoin(
            "userRole.role",
            "role",
            "role.code = :code",
            { code: "super_admin" },
          )
          .innerJoin(
            "userRole.user",
            "user",
            "user.status = :status",
            { status: UserStatus.ACTIVE },
          )
          .getCount();
        if (activeAdmins <= 1)
          throw new ConflictException(
            "The last active super admin cannot be disabled",
          );
      }
    }
    const before = {
      status: user.status,
      disabledAt: user.disabledAt,
      disabledReason: user.disabledReason,
    };
    user.status = dto.status;
    user.disabledAt = dto.status === UserStatus.DISABLED ? new Date() : null;
    user.disabledReason =
      dto.status === UserStatus.DISABLED ? dto.reason || null : null;
    await this.dataSource.transaction(async (manager) => {
      await manager.save(user);
      await this.audit(
        manager,
        actorId,
        "users.update_status",
        "user",
        id,
        before,
        { status: user.status, disabledReason: user.disabledReason },
      );
    });
    return user;
  }

  async review(
    actorId: string,
    id: string,
    action: "approve" | "reject" | "offline" | "publish",
    reason?: string,
  ) {
    const cocktail = await this.cocktails.findOne({
      where: { id },
      relations: { reviewer: true },
    });
    if (!cocktail) throw new NotFoundException("Cocktail not found");
    const from = cocktail.status;
    if ((action === "reject" || action === "offline") && !reason)
      throw new BadRequestException("reason is required");
    const targets: Record<string, CocktailStatus> = {
      approve: CocktailStatus.PUBLISHED,
      reject: CocktailStatus.REJECTED,
      offline: CocktailStatus.OFFLINE,
      publish: CocktailStatus.PUBLISHED,
    };
    const allowed: Record<string, CocktailStatus[]> = {
      approve: [CocktailStatus.PENDING],
      reject: [CocktailStatus.PENDING],
      offline: [CocktailStatus.PUBLISHED],
      publish: [CocktailStatus.OFFLINE],
    };
    if (!allowed[action].includes(from))
      throw new ConflictException("Invalid cocktail status transition");
    const reviewer = await this.users.findOneBy({ id: actorId });
    if (!reviewer) throw new NotFoundException("Reviewer not found");
    cocktail.status = targets[action];
    cocktail.reviewer = reviewer;
    cocktail.reviewedAt = new Date();
    if (action === "approve" || action === "publish") {
      cocktail.publishedAt = new Date();
      cocktail.rejectReason = null;
      cocktail.offlineReason = null;
    }
    if (action === "reject") cocktail.rejectReason = reason!;
    if (action === "offline") cocktail.offlineReason = reason!;
    await this.dataSource.transaction(async (manager) => {
      await manager.save(cocktail);
      await manager.save(
        CocktailReviewLog,
        manager.create(CocktailReviewLog, {
          cocktail,
          action,
          fromStatus: from,
          toStatus: cocktail.status,
          reviewer,
          reason: reason || null,
        }),
      );
      await this.audit(
        manager,
        actorId,
        `cocktails.${action}`,
        "cocktail",
        id,
        { status: from },
        { status: cocktail.status, reason: reason || null },
      );
    });
    await this.invalidateCocktailCache();
    return cocktail;
  }

  async replaceRoles(actorId: string, userId: string, roleIds: string[]) {
    const [user, actor, roles] = await Promise.all([
      this.users.findOneBy({ id: userId }),
      this.users.findOneBy({ id: actorId }),
      this.roles.findBy({ id: In(roleIds) }),
    ]);
    if (!user || !actor) throw new NotFoundException("User not found");
    if (roles.length !== new Set(roleIds).size)
      throw new BadRequestException("One or more roles do not exist");
    const actorRoles = await this.userRoles.find({
      where: { user: { id: actorId } },
      relations: { role: true },
    });
    if (!actorRoles.some((item) => item.role.code === "super_admin"))
      throw new ConflictException("Only super admins can assign roles");
    const current = await this.userRoles.find({
      where: { user: { id: userId } },
      relations: { role: true },
    });
    const removesSuperAdmin =
      current.some((item) => item.role.code === "super_admin") &&
      !roles.some((role) => role.code === "super_admin");
    if (removesSuperAdmin) {
      const total = await this.userRoles
        .createQueryBuilder("userRole")
        .innerJoin(
          "userRole.role",
          "role",
          "role.code = :code",
          { code: "super_admin" },
        )
        .getCount();
      if (total <= 1)
        throw new ConflictException(
          "The last super admin role cannot be removed",
        );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRole, { user: { id: userId } });
      if (roles.length)
        await manager.save(
          UserRole,
          roles.map((role) =>
            manager.create(UserRole, { user, role, assignedBy: actor }),
          ),
        );
      await this.audit(
        manager,
        actorId,
        "users.assign_roles",
        "user",
        userId,
        null,
        { roleIds },
      );
    });
    return { ...user, roles };
  }

  private async resolvePermissions(permissionIds: string[]) {
    const uniqueIds = [...new Set(permissionIds)];
    const permissions = uniqueIds.length
      ? await this.permissions.findBy({ id: In(uniqueIds) })
      : [];
    if (permissions.length !== uniqueIds.length)
      throw new BadRequestException("One or more permissions do not exist");
    return permissions;
  }

  private async resolveRoles(roleIds: string[]) {
    const uniqueIds = [...new Set(roleIds)];
    const roles = uniqueIds.length
      ? await this.roles.findBy({ id: In(uniqueIds) })
      : [];
    if (roles.length !== uniqueIds.length)
      throw new BadRequestException("One or more roles do not exist");
    return roles;
  }

  private cocktailSnapshot(cocktail: Cocktail) {
    return {
      zh: cocktail.zh,
      en: cocktail.en,
      spirit: cocktail.spirit,
      categoryId: cocktail.category?.id,
      abv: cocktail.abv,
      story: cocktail.story,
      tags: cocktail.tags,
      images: cocktail.images,
    };
  }

  private async audit(
    manager: any,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    before: object | null,
    after: object | null,
  ) {
    const actor = await manager.findOneBy(User, { id: actorId });
    await manager.save(
      AdminAuditLog,
      manager.create(AdminAuditLog, {
        actor,
        action,
        targetType,
        targetId,
        before,
        after,
      }),
    );
  }

  private async invalidateCocktailCache() {
    await Promise.all([
      this.redis.del("list:v1:*"),
      this.redis.del("list:v2:*"),
      this.redis.del("list:v3:*"),
      this.redis.del("rec:v1:*"),
      this.redis.del("daily-recommendations:v1:*"),
    ]);
  }
}
