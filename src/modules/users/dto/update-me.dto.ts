import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, Length, Matches } from "class-validator";
export class UpdateMeDto {
  @ApiPropertyOptional({ example: "Shuke", maxLength: 64 })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;
  @ApiPropertyOptional({
    example: "https://example.com/avatar.png",
    maxLength: 2048,
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  avatarUrl?: string;
  @ApiPropertyOptional({
    example: "zh-CN",
    maxLength: 16,
    nullable: true,
    description: "可选语言标签，例如 zh、zh-CN、zh-Hant 或 en-US。",
  })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, {
    message: "language must be a valid language tag",
  })
  language?: string | null;
}
