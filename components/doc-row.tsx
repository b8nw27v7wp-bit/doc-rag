'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface DocView {
  id: number;
  name: string;
  ext: string;
  size: number;
  charCount: number;
  chunkCount: number;
  createdAt: string;
}

export default function DocRow({ doc }: { doc: DocView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/documents?id=${doc.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="group flex items-center gap-3 py-3">
      <span className="w-12 shrink-0 rounded-md bg-[#f5f5f7] py-1 text-center text-[11px] uppercase tracking-wide text-[#86868b]">
        {doc.ext}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{doc.name}</p>
        <p className="text-[12px] text-[#86868b]">
          {(doc.size / 1024).toFixed(1)} KB · {doc.chunkCount} 块 · {doc.charCount.toLocaleString()} 字 · {doc.createdAt}
        </p>
      </div>
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] opacity-0 transition-opacity hover:bg-[#f5f5f7] hover:text-[#d93025] group-hover:opacity-100 disabled:opacity-30"
        title="删除该文档及其向量块"
      >
        删除
      </button>
    </li>
  );
}