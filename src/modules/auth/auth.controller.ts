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
import { RegistrationCodeDto } from "./dto/registration-code.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RedisRateLimitGuard } from "../../common/security/redis-rate-limit.guard";
import { AccessTokenGuard } from "./access-token.guard";
import { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { ACCESS_COOKIE, CSRF_COOKIE, readCookie, REFRESH_COOKIE, wantsCookieSession } from "./cookie-session";

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
      "响应 data 包含 challengeId、PEM publicKey、nonce 与 expiresAt；挑战有效期为 2 分钟。Cookie 模式需 X-Auth-Mode: cookie，会签发 backbar_csrf。",
  })
  async challenge(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieMode = this.cookieEnabled() && wantsCookieSession(request);
    const { csrfToken, ...challenge } = await this.auth.createChallenge(cookieMode, cookieMode ? readCookie(request, REFRESH_COOKIE) : undefined);
    response.setHeader("Cache-Control", "no-store");
    if (csrfToken) response.cookie(CSRF_COOKIE, csrfToken, { ...this.cookieOptions(), httpOnly: false, maxAge: this.refreshMaxAge() });
    return challenge;
  }

  @Post("registration-code")
  @RateLimit({ scope: "auth-registration-code", limit: 10, windowSeconds: 15 * 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "发送注册邮箱验证码" })
  @ApiBody({ type: RegistrationCodeDto })
  @ApiOkResponse({ description: "验证码已发送到注册邮箱。" })
  registrationCode(@Body() dto: RegistrationCodeDto) {
    return this.auth.sendRegistrationCode(dto.email);
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
    description: "Bearer 模式返回 accessToken、refreshToken、expiresIn；Cookie 模式仅返回 expiresIn，通过 Set-Cookie 建立会话。",
  })
  async register(@Body() dto: EncryptedAuthDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieMode = this.cookieEnabled() && wantsCookieSession(request);
    const tokens = await this.auth.register(dto.challengeId, dto.ciphertext, cookieMode ? readCookie(request, CSRF_COOKIE) : undefined);
    return this.deliverTokens(response, tokens, cookieMode);
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
    description: "Bearer 模式返回 accessToken、refreshToken、expiresIn；Cookie 模式仅返回 expiresIn，通过 Set-Cookie 建立会话。",
  })
  async login(@Body() dto: EncryptedAuthDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieMode = this.cookieEnabled() && wantsCookieSession(request);
    const tokens = await this.auth.login(dto.challengeId, dto.ciphertext, cookieMode ? readCookie(request, CSRF_COOKIE) : undefined);
    return this.deliverTokens(response, tokens, cookieMode);
  }

  @Post("refresh")
  @RateLimit({ scope: "auth-refresh", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({
    description: "旧 refreshToken 会被撤销；Bearer 模式返回新 token 对，Cookie 模式从 Cookie 读取并轮换，不需要 JSON 请求体。",
  })
  async refresh(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieMode = this.cookieEnabled() && wantsCookieSession(request);
    const raw = cookieMode ? readCookie(request, REFRESH_COOKIE) : dto?.refreshToken;
    if (!raw) throw new UnauthorizedException("Refresh token is required");
    const tokens = await this.auth.refresh(raw);
    return this.deliverTokens(response, tokens, cookieMode);
  }

  @Post("logout")
  @RateLimit({ scope: "auth-logout", limit: 30, windowSeconds: 60 })
  @UseGuards(RedisRateLimitGuard)
  @ApiOperation({ summary: "注销并撤销刷新令牌" })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: "响应 data 为 { success: true }。" })
  async logout(@Body() dto: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookieMode = this.cookieEnabled() && wantsCookieSession(request);
    const raw = cookieMode ? readCookie(request, REFRESH_COOKIE) : dto?.refreshToken;
    if (raw) await this.auth.logout(raw);
    response.setHeader("Cache-Control", "no-store");
    if (cookieMode) {
      response.clearCookie(ACCESS_COOKIE, { ...this.cookieOptions(), httpOnly: true });
      response.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), httpOnly: true });
      response.clearCookie(CSRF_COOKIE, { ...this.cookieOptions(), httpOnly: false });
    }
    return { success: true };
  }

  private cookieEnabled() { return this.auth.cookieEnabled(); }
  private cookieOptions() {
    const configured = this.config.get("AUTH_COOKIE_SAME_SITE", "strict");
    const sameSite = configured === "none" ? "none" as const : configured === "lax" ? "lax" as const : "strict" as const;
    return { secure: this.config.get("NODE_ENV", "development") === "production" || sameSite === "none", sameSite, path: "/" };
  }
  private refreshMaxAge() { return Math.min(30, Math.max(7, Number(this.config.get("AUTH_REFRESH_DAYS", 30)))) * 86400000; }
  private deliverTokens(response: Response, tokens: { accessToken: string; refreshToken: string; expiresIn: number }, cookieMode: boolean) {
    response.setHeader("Cache-Control", "no-store");
    if (!cookieMode) return tokens;
    const common = this.cookieOptions();
    response.cookie(ACCESS_COOKIE, tokens.accessToken, { ...common, httpOnly: true, maxAge: tokens.expiresIn * 1000 });
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...common, httpOnly: true, maxAge: this.refreshMaxAge() });
    response.cookie(CSRF_COOKIE, this.auth.sessionCsrf(tokens.refreshToken), { ...common, httpOnly: false, maxAge: this.refreshMaxAge() });
    return { expiresIn: tokens.expiresIn };
  }
}
