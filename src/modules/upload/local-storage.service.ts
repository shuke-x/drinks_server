import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import { extname, join } from "path";
import { nanoid } from "nanoid";
import { StorageProvider } from "./storage.provider";
@Injectable()
export class LocalStorageService implements StorageProvider {
  constructor(private readonly config: ConfigService) {}
  async save(file: Express.Multer.File) {
    await fs.mkdir(join(process.cwd(), "uploads"), { recursive: true });
    const ext =
      extname(file.originalname).toLowerCase() ||
      `.${file.mimetype.split("/")[1]}`;
    const name = `${nanoid(16)}${ext}`;
    await fs.writeFile(join(process.cwd(), "uploads", name), file.buffer);
    return `${this.config.get("PUBLIC_BASE_URL", "http://localhost:3000")}/static/${name}`;
  }
}
