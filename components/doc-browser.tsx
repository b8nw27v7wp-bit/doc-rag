'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface DocItem {
  id: number;
  name: string;
  ext: string;
  size: number;
  charCount: number;
  chunkCount: number;
  createdAt: string;
}

interface SearchResult {
  docId: number;
  docName: string;
  idx: number;
  snippet: string;
}

interface DocContent {
  id: number;
  name: string;
  ext: string;
  size: number;
  charCount: number;
  chunkCount: number;
  text: string;
}

export default function DocBrowser({ docs }: { docs: DocItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [viewing, setViewing] = useState<DocContent | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const allSelected = docs.length > 0 && selected.size === docs.length;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(docs.map((d) => d.id)));
  };

  const remove = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0 || bulkBusy) return;
      setBulkBusy(true);
      try {
        await fetch(`/api/documents?ids=${ids.join(',')}`, { method: 'DELETE' });
        setSelected(new Set());
        router.refresh();
      } finally {
        setBulkBusy(false);
      }
    },
    [bulkBusy, router]
  );

  const view = useCallback(async (id: number) => {
    setViewLoading(true);
    setViewing(null);
    try {
      const res = await fetch(`/api/documents/content?id=${id}`);
      if (!res.ok) throw new Error();
      setViewing((await res.json()) as DocContent);
    } catch {
      setViewing(null);
    } finally {
      setViewLoading(false);
    }
  }, []);

  const search = useCallback(async () => {
    const query = q.trim();
    if (!query) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults((data.results ?? []) as SearchResult[]);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [q]);

  const clearSearch = () => {
    setQ('');
    setResults(null);
  };

  const formatSize = useMemo(
    () => (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`),
    []
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 搜索 */}
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="全文搜索文档内容（命中段落）"
          className="h-9 min-w-0 flex-1 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none focus:bg-[#ebebee]"
        />
        <button
          onClick={() => void search()}
          disabled={!q.trim() || searching}
          className="h-9 shrink-0 rounded-lg bg-[#1d1d1f] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
        >
          {searching ? '搜索中…' : '搜索'}
        </button>
      </div>

      {/* 搜索结果 */}
      {results !== null && (
        <div className="rounded-xl bg-[#fafafc] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#6e6e73]">
              命中 {results.length} 处{results.length === 0 ? '（无结果）' : ''}
            </p>
            <button onClick={clearSearch} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f]">
              清除
            </button>
          </div>
          {results.length > 0 && (
            <ul className="flex flex-col divide-y divide-[#f0f0f2]">
              {results.map((r, i) => (
                <li key={i} className="flex items-start gap-3 py-2">
                  <span className="mt-0.5 shrink-0 rounded-md bg-[#f5f5f7] px-1.5 py-0.5 text-[11px] text-[#86868b]">
                    {r.idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{r.docName}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#6e6e73]">{r.snippet}</p>
                  </div>
                  <button
                    onClick={() => void view(r.docId)}
                    className="shrink-0 text-[12px] text-[#0057b8] hover:underline"
                  >
                    查看
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#1d1d1f]" />
          全选
        </label>
        {selected.size > 0 ? (
          <button
            onClick={() => void remove([...selected])}
            disabled={bulkBusy}
            className="rounded-lg bg-[#d93025] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            删除选中的 {selected.size} 份文档
          </button>
        ) : (
          <span className="text-[12px] text-[#a1a1a6]">勾选文档可批量删除</span>
        )}
      </div>

      {/* 文档列表 */}
      {docs.length === 0 ? (
        <p className="py-6 text-[13px] text-[#86868b]">暂无文档，拖入文件开始。</p>
      ) : (
        <ul className="divide-y divide-[#f0f0f2]">
          {docs.map((d) => {
            const checked = selected.has(d.id);
            return (
              <li key={d.id} className="group flex items-center gap-3 py-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(d.id)}
                  className="accent-[#1d1d1f]"
                />
                <span className="w-12 shrink-0 rounded-md bg-[#f5f5f7] py-1 text-center text-[11px] uppercase tracking-wide text-[#86868b]">
                  {d.ext}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{d.name}</p>
                  <p className="text-[12px] text-[#86868b]">
                    {formatSize(d.size)} · {d.chunkCount} 块 · {d.charCount.toLocaleString()} 字 · {d.createdAt}
                  </p>
                </div>
                <button
                  onClick={() => void view(d.id)}
                  className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] opacity-0 transition-opacity hover:bg-[#f5f5f7] hover:text-[#0057b8] group-hover:opacity-100"
                >
                  查看
                </button>
                <button
                  onClick={() => void remove([d.id])}
                  disabled={bulkBusy}
                  className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] opacity-0 transition-opacity hover:bg-[#f5f5f7] hover:text-[#d93025] group-hover:opacity-100 disabled:opacity-30"
                  title="删除该文档及其向量块"
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 原文查看弹窗 */}
      {(viewing || viewLoading) && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20 p-5" onClick={() => setViewing(null)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="min-w-0 truncate text-[15px] font-semibold">{viewing?.name ?? '加载中…'}</h3>
              <button onClick={() => setViewing(null)} className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] hover:bg-[#f5f5f7]">
                关闭
              </button>
            </div>
            {viewLoading ? (
              <p className="py-10 text-center text-[13px] text-[#86868b]">加载原文…</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[#fafafc] p-4 text-[13px] leading-relaxed text-[#3a3a3c]">
                {viewing?.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}