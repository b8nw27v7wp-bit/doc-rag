'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT, useLocale } from '@/components/locale';

const ITEMS = [
  { href: '/', label: '文档库' },
  { href: '/chat', label: '问答' },
];

export default function Nav() {
  const pathname = usePathname();
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('docrag.dark') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem('docrag.dark', next ? '1' : '0');
    } catch {
      // 忽略
    }
  };

  const toggleLocale = () => setLocale(locale === 'zh' ? 'en' : 'zh');

  return (
    <nav className="flex items-center gap-5 text-[13px]">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active ? 'font-medium text-[#1d1d1f]' : 'text-[#86868b] transition-colors hover:text-[#1d1d1f]'
            }
          >
            {t(item.label)}
          </Link>
        );
      })}
      <button onClick={toggleDark} className="text-[#86868b] transition-colors hover:text-[#1d1d1f]" title={dark ? t('浅色') : t('深色')}>
        {t(dark ? '浅色' : '深色')}
      </button>
      <button onClick={toggleLocale} className="text-[#86868b] transition-colors hover:text-[#1d1d1f]" title="Language">
        {locale === 'zh' ? 'EN' : '中文'}
      </button>
    </nav>
  );
}