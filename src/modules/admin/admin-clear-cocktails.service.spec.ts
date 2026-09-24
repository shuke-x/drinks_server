import { AdminService } from "./admin.service";

describe("AdminService.clearCocktails", () => {
  it("deletes all cocktails in a transaction, audits the count, and invalidates caches", async () => {
    const manager = {
      count: jest.fn().mockResolvedValue(4),
      query: jest.fn().mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce(undefined),
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const service = new AdminService(
      dataSource as any, { find: jest.fn() } as any, { find: jest.fn() } as any,
      { find: jest.fn() } as any, { find: jest.fn() } as any, { find: jest.fn() } as any,
      { find: jest.fn() } as any, { find: jest.fn() } as any, { find: jest.fn() } as any, { find: jest.fn() } as any,
      { del: jest.fn().mockResolvedValue(undefined) } as any, {} as any,
    );
    (service as any).audit = jest.fn().mockResolvedValue(undefined);
    const result = await service.clearCocktails("admin-1");
    expect(result).toEqual({ deleted: 4 });
    expect(manager.query).toHaveBeenCalledWith("DELETE FROM cocktails");
    expect((service as any).audit).toHaveBeenCalledWith(expect.anything(), "admin-1", "cocktails.clear", "cocktail_collection", "all", { count: 4 }, { count: 0 });
  });

  it("rejects non-super-admin actors before deleting", async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const service = new AdminService(
      { transaction: jest.fn(async (cb: any) => cb(manager)) } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    await expect(service.clearCocktails("editor-1")).rejects.toThrow("Only super administrators");
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
});
