import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
export class RefreshDto {
  @ApiProperty({ description: "登录或注册接口返回的 refreshToken" })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken!: string;
}
