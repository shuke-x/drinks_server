import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import type { ImagePurpose } from "../storage.provider";

export class UploadImageQueryDto {
  @ApiPropertyOptional({
    enum: ["avatar", "cocktail"],
    default: "cocktail",
    description: "头像会裁剪为 512×512；酒单图片最长边会压缩至 2048",
  })
  @IsOptional()
  @IsIn(["avatar", "cocktail"])
  purpose?: ImagePurpose;
}
