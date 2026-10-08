import { timingSafeEqual } from "crypto";
import type { Request } from "express";

export const ACCESS_COOKIE = "backbar_access";
export const REFRESH_COOKIE = "backbar_refresh";
export const CSRF_COOKIE = "backbar_csrf";

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

export function csrfMatches(request: Request): boolean {
  const cookie = readCookie(request, CSRF_COOKIE);
  const header = request.headers["x-csrf-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!cookie || typeof token !== "string" || cookie.length > 256 || token.length > 256) return false;
  const a = Buffer.from(cookie); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Explicit opt-in for bootstrap; existing browser cookies keep subsequent requests in cookie mode. */
export function wantsCookieSession(request: Request): boolean {
  return request.headers["x-auth-mode"] === "cookie" || Boolean(
    readCookie(request, ACCESS_COOKIE) || readCookie(request, REFRESH_COOKIE) || readCookie(request, CSRF_COOKIE),
  );
}
