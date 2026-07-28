import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl, Length } from "class-validator";
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
}
