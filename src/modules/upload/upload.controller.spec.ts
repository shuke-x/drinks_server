import { UploadController } from "./upload.controller";

describe("UploadController", () => {
  const storage = {
    save: jest.fn(),
    remove: jest.fn(),
  };
  const assets = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const controller = new UploadController(storage, assets as never);
  const request = { authUser: { id: "user-1", email: "u@example.com" } };
  const file = { buffer: Buffer.from("image") } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.save.mockResolvedValue(
      "https://example.com/static/abcdefghijklmnop.jpg",
    );
    storage.remove.mockResolvedValue(undefined);
    assets.save.mockResolvedValue(undefined);
  });

  it("records the authenticated owner of an uploaded image", async () => {
    await expect(controller.image(request as never, file, {})).resolves.toEqual({
      url: "https://example.com/static/abcdefghijklmnop.jpg",
    });
    expect(storage.save).toHaveBeenCalledWith(file, { purpose: "cocktail" });
    expect(assets.create).toHaveBeenCalledWith({
      url: "https://example.com/static/abcdefghijklmnop.jpg",
      owner: { id: "user-1" },
    });
  });

  it("removes the file when its ownership record cannot be saved", async () => {
    assets.save.mockRejectedValue(new Error("database unavailable"));

    await expect(controller.image(request as never, file, {})).rejects.toThrow(
      "database unavailable",
    );
    expect(storage.remove).toHaveBeenCalledWith(
      "https://example.com/static/abcdefghijklmnop.jpg",
    );
  });

  it("passes the avatar processing purpose to storage", async () => {
    await controller.image(request as never, file, { purpose: "avatar" });

    expect(storage.save).toHaveBeenCalledWith(file, { purpose: "avatar" });
  });
});
