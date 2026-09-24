import { ForbiddenException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { csrfMatches, readCookie, CSRF_COOKIE, REFRESH_COOKIE, ACCESS_COOKIE } from "../../modules/auth/cookie-session";

export function cookieSessionSecurity(enabled: boolean, allowedOrigins: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!enabled || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    // Native clients using the legacy Bearer transport are not cookie sessions.
    if (/^Bearer\s+/i.test(request.headers.authorization ?? "")) return next();
    const hasSession = Boolean(readCookie(request, ACCESS_COOKIE) || readCookie(request, REFRESH_COOKIE));
    if (!hasSession) return next();
    const origin = request.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) throw new ForbiddenException("Invalid request origin");
    if (!readCookie(request, CSRF_COOKIE) || !csrfMatches(request)) throw new ForbiddenException("Invalid CSRF token");
    return next();
  };
}
