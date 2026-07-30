import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { SaveImageOptions, StorageProvider } from "./storage.provider";
import { inspectImageFile } from "./image-file.validator";
@Injectable()
export class LocalStorageService implements StorageProvider {
  constructor(private readonly config: ConfigService) {}

  async save(file: Express.Multer.File, options: SaveImageOptions = {}) {
    inspectImageFile(file);

    let pipeline = sharp(file.buffer, {
      failOn: "error",
      limitInputPixels: 64_000_000,
    }).rotate();

    if (options.purpose === "avatar") {
      pipeline = pipeline.resize(512, 512, {
        fit: "cover",
        position: "attention",
      });
    } else {
      pipeline = pipeline.resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    let output: Buffer;
    try {
      // Sharp 默认不会把输入图片的 EXIF/GPS 等元数据复制到输出文件。
      output = await pipeline.webp({ quality: 82, effort: 4 }).toBuffer();
    } catch {
      throw new BadRequestException("Invalid or unsupported image data");
    }

    await fs.mkdir(join(process.cwd(), "uploads"), { recursive: true });
    const name = `${nanoid(16)}.webp`;
    await fs.writeFile(join(process.cwd(), "uploads", name), output);
    return `${this.config.get("PUBLIC_BASE_URL", "http://localhost:3000")}/static/${name}`;
  }
  async remove(url: string) {
    const base = new URL(
      this.config.get("PUBLIC_BASE_URL", "http://localhost:3000"),
    );
    let target: URL;
    try {
      target = new URL(url, base);
    } catch {
      return;
    }
    if (target.origin !== base.origin) return;
    const match = target.pathname.match(
      /^\/static\/([A-Za-z0-9_-]{16}\.(?:jpg|png|webp))$/,
    );
    if (!match) return;
    try {
      await fs.unlink(join(process.cwd(), "uploads", match[1]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
