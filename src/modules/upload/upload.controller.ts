import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  Query,
  Req,
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
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UploadAsset } from "./entities/upload-asset.entity";
import { Request } from "express";
import { User } from "../users/entities/user.entity";
import { UploadImageQueryDto } from "./dto/upload-image-query.dto";

type AuthRequest = Request & { authUser: { id: string; email: string } };
@ApiTags("upload")
@ApiBearerAuth("access-token")
@Controller("upload")
export class UploadController {
  constructor(
    @Inject(STORAGE) private readonly storage: StorageProvider,
    @InjectRepository(UploadAsset)
    private readonly assets: Repository<UploadAsset>,
  ) {}
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
        fileSize: 15 * 1024 * 1024,
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
  async image(
    @Req() request: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
    @Query() query: UploadImageQueryDto = {},
  ) {
    if (!file) throw new BadRequestException("file is required");
    const url = await this.storage.save(file, {
      purpose: query.purpose ?? "cocktail",
    });
    try {
      await this.assets.save(
        this.assets.create({
          url,
          owner: { id: request.authUser.id } as User,
        }),
      );
    } catch (error) {
      await this.storage.remove(url).catch(() => undefined);
      throw error;
    }
    return { url };
  }
}
