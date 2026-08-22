/** 可选密码门：配置 APP_PASSWORD 环境变量后启用，否则完全开放 */
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, authCookieValue, authEnabled, verifyPassword } from '@/lib/auth';
import { createRateLimiter, clientIpKey, isSecureRequest } from '@/lib/rateLimit';

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  if (!limiter.tryAcquire(clientIpKey(req))) {
    return NextResponse.json({ ok: false, error: '尝试过于频繁，请稍后再试' }, { status: 429 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!authEnabled()) return Response.json({ ok: true }); // 未启用密码门
  if (!verifyPassword(body.password)) {
    return Response.json({ ok: false, error: '密码错误' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, authCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}