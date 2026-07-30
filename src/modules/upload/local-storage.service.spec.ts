import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import sharp from "sharp";
import { LocalStorageService } from "./local-storage.service";

describe("LocalStorageService", () => {
  const config = {
    get: jest.fn().mockReturnValue("https://dash.shuke.me"),
  } as unknown as ConfigService;
  const service = new LocalStorageService(config);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(fs, "mkdir").mockResolvedValue(undefined);
  });

  async function makeFile(
    width: number,
    height: number,
  ): Promise<Express.Multer.File> {
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 80, g: 120, b: 160 },
      },
    })
      .jpeg()
      .toBuffer();

    return { buffer, mimetype: "image/jpeg" } as Express.Multer.File;
  }

  it("converts cocktail images to WebP and limits their longest edge", async () => {
    let written = Buffer.alloc(0);
    jest.spyOn(fs, "writeFile").mockImplementation(async (_, data) => {
      written = Buffer.from(data as Uint8Array);
    });

    const url = await service.save(await makeFile(3000, 1500), {
      purpose: "cocktail",
    });
    const metadata = await sharp(written).metadata();

    expect(url).toMatch(
      /^https:\/\/dash\.shuke\.me\/static\/[A-Za-z0-9_-]{16}\.webp$/,
    );
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(2048);
    expect(metadata.height).toBe(1024);
    expect(metadata.exif).toBeUndefined();
  });

  it("crops avatars to a 512 by 512 WebP image", async () => {
    let written = Buffer.alloc(0);
    jest.spyOn(fs, "writeFile").mockImplementation(async (_, data) => {
      written = Buffer.from(data as Uint8Array);
    });

    await service.save(await makeFile(1000, 500), { purpose: "avatar" });
    const metadata = await sharp(written).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });
});
