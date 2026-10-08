import type { NextFunction, Request, Response } from "express";
import { csrfMatches, readCookie, CSRF_COOKIE, REFRESH_COOKIE, wantsCookieSession } from "../../modules/auth/cookie-session";

type CsrfValidator = (token: string, refreshToken?: string) => Promise<boolean>;

export function cookieSessionSecurity(enabled: boolean, allowedOrigins: string[], validCsrf: CsrfValidator) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!enabled || ["GET", "HEAD", "OPTIONS"].includes(request.method) || !wantsCookieSession(request)) return next();
    // A Bearer header must never bypass protection when ambient cookies are present.
    const reject = (message: string) => response.status(403).json({ code: 403, message, data: null });
    if (!request.headers.origin || !allowedOrigins.includes(request.headers.origin)) return reject("Invalid request origin");
    if (!csrfMatches(request)) return reject("Invalid CSRF token");
    // Login/register verify the stored challenge binding before consuming credentials.
    if (/^\/api\/v1\/auth\/(login|register)\/?$/.test(request.path)) return next();
    try {
      if (!await validCsrf(readCookie(request, CSRF_COOKIE)!, readCookie(request, REFRESH_COOKIE))) return reject("Invalid CSRF binding");
      return next();
    } catch (error) { return next(error); }
  };
}
