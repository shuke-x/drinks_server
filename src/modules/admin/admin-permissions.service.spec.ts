import { ConflictException } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { AdminAuditLog } from "./entities/audit-log.entity";
import { Permission } from "./entities/permission.entity";
import { Role } from "./entities/role.entity";
import { RolePermission } from "./entities/role-permission.entity";
import { User } from "../users/entities/user.entity";

describe("AdminService permission management", () => {
  const permissionRepository = { exists: jest.fn() };
  const manager = {
    create: jest.fn((target: unknown, data: Record<string, unknown>) => ({
      ...data,
      ...(target === Permission ? { id: "permission-id" } : {}),
    })),
    save: jest.fn(async (targetOrEntity: unknown, entity?: unknown) =>
      entity ?? targetOrEntity,
    ),
    findOneBy: jest.fn(async (target: unknown) => {
      if (target === Role)
        return { id: "super-role-id", code: "super_admin" };
      if (target === User) return { id: "actor-id" };
      return null;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };

  const service = new AdminService(
    dataSource as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    permissionRepository as any,
    null as any,
    null as any,
    null as any,
    null as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    permissionRepository.exists.mockResolvedValue(false);
  });

  it("creates a permission and grants it to super_admin", async () => {
    const result = await service.createPermission("actor-id", {
      code: "recommendations.manage",
      name: "Manage daily recommendations",
    });

    expect(result).toMatchObject({
      id: "permission-id",
      code: "recommendations.manage",
    });
    expect(manager.create).toHaveBeenCalledWith(
      RolePermission,
      expect.objectContaining({
        role: expect.objectContaining({ code: "super_admin" }),
        permission: expect.objectContaining({ id: "permission-id" }),
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      AdminAuditLog,
      expect.objectContaining({ action: "permissions.create" }),
    );
  });

  it("rejects a duplicate permission code", async () => {
    permissionRepository.exists.mockResolvedValue(true);

    await expect(
      service.createPermission("actor-id", {
        code: "recommendations.manage",
        name: "Manage daily recommendations",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
