import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import type { Options as MulterOptions } from "multer";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RequirePermissions } from "./decorators/require-permissions.decorator";
import { PermissionsGuard } from "./guards/permissions.guard";
import {
  createImportTemplate,
  ImportJobsService,
} from "./import-jobs.service";

type AuthRequest = Request & { authUser: { id: string } };

@ApiTags("admin-import-jobs")
@ApiBearerAuth("access-token")
@Controller("admin/import-jobs")
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermissions("imports.manage")
export class ImportJobsController {
  constructor(private readonly imports: ImportJobsService) {}

  @Post()
  @ApiOperation({ summary: "上传 JSON/XLSX 并创建异步酒单导入任务" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
        fields: 2,
        parts: 3,
        fieldNestingDepth: 0,
      } as MulterOptions["limits"] & { fieldNestingDepth: number },
      fileFilter: (_, file, callback) => {
        const accepted =
          /\.(json|xlsx)$/i.test(file.originalname) ||
          file.mimetype === "application/json" ||
          file.mimetype ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        callback(
          accepted
            ? null
            : new BadRequestException("Only .json and .xlsx files are supported"),
          accepted,
        );
      },
    }),
  )
  create(
    @Req() request: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.create(request.authUser.id, file);
  }

  @Get()
  list(@Query() query: PaginationDto) {
    return this.imports.list(query.page, query.limit);
  }

  @Get("template")
  async template() {
    return new StreamableFile(await createImportTemplate(), {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: 'attachment; filename="cocktail-import-template.xlsx"',
    });
  }

  @Get(":id")
  one(@Param("id", ParseUUIDPipe) id: string) {
    return this.imports.one(id);
  }

  @Post(":id/retry")
  retry(@Param("id", ParseUUIDPipe) id: string) {
    return this.imports.retry(id);
  }
}
