/** 可选密码门：配置 APP_PASSWORD 环境变量后启用，否则完全开放 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const expected = process.env.APP_PASSWORD;
  if (!expected) return Response.json({ ok: true }); // 未启用密码门
  if (!body.password || body.password !== expected) {
    return Response.json({ ok: false, error: '密码错误' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('docrag_auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}