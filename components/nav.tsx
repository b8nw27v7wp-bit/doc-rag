'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '文档库' },
  { href: '/chat', label: '问答' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-6 text-[13px]">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'font-medium text-[#1d1d1f]'
                : 'text-[#86868b] transition-colors hover:text-[#1d1d1f]'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}