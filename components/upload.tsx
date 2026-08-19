'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface UploadItem {
  ok: boolean;
  name: string;
  chars?: number;
  chunks?: number;
  skipped?: boolean;
  error?: string;
}

export default function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadItem[]>([]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const form = new FormData();
      for (const f of list) form.append('files', f);
      setBusy(true);
      setResults([]);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const data = await res.json();
        setResults(data.results ?? []);
        router.refresh();
      } catch {
        setResults([{ ok: false, name: '', error: '上传失败，请重试' }]);
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl px-6 py-14 text-center transition-colors ${
          dragging ? 'bg-[#e8f0fe]' : 'bg-[#f5f5f7] hover:bg-[#ebebee]'
        }`}
      >
        <p className="text-[15px] font-medium">{busy ? '解析与嵌入中，首次运行需加载模型（约 30 秒）…' : '拖入文件到此处，或点击选择'}</p>
        <p className="text-[12px] text-[#86868b]">支持 txt / md / pdf / docx，可多选。解析与向量化全部在本机完成。</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.pdf,.docx"
          className="hidden"
          onChange={(e) => void upload(e.target.files ?? [])}
        />
      </div>

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-[#f0f0f2] rounded-xl bg-white text-[13px]">
          {results.map((r, i) => (
            <li key={i} className="flex items-center justify-between px-3 py-2.5">
              <span className="truncate pr-4">{r.name || '请求'}</span>
              {r.ok ? (
                <span className="shrink-0 text-[#34a853]">
                  已入库 · {r.chunks} 块 · {r.chars} 字
                </span>
              ) : r.skipped ? (
                <span className="shrink-0 text-[#86868b]">{r.error || '已跳过'}</span>
              ) : (
                <span className="shrink-0 text-[#d93025]">{r.error || '失败'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}