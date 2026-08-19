import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import Nav from '@/components/nav';
import { LocaleProvider } from '@/components/locale';

export const metadata: Metadata = {
  title: 'DocRAG · 本地文档问答',
  description:
    '本地优先的 AI 文档问答：文档解析、嵌入、向量检索全部在本机完成，数据不出设备。BYOK 接入任意 OpenAI 兼容模型。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-white text-[#1d1d1f] antialiased">
        <LocaleProvider>
          <header className="sticky top-0 z-10 border-b border-[#f0f0f2] bg-white/85 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
              <Link href="/" className="text-[15px] font-semibold tracking-tight">
                DocRAG
              </Link>
              <Nav />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl px-5 pb-24">{children}</main>
        </LocaleProvider>
      </body>
    </html>
  );
}