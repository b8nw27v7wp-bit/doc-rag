/** 可选密码门代理：设置 APP_PASSWORD 后保护页面与全部 API（登录页/登录接口除外） */
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, authEnabled, isAuthorized } from './lib/auth';

export function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  // 登录页、登录接口、健康检查与静态资源放行（健康检查需供容器探活匿名访问）
  if (pathname.startsWith('/_next') || pathname === '/lock' || pathname === '/api/lock' || pathname === '/api/health' || pathname === '/api/openapi') {
    return NextResponse.next();
  }
  if (isAuthorized(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();
  // API 未认证 → 401；页面未认证 → 跳登录
  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }
  const url = new URL('/lock', req.url);
  if (pathname !== '/') url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};