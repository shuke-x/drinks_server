import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
export class RefreshDto {
  @ApiPropertyOptional({ description: "Bearer 模式的 refreshToken；Cookie 模式省略请求体" })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
