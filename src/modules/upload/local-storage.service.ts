import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import { StorageProvider } from "./storage.provider";
import { inspectImageFile } from "./image-file.validator";
@Injectable()
export class LocalStorageService implements StorageProvider {
  constructor(private readonly config: ConfigService) {}
  async save(file: Express.Multer.File) {
    await fs.mkdir(join(process.cwd(), "uploads"), { recursive: true });
    const { extension } = inspectImageFile(file);
    const name = `${nanoid(16)}${extension}`;
    await fs.writeFile(join(process.cwd(), "uploads", name), file.buffer);
    return `${this.config.get("PUBLIC_BASE_URL", "http://localhost:3000")}/static/${name}`;
  }
}
