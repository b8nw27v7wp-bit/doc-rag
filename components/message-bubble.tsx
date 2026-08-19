'use client';

import { useState } from 'react';
import { useT } from '@/components/locale';

export interface SourceItem {
  n: number;
  docName: string;
  idx: number;
  text: string;
  score: number;
  keywordScore?: number;
}

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceItem[];
  error?: boolean;
  /** 推理模型思考内容（单独展示，不参与正文） */
  reasoning?: string;
  /** 越界（被隐藏）的引用编号 */
  invalidRefs?: number[];
}

export default function MessageBubble({ msg }: { msg: Msg }) {
  const t = useT();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#1d1d1f] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  const parts = msg.content.split(/(\[\d+\])/g).filter(Boolean);

  return (
    <div className="flex flex-col">
      {msg.reasoning && (
        <div className="mb-1.5">
          <button
            onClick={() => setReasonOpen((v) => !v)}
            className="text-[11px] font-medium text-[#a1a1a6] hover:text-[#6e6e73]"
          >
            {t('思考过程')} {reasonOpen ? '−' : '+'}
          </button>
          {reasonOpen && (
            <div className="mt-1 rounded-xl bg-[#fafafc] p-3 text-[12px] leading-relaxed text-[#86868b]">
              <p className="whitespace-pre-wrap">{msg.reasoning}</p>
            </div>
          )}
        </div>
      )}

      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-md bg-[#f5f5f7] px-4 py-2.5 text-[14px] leading-relaxed ${
          msg.error ? 'text-[#d93025]' : 'text-[#1d1d1f]'
        }`}
      >
        {msg.content === '' && !msg.error ? (
          <span className="inline-block h-4 w-1.5 animate-pulse bg-[#a1a1a6]" />
        ) : (
          parts.map((p, i) => {
            const m = /^\[(\d+)\]$/.exec(p);
            if (m && msg.sources?.some((s) => s.n === Number(m[1]))) {
              const n = Number(m[1]);
              return (
                <button key={i} className="ref-chip" onClick={() => setExpanded(expanded === n ? null : n)} title={t('来源')}>
                  {n}
                </button>
              );
            }
            return <span key={i}>{p}</span>;
          })
        )}
      </div>

      {msg.sources && msg.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {msg.sources.map((s) => (
            <button
              key={s.n}
              onClick={() => setExpanded(expanded === s.n ? null : s.n)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                expanded === s.n ? 'bg-[#1d1d1f] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#ebebee]'
              }`}
            >
              {s.n} · {s.docName} · {s.score}
              {s.keywordScore ? ` / ${t('关键词')} ${s.keywordScore}` : ''}
            </button>
          ))}
        </div>
      )}

      {msg.invalidRefs && msg.invalidRefs.length > 0 && (
        <p className="mt-1 text-[11px] text-[#a1a1a6]">{t('模型可能引用了超出资料范围的编号（已隐藏）')}</p>
      )}

      {msg.sources && expanded !== null && (
        <div className="mt-2 rounded-xl bg-[#fafafc] p-4 text-[13px] leading-relaxed text-[#3a3a3c]">
          {msg.sources
            .filter((s) => s.n === expanded)
            .map((s) => (
              <div key={s.n}>
                <p className="mb-1.5 text-[11px] font-medium text-[#86868b]">
                  {t('来源')} {s.n} · 《{s.docName}》 {s.idx + 1} · {t('相似度')} {s.score}
                  {s.keywordScore ? ` · ${t('关键词')} ${s.keywordScore}` : ''}
                </p>
                <p className="whitespace-pre-wrap">{s.text}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}