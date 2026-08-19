import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-[42px] font-semibold tracking-tight text-[#1d1d1f]">404</p>
      <p className="text-[13px] text-[#86868b]">页面不存在或已被移除。</p>
      <Link
        href="/"
        className="rounded-xl bg-[#1d1d1f] px-6 py-2.5 text-[13px] font-medium text-white hover:opacity-85"
      >
        返回首页
      </Link>
    </div>
  );
}