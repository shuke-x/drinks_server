import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
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
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
import { AccessTokenGuard } from "./access-token.guard";
import { Request } from "express";

type AuthRequest = Request & { authUser: { id: string } };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("challenge")
  @RateLimit({ scope: "auth-challenge", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "获取一次性登录/注册挑战" })
  @ApiOkResponse({
    description:
      "响应 data 包含 challengeId、PEM publicKey、nonce 与 expiresAt；挑战有效期为 2 分钟。",
  })
  challenge() {
    return this.auth.createChallenge();
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthRequest) {
    return this.auth.me(request.authUser.id);
  }

  @Post("register")
  @RateLimit({ scope: "auth-register", limit: 5, windowSeconds: 15 * 60 })
  @UseGuards(RedisRateLimitGuard)
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
  @RateLimit({ scope: "auth-login", limit: 10, windowSeconds: 15 * 60 })
  @UseGuards(RedisRateLimitGuard)
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
  @RateLimit({ scope: "auth-refresh", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({
    description: "旧 refreshToken 会被撤销；响应 data 返回新的 token 对。",
  })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  @RateLimit({ scope: "auth-logout", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "注销并撤销刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: "响应 data 为 { success: true }。" })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { success: true };
  }
}
