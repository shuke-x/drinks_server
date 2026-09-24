import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserStatus } from "../users/entities/user.entity";
import { ACCESS_COOKIE, readCookie } from "./cookie-session";
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService, @InjectRepository(User) private readonly users: Repository<User>) {}
  async canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<Request & { authUser?: { id: string; email: string } }>();
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? readCookie(req, ACCESS_COOKIE);
    if (!token)
      throw new UnauthorizedException("Bearer access token is required");
    const payload = this.auth.verifyAccess(token);
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user || user.status === UserStatus.DISABLED)
      throw new UnauthorizedException("User account is disabled");
    req.authUser = { id: payload.sub, email: payload.email };
    return true;
  }
}
/** Allows anonymous reads/creates, but validates a supplied Bearer token. */
@Injectable()
export class OptionalAccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService, @InjectRepository(User) private readonly users: Repository<User>) {}
  async canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<Request & { authUser?: { id: string; email: string } }>();
    const authorization = req.headers.authorization;
    const cookieToken = readCookie(req, ACCESS_COOKIE);
    if (!authorization && !cookieToken) return true;
    if (!authorization && cookieToken) {
      const payload = this.auth.verifyAccess(cookieToken);
      const user = await this.users.findOneBy({ id: payload.sub });
      if (!user || user.status === UserStatus.DISABLED) throw new UnauthorizedException("User account is disabled");
      req.authUser = { id: payload.sub, email: payload.email };
      return true;
    }
    const token = authorization!.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Invalid Authorization header");
    const payload = this.auth.verifyAccess(token);
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user || user.status === UserStatus.DISABLED)
      throw new UnauthorizedException("User account is disabled");
    req.authUser = { id: payload.sub, email: payload.email };
    return true;
  }
}
