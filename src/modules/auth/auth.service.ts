import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
  constants,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  randomBytes,
  randomInt,
  randomUUID,
} from "crypto";
import { Repository } from "typeorm";
import { RedisService } from "../redis/redis.service";
import {
  User,
  UserAccountSource,
  UserStatus,
} from "../users/entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { UserRole } from "../admin/entities/user-role.entity";
import { RolePermission } from "../admin/entities/role-permission.entity";
import { hashPassword, verifyPasswordHash } from "./password-hash.util";

type Challenge = { nonce: string; expiresAt: string };
type Credentials = {
  email: string;
  password: string;
  name?: string;
  code?: string;
};
type JwtPayload = { sub: string; email: string; exp: number; type: "access" };
const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

@Injectable()
export class AuthService {
  private readonly privateKey;
  private readonly publicKey: string;
  private readonly jwtSecret: string;
  private readonly accessTtl = 15 * 60;
  private readonly refreshDays: number;
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
  ) {
    const pem = config
      .get<string>("AUTH_RSA_PRIVATE_KEY")
      ?.replace(/\\n/g, "\n");
    if (!pem) throw new Error("AUTH_RSA_PRIVATE_KEY must be configured");
    this.privateKey = createPrivateKey(pem);
    this.publicKey = createPublicKey(this.privateKey)
      .export({ type: "spki", format: "pem" })
      .toString();
    this.jwtSecret =
      config.get<string>("AUTH_JWT_SECRET") ||
      (() => {
        throw new Error("AUTH_JWT_SECRET must be configured");
      })();
    this.refreshDays = Math.min(
      30,
      Math.max(7, Number(config.get("AUTH_REFRESH_DAYS", 30))),
    );
  }
  async createChallenge() {
    const challengeId = randomUUID(),
      nonce = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 120000);
    await this.redis.withTTL(
      `auth:challenge:${challengeId}`,
      { nonce, expiresAt: expiresAt.toISOString() },
      120,
    );
    return {
      challengeId,
      publicKey: this.publicKey,
      nonce,
      expiresAt: expiresAt.toISOString(),
    };
  }
  async sendRegistrationCode(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Enter a valid email address");
    }
    const resendKey = this.config.get<string>("RESEND_API_KEY")?.trim();
    const from = this.config.get<string>("AUTH_EMAIL_FROM")?.trim();
    if (!resendKey || !from) {
      throw new ServiceUnavailableException("Email delivery is not configured");
    }
    if (await this.users.exists({ where: { email } })) {
      throw new ConflictException("Email is already registered");
    }

    const emailHash = this.hash(email);
    const cooldownKey = `auth:registration-code:cooldown:${emailHash}`;
    if (!(await this.redis.setIfAbsent(cooldownKey, true, 60))) {
      throw new HttpException("Wait before requesting another code", HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeKey = `auth:registration-code:${emailHash}`;
    await this.redis.withTTL(
      codeKey,
      { digest: this.registrationCodeDigest(email, code) },
      600,
    );

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Your Tonight Drinks registration code",
          text: `Your registration code is ${code}. It expires in 10 minutes.`,
          html: `<p>Your Tonight Drinks registration code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request it, ignore this email.</p>`,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Email provider rejected the request");
    } catch {
      await this.redis.del(codeKey);
      await this.redis.del(cooldownKey);
      throw new ServiceUnavailableException("Email could not be sent. Try again later.");
    }
    return { sent: true };
  }

  private async consumeRegistrationCode(email: string, code: string | undefined) {
    if (!code || !/^\d{6}$/.test(code)) {
      throw new BadRequestException("Enter the 6-digit email code");
    }
    const emailHash = this.hash(email);
    const attemptsKey = `auth:registration-code:attempts:${emailHash}`;
    const attempts = await this.redis.incrementWithTTL(attemptsKey, 600);
    if (attempts.count > 5) {
      throw new HttpException("Too many code attempts. Request a new code.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const accepted = await this.redis.consumeMatchingHash(
      `auth:registration-code:${emailHash}`,
      this.registrationCodeDigest(email, code),
    );
    if (!accepted) {
      throw new BadRequestException("Email code is invalid or expired");
    }
    await this.redis.del(attemptsKey);
  }

  private registrationCodeDigest(email: string, code: string) {
    return createHmac("sha256", this.jwtSecret)
      .update(`${email}:${code}`)
      .digest("hex");
  }

  async register(challengeId: string, ciphertext: string) {
    const payload = await this.consumeCredentials(challengeId, ciphertext);
    const email = payload.email.trim().toLowerCase();
    if (await this.users.exists({ where: { email } }))
      throw new ConflictException("Email is already registered");
    this.assertPassword(payload.password);
    await this.consumeRegistrationCode(email, payload.code);
    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await hashPassword(payload.password),
        name: payload.name?.trim() || email.split("@")[0],
        avatarUrl: null,
        accountSource: UserAccountSource.APP,
      }),
    );
    return this.issueTokens(user);
  }
  async login(challengeId: string, ciphertext: string) {
    const payload = await this.consumeCredentials(challengeId, ciphertext);
    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.email = :email", {
        email: payload.email.trim().toLowerCase(),
      })
      .getOne();
    if (!user || !(await verifyPasswordHash(user.passwordHash, payload.password)))
      throw new UnauthorizedException("Invalid email or password");
    if (user.status === UserStatus.DISABLED)
      throw new UnauthorizedException("User account is disabled");
    return this.issueTokens(user);
  }
  async refresh(raw: string) {
    const hash = this.hash(raw);
    const record = await this.refreshTokens.findOne({
      where: { tokenHash: hash },
      relations: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt <= new Date())
      throw new UnauthorizedException("Refresh token is invalid or expired");
    if (record.user.status === UserStatus.DISABLED)
      throw new UnauthorizedException("User account is disabled");
    record.revokedAt = new Date();
    await this.refreshTokens.save(record);
    return this.issueTokens(record.user);
  }
  async logout(raw: string) {
    const record = await this.refreshTokens.findOne({
      where: { tokenHash: this.hash(raw) },
    });
    if (record && !record.revokedAt) {
      record.revokedAt = new Date();
      await this.refreshTokens.save(record);
    }
  }
  async me(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || user.status === UserStatus.DISABLED)
      throw new UnauthorizedException("User account is disabled");
    const assignments = await this.userRoles.find({
      where: { user: { id: userId } },
      relations: { role: true },
    });
    const roles = assignments.map((assignment) => assignment.role);
    const roleIds = roles.map((role) => role.id);
    const pairs = roleIds.length
      ? await this.rolePermissions
          .createQueryBuilder("rolePermission")
          .leftJoinAndSelect("rolePermission.permission", "permission")
          .where("rolePermission.roleId IN (:...roleIds)", { roleIds })
          .getMany()
      : [];
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        language: user.language,
        status: user.status,
        roles,
      },
      permissions: [...new Set(pairs.map((pair) => pair.permission.code))],
    };
  }
  verifyAccess(token: string): JwtPayload {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature)
      throw new UnauthorizedException("Invalid access token");
    const expected = base64url(
      createHmac("sha256", this.jwtSecret).update(`${header}.${body}`).digest(),
    );
    if (
      signature.length !== expected.length ||
      !timingSafeEqualText(signature, expected)
    )
      throw new UnauthorizedException("Invalid access token");
    let payload: JwtPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
    if (
      payload.type !== "access" ||
      !payload.sub ||
      payload.exp <= Math.floor(Date.now() / 1000)
    )
      throw new UnauthorizedException("Access token expired");
    return payload;
  }
  private async consumeCredentials(
    challengeId: string,
    ciphertext: string,
  ): Promise<Credentials> {
    const challenge = await this.redis.take<Challenge>(
      `auth:challenge:${challengeId}`,
    );
    if (!challenge || new Date(challenge.expiresAt) <= new Date())
      throw new UnauthorizedException("Challenge is invalid or expired");
    let decoded: Credentials;
    try {
      decoded = JSON.parse(
        privateDecrypt(
          {
            key: this.privateKey,
            oaepHash: "sha256",
            padding: constants.RSA_PKCS1_OAEP_PADDING,
          },
          Buffer.from(ciphertext, "base64"),
        ).toString("utf8"),
      );
    } catch {
      throw new BadRequestException("Ciphertext cannot be decrypted");
    }
    if (
      !decoded ||
      typeof decoded.email !== "string" ||
      !decoded.email.trim() ||
      typeof decoded.password !== "string" ||
      !decoded.password
    )
      throw new BadRequestException(
        "Decrypted credentials must include email and password",
      );
    return decoded;
  }
  private async issueTokens(user: User) {
    const now = Math.floor(Date.now() / 1000);
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      exp: now + this.accessTtl,
      type: "access",
    };
    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = base64url(JSON.stringify(accessPayload));
    const accessToken = `${header}.${body}.${base64url(createHmac("sha256", this.jwtSecret).update(`${header}.${body}`).digest())}`;
    const refreshToken = randomBytes(48).toString("base64url");
    await this.refreshTokens.save(
      this.refreshTokens.create({
        tokenHash: this.hash(refreshToken),
        user,
        expiresAt: new Date(Date.now() + this.refreshDays * 86400000),
        revokedAt: null,
      }),
    );
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }
  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  private assertPassword(password: string) {
    if (
      !/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,}$/.test(
        password,
      )
    )
      throw new BadRequestException(
        "Password must be 8+ characters with uppercase, lowercase, number and punctuation",
      );
  }
}
function timingSafeEqualText(a: string, b: string) {
  return createHash("sha256")
    .update(a)
    .digest()
    .equals(createHash("sha256").update(b).digest());
}
