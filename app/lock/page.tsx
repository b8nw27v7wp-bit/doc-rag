'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@/components/locale';

function LockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error === '密码错误' ? t('密码错误') : data?.error || t('验证失败'));
        return;
      }
      router.push(searchParams.get('from') || '/');
      router.refresh();
    } catch {
      setError(t('网络错误，请重试'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-[22px] font-semibold tracking-tight">DocRAG</h1>
      <p className="text-[13px] text-[#86868b]">{t('此应用启用了访问密码，请输入后继续')}</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder={t('访问密码')}
        autoFocus
        className="h-10 w-64 rounded-xl bg-[#f5f5f7] px-4 text-[14px] outline-none focus:bg-[#ebebee]"
      />
      {error && <p className="text-[13px] text-[#d93025]">{error}</p>}
      <button
        onClick={() => void submit()}
        disabled={busy || !password}
        className="rounded-xl bg-[#1d1d1f] px-6 py-2.5 text-[13px] font-medium text-white hover:opacity-85 disabled:opacity-30"
      >
        {busy ? t('验证中…') : t('进入')}
      </button>
    </div>
  );
}

export default function LockPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LockForm />
    </Suspense>
  );
}