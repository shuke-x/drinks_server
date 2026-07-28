import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";
export class RefreshDto {
  @ApiProperty({ description: "登录或注册接口返回的 refreshToken" })
  @IsString()
  @MaxLength(4096)
  refreshToken!: string;
}
