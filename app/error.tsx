'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-[22px] font-semibold tracking-tight">出错了</h1>
      <p className="max-w-sm text-[13px] leading-relaxed text-[#86868b]">
        页面加载出现异常，请重试；若持续失败，可尝试重启服务。
      </p>
      <button
        onClick={reset}
        className="rounded-xl bg-[#1d1d1f] px-6 py-2.5 text-[13px] font-medium text-white hover:opacity-85"
      >
        重试
      </button>
    </div>
  );
}