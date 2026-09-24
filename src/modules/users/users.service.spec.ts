import { ConflictException, NotFoundException } from "@nestjs/common";
import { UsersService } from "./users.service";

describe("UsersService.removeMe", () => {
  const manager = {
    query: jest.fn(),
    delete: jest.fn(),
  };
  const users = {
    findOneBy: jest.fn(),
    find: jest.fn(),
    manager: {
      transaction: jest.fn((callback) => callback(manager)),
    },
  };
  const cocktails = { find: jest.fn(), findAndCount: jest.fn() };
  const revisions = { find: jest.fn() };
  const userRoles = { exists: jest.fn() };
  const uploadAssets = { find: jest.fn() };
  const storage = { remove: jest.fn() };
  const redis = { del: jest.fn() };
  const service = new UsersService(
    users as never,
    {} as never,
    cocktails as never,
    revisions as never,
    userRoles as never,
    uploadAssets as never,
    storage as never,
    redis as never,
    {assertOwned:jest.fn().mockResolvedValue(undefined)} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    cocktails.find.mockResolvedValue([]);
    users.find.mockResolvedValue([]);
    revisions.find.mockResolvedValue([]);
    uploadAssets.find.mockResolvedValue([]);
    storage.remove.mockResolvedValue(undefined);
    redis.del.mockResolvedValue(undefined);
    manager.query.mockResolvedValue([]);
    manager.delete.mockResolvedValue({ affected: 1 });
  });

  it("deletes a regular user", async () => {
    users.findOneBy.mockResolvedValue({ id: "user-1" });
    userRoles.exists.mockResolvedValue(false);

    await expect(service.removeMe("user-1")).resolves.toEqual({
      success: true,
    });
    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      `DELETE FROM "cocktails" WHERE "ownerId" = $1 AND "isPrivate" = true`,
      ["user-1"],
    );
    expect(manager.delete).toHaveBeenCalledWith(expect.any(Function), {
      id: "user-1",
    });
  });

  it("rejects a missing user", async () => {
    users.findOneBy.mockResolvedValue(null);

    await expect(service.removeMe("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(users.manager.transaction).not.toHaveBeenCalled();
  });

  it("prevents a super administrator from deleting itself", async () => {
    users.findOneBy.mockResolvedValue({ id: "admin-1" });
    userRoles.exists.mockResolvedValue(true);

    await expect(service.removeMe("admin-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(users.manager.transaction).not.toHaveBeenCalled();
  });

  it("allows the admin workflow to delete another super administrator", async () => {
    users.findOneBy.mockResolvedValue({ id: "admin-2", avatarUrl: null });
    userRoles.exists.mockResolvedValue(true);

    await expect(service.removeByAdmin("admin-2")).resolves.toEqual({
      success: true,
    });
    expect(manager.delete).toHaveBeenCalledWith(expect.any(Function), {
      id: "admin-2",
    });
  });

  it("paginates and filters cocktails created by the current user", async () => {
    cocktails.findAndCount.mockResolvedValue([
      [
        {
          id: "draft-1",
          spirit: "gin",
          category: { name: "金酒" },
          status: "draft",
        },
      ],
      3,
    ]);
    revisions.find.mockResolvedValue([]);

    const result: any = await service.myCocktails("user-1", {
      page: 2,
      limit: 1,
      status: "draft" as any,
    });

    expect(cocktails.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 1 }),
    );
    expect(result.meta).toEqual({ page: 2, limit: 1, total: 3 });
    expect(result.data[0].base).toBe("金酒");
  });

  it("removes images used only by private cocktails", async () => {
    users.findOneBy.mockResolvedValue({
      id: "user-1",
      avatarUrl: "https://example.com/static/avatar.jpg",
    });
    userRoles.exists.mockResolvedValue(false);
    cocktails.find
      .mockResolvedValueOnce([
        {
          id: "private-1",
          images: [
            "https://example.com/static/private.jpg",
            "https://example.com/static/shared.jpg",
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "public-1",
          images: ["https://example.com/static/shared.jpg"],
        },
      ]);
    revisions.find.mockResolvedValue([
      {
        content: { images: ["https://example.com/static/revision.jpg"] },
      },
    ]);
    uploadAssets.find.mockResolvedValue([
      { url: "https://example.com/static/unbound.jpg" },
    ]);

    await service.removeMe("user-1");

    expect(storage.remove).toHaveBeenCalledWith(
      "https://example.com/static/avatar.jpg",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "https://example.com/static/private.jpg",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "https://example.com/static/revision.jpg",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "https://example.com/static/unbound.jpg",
    );
    expect(storage.remove).not.toHaveBeenCalledWith(
      "https://example.com/static/shared.jpg",
    );
  });
});
