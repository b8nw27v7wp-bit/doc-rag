'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/locale';

export interface DocItem {
  id: number;
  name: string;
  ext: string;
  size: number;
  charCount: number;
  chunkCount: number;
  createdAt: string;
  keywords?: string[];
  summary?: string | null;
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
  const t = useT();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [viewing, setViewing] = useState<DocContent | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [reembedBusy, setReembedBusy] = useState(false);
  const [reembedMsg, setReembedMsg] = useState('');
  // 文档库分页/排序/筛选（客户端，避免百份文档一次全渲染）
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'createdAt' | 'name' | 'size' | 'chunks'>('createdAt');
  const [extFilter, setExtFilter] = useState<string>('all');
  const [nameFilter, setNameFilter] = useState('');
  const PAGE_SIZE = 20;

  const exts = useMemo(() => [...new Set(docs.map((d) => d.ext))].sort(), [docs]);
  const filtered = useMemo(() => {
    const kw = nameFilter.trim().toLowerCase();
    let list = docs.filter(
      (d) =>
        (extFilter === 'all' || d.ext === extFilter) &&
        (!kw || d.name.toLowerCase().includes(kw))
    );
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sortKey === 'size') return b.size - a.size;
      if (sortKey === 'chunks') return b.chunkCount - a.chunkCount;
      return b.id - a.id;
    });
    return list;
  }, [docs, extFilter, nameFilter, sortKey]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDocs = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );
  // 翻页/筛选变化时回到合法页码
  const gotoPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  const allSelected = pageDocs.length > 0 && pageDocs.every((d) => selected.has(d.id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const d of pageDocs) next.delete(d.id);
      } else {
        for (const d of pageDocs) next.add(d.id);
      }
      return next;
    });
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

  const summarize = useCallback(
    async (id: number) => {
      setSummarizingId(id);
      setSummaryError('');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        // 复用「问答页」保存的 BYOK 配置（同一 localStorage key）
        const raw = localStorage.getItem('docrag.settings');
        if (raw) {
          const s = JSON.parse(raw) as { apiKey?: string; baseURL?: string; model?: string };
          if (s.apiKey) headers['x-api-key'] = s.apiKey;
          if (s.baseURL) headers['x-base-url'] = s.baseURL;
          if (s.model) headers['x-model'] = s.model;
        }
      } catch {
        // 忽略本地设置读取失败
      }
      try {
        const res = await fetch('/api/documents/summarize', { method: 'POST', headers, body: JSON.stringify({ id }) });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(data?.error || '摘要生成失败');
        router.refresh();
      } catch (e) {
        setSummaryError(e instanceof Error ? e.message : '摘要生成失败');
      } finally {
        setSummarizingId(null);
      }
    },
    [router]
  );

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

  const reembedAll = useCallback(async () => {
    if (reembedBusy || docs.length === 0) return;
    if (!window.confirm(`对 ${docs.length} 份文档全部重新嵌入？换嵌入模型后使用，耗时取决于文档量。`)) return;
    setReembedBusy(true);
    setReembedMsg('');
    try {
      const res = await fetch('/api/documents/reembed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: docs.map((d) => d.id) }),
      });
      const data = (await res.json().catch(() => null)) as {
        succeeded?: number;
        failed?: number;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error || '重嵌失败');
      setReembedMsg(`重嵌完成：成功 ${data?.succeeded ?? 0} / 失败 ${data?.failed ?? 0}`);
      router.refresh();
    } catch (e) {
      setReembedMsg(e instanceof Error ? e.message : '重嵌失败');
    } finally {
      setReembedBusy(false);
    }
  }, [docs, reembedBusy, router]);

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
          placeholder={t('全文搜索文档内容（命中段落）')}
          className="h-9 min-w-0 flex-1 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none focus:bg-[#ebebee]"
        />
        <button
          onClick={() => void search()}
          disabled={!q.trim() || searching}
          className="h-9 shrink-0 rounded-lg bg-[#1d1d1f] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
        >
          {searching ? t('搜索中…') : t('搜索')}
        </button>
      </div>

      {summaryError && <p className="text-[12px] text-[#d93025]">{summaryError}</p>}

      {/* 搜索结果 */}
      {results !== null && (
        <div className="rounded-xl bg-[#fafafc] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#6e6e73]">
              {t('命中 {n} 处', { n: results.length })}
              {results.length === 0 ? t('（无结果）') : ''}
            </p>
            <button onClick={clearSearch} className="text-[12px] text-[#86868b] hover:text-[#1d1d1f]">
              {t('清除')}
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
                    {t('查看')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 筛选/排序栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nameFilter}
          onChange={(e) => {
            setNameFilter(e.target.value);
            setPage(1);
          }}
          placeholder={t('按文件名过滤…')}
          className="h-8 min-w-0 flex-1 rounded-lg bg-[#f5f5f7] px-3 text-[12px] outline-none focus:bg-[#ebebee]"
        />
        <select
          value={extFilter}
          onChange={(e) => {
            setExtFilter(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-lg bg-[#f5f5f7] px-2 text-[12px] outline-none"
        >
          <option value="all">{t('全部格式')}</option>
          {exts.map((e) => (
            <option key={e} value={e}>
              .{e}
            </option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="h-8 rounded-lg bg-[#f5f5f7] px-2 text-[12px] outline-none"
        >
          <option value="createdAt">{t('最新在前')}</option>
          <option value="name">{t('按名称')}</option>
          <option value="size">{t('按大小')}</option>
          <option value="chunks">{t('按块数')}</option>
        </select>
        <span className="text-[12px] text-[#a1a1a6]">
          {filtered.length} / {docs.length} 份
        </span>
      </div>

      {reembedMsg && <p className="text-[12px] text-[#6e6e73]">{reembedMsg}</p>}

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px] text-[#6e6e73]">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#1d1d1f]" />
          {t('全选')}（本页 {pageDocs.length}）
        </label>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <button
              onClick={() => void reembedAll()}
              disabled={reembedBusy || bulkBusy}
              className="rounded-lg bg-[#f5f5f7] px-3 py-1.5 text-[12px] font-medium text-[#1d1d1f] transition-opacity hover:bg-[#ebebee] disabled:opacity-40"
              title="换嵌入模型后，对全部文档重建向量"
            >
              {reembedBusy ? '重嵌中…' : '全部重嵌'}
            </button>
          )}
          {selected.size > 0 ? (
            <button
              onClick={() => void remove([...selected])}
              disabled={bulkBusy}
              className="rounded-lg bg-[#d93025] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t('删除选中的 {n} 份文档', { n: selected.size })}
            </button>
          ) : (
            <span className="text-[12px] text-[#a1a1a6]">{t('勾选文档可批量删除')}</span>
          )}
        </div>
      </div>

      {/* 文档列表 */}
      {docs.length === 0 ? (
        <p className="py-6 text-[13px] text-[#86868b]">{t('暂无文档，拖入文件开始。')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-[13px] text-[#86868b]">没有符合筛选条件的文档。</p>
      ) : (
        <>
        <ul className="divide-y divide-[#f0f0f2]">
          {pageDocs.map((d) => {
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
                  {d.keywords && d.keywords.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.keywords.slice(0, 6).map((k) => (
                        <span key={k} className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[11px] text-[#6e6e73]">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.summary && <p className="mt-1 text-[12px] leading-relaxed text-[#86868b]">{d.summary}</p>}
                </div>
                <button
                  onClick={() => void summarize(d.id)}
                  disabled={summarizingId !== null}
                  className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] opacity-0 transition-opacity hover:bg-[#f5f5f7] hover:text-[#1d1d1f] group-hover:opacity-100 disabled:opacity-30"
                  title={d.summary ? '重新生成摘要' : '用 LLM 生成一句话摘要'}
                >
                  {summarizingId === d.id ? t('生成中…') : d.summary ? t('重述') : t('摘要')}
                </button>
                <button
                  onClick={() => void view(d.id)}
                  className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] opacity-0 transition-opacity hover:bg-[#f5f5f7] hover:text-[#0057b8] group-hover:opacity-100"
                >
                  {t('查看')}
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 text-[12px] text-[#6e6e73]">
            <span>
              第 {safePage} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => gotoPage(safePage - 1)}
                disabled={safePage <= 1}
                className="rounded-lg bg-[#f5f5f7] px-3 py-1.5 disabled:opacity-40"
              >
                {t('上一页')}
              </button>
              <button
                onClick={() => gotoPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="rounded-lg bg-[#f5f5f7] px-3 py-1.5 disabled:opacity-40"
              >
                {t('下一页')}
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* 原文查看弹窗 */}
      {(viewing || viewLoading) && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20 p-5" onClick={() => setViewing(null)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="min-w-0 truncate text-[15px] font-semibold">{viewing?.name ?? '加载中…'}</h3>
              <button onClick={() => setViewing(null)} className="rounded-lg px-2 py-1 text-[13px] text-[#86868b] hover:bg-[#f5f5f7]">
                {t('关闭')}
              </button>
            </div>
            {viewLoading ? (
              <p className="py-10 text-center text-[13px] text-[#86868b]">{t('加载原文…')}</p>
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