import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
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
import { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { ACCESS_COOKIE, CSRF_COOKIE, readCookie, REFRESH_COOKIE } from "./cookie-session";

type AuthRequest = Request & { authUser: { id: string } };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

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
  async register(@Body() dto: EncryptedAuthDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.register(dto.challengeId, dto.ciphertext);
    this.writeCookies(response, tokens);
    return tokens;
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
  async login(@Body() dto: EncryptedAuthDto, @Res({ passthrough: true }) response: Response) {
    const tokens = await this.auth.login(dto.challengeId, dto.ciphertext);
    this.writeCookies(response, tokens);
    return tokens;
  }

  @Post("refresh")
  @RateLimit({ scope: "auth-refresh", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({
    description: "旧 refreshToken 会被撤销；响应 data 返回新的 token 对。",
  })
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const raw = readCookie(request, REFRESH_COOKIE) ?? dto.refreshToken;
    if (!raw) throw new UnauthorizedException("Refresh token is required");
    const tokens = await this.auth.refresh(raw);
    this.writeCookies(response, tokens);
    return tokens;
  }

  @Post("logout")
  @RateLimit({ scope: "auth-logout", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "注销并撤销刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: "响应 data 为 { success: true }。" })
  async logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const raw = readCookie(request, REFRESH_COOKIE) ?? dto.refreshToken;
    if (raw) await this.auth.logout(raw);
    if (this.cookieEnabled()) {
      response.clearCookie(ACCESS_COOKIE, { path: "/" });
      response.clearCookie(REFRESH_COOKIE, { path: "/" });
      response.clearCookie(CSRF_COOKIE, { path: "/" });
    }
    return { success: true };
  }

  private cookieEnabled() { return this.config.get("AUTH_COOKIE_ENABLED", "false") === "true"; }
  private writeCookies(response: Response, tokens: { accessToken: string; refreshToken: string; expiresIn: number }) {
    if (!this.cookieEnabled()) return;
    const secure = this.config.get("NODE_ENV", "development") === "production";
    const configuredSameSite = this.config.get("AUTH_COOKIE_SAME_SITE", "lax");
    const sameSite = configuredSameSite === "none" ? "none" as const : configuredSameSite === "strict" ? "strict" as const : "lax" as const;
    const common = { secure, sameSite, path: "/" };
    response.cookie(ACCESS_COOKIE, tokens.accessToken, { ...common, httpOnly: true, maxAge: tokens.expiresIn * 1000 });
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...common, httpOnly: true, maxAge: Number(this.config.get("AUTH_REFRESH_DAYS", 30)) * 86400000 });
    response.cookie(CSRF_COOKIE, randomBytes(32).toString("base64url"), { ...common, httpOnly: false, maxAge: Number(this.config.get("AUTH_REFRESH_DAYS", 30)) * 86400000 });
  }
}
