import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { EncryptedAuthDto } from "./dto/encrypted-auth.dto";
import { RefreshDto } from "./dto/refresh.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("challenge")
  @ApiOperation({ summary: "获取一次性登录/注册挑战" })
  @ApiOkResponse({
    description:
      "响应 data 包含 challengeId、PEM publicKey、nonce 与 expiresAt；挑战有效期为 2 分钟。",
  })
  challenge() {
    return this.auth.createChallenge();
  }

  @Post("register")
  @ApiOperation({ summary: "注册并获取令牌" })
  @ApiBody({
    type: EncryptedAuthDto,
    description:
      "明文为 { email, password, name?, code? }，需先以 challenge 公钥加密；code 为后续扩展字段，当前不校验。",
  })
  @ApiCreatedResponse({
    description: "响应 data 包含 accessToken、refreshToken、expiresIn。",
  })
  register(@Body() dto: EncryptedAuthDto) {
    return this.auth.register(dto.challengeId, dto.ciphertext);
  }

  @Post("login")
  @ApiOperation({ summary: "登录并获取令牌" })
  @ApiBody({
    type: EncryptedAuthDto,
    description: "明文为 { email, password }，需先以 challenge 公钥加密。",
  })
  @ApiOkResponse({
    description: "响应 data 包含 accessToken、refreshToken、expiresIn。",
  })
  login(@Body() dto: EncryptedAuthDto) {
    return this.auth.login(dto.challengeId, dto.ciphertext);
  }

  @Post("refresh")
  @ApiOperation({ summary: "刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({
    description: "旧 refreshToken 会被撤销；响应 data 返回新的 token 对。",
  })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  @ApiOperation({ summary: "注销并撤销刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: "响应 data 为 { success: true }。" })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { success: true };
  }
}
