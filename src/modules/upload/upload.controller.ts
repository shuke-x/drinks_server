import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { STORAGE, StorageProvider } from "./storage.provider";
@ApiTags("upload")
@Controller("upload")
export class UploadController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}
  @Post("image")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
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
