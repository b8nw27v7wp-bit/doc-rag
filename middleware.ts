/** 可选密码门中间件：设置 APP_PASSWORD 后保护全部页面（API 除外） */
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/lock')) {
    return NextResponse.next();
  }
  if (req.cookies.get('docrag_auth')?.value === '1') return NextResponse.next();
  const url = new URL('/lock', req.url);
  if (pathname !== '/') url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};