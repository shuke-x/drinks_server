import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Options as MulterOptions } from "multer";
import { STORAGE, StorageProvider } from "./storage.provider";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
@ApiTags("upload")
@ApiBearerAuth("access-token")
@Controller("upload")
export class UploadController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}
  @Post("image")
  @RateLimit({
    scope: "upload-image",
    limit: 20,
    windowSeconds: 60 * 60,
    byUser: true,
  })
  @UseGuards(AccessTokenGuard, RedisRateLimitGuard)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 0,
        parts: 1,
        fieldNestingDepth: 0,
      } as MulterOptions["limits"] & { fieldNestingDepth: number },
      fileFilter: (_, file, cb) => {
        const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
        cb(
          ok ? null : new BadRequestException("Only jpg/png/webp allowed"),
          ok,
        );
      },
    }),
  )
  async image(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("file is required");
    return { url: await this.storage.save(file) };
  }
}
