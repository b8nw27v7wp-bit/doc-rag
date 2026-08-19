/**
 * 访问密码门鉴权：cookie 由 APP_PASSWORD 单向派生（SHA-256），
 * 无法被伪造；未配置密码时视为开放、一律放行。
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE = 'docrag_auth';

/** 是否启用了访问密码 */
export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/** 由访问密码派生（不可逆）的签名 cookie 值；未启用时返回空串 */
export function authCookieValue(): string {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return '';
  return createHash('sha256').update(`docrag-auth:${pw}`).digest('hex');
}

/** 校验请求携带的 cookie 是否有效（未启用密码时一律放行）；恒定时间比较 */
export function isAuthorized(cookieValue: string | undefined): boolean {
  if (!authEnabled()) return true;
  const expected = authCookieValue();
  if (!cookieValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}