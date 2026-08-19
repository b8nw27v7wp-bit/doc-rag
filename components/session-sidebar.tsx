'use client';

import { useState } from 'react';

export interface DocOption {
  id: number;
  name: string;
}

export interface SessionView {
  id: number;
  title: string;
  docIds: number[];
  messageCount: number;
  updatedAt: string;
}

interface Props {
  sessions: SessionView[];
  currentId: number | null;
  docs: DocOption[];
  scopeIds: number[];
  onNew: () => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onRename: (id: number) => void;
  onScopeChange: (ids: number[]) => void;
}

export default function SessionSidebar({
  sessions,
  currentId,
  docs,
  scopeIds,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onScopeChange,
}: Props) {
  const [scopeOpen, setScopeOpen] = useState(false);

  const toggleDoc = (id: number) => {
    const next = scopeIds.includes(id) ? scopeIds.filter((x) => x !== id) : [...scopeIds, id];
    onScopeChange(next);
  };

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-[#f0f0f2] pr-3">
      {/* 新建会话 */}
      <button
        onClick={onNew}
        className="mb-3 flex items-center justify-center gap-1.5 rounded-xl bg-[#f5f5f7] py-2 text-[13px] font-medium text-[#1d1d1f] transition-colors hover:bg-[#ebebee]"
      >
        <span className="text-[15px] leading-none">+</span> 新对话
      </button>

      {/* 会话列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-[#a1a1a6]">
            暂无历史会话。
            <br />
            直接提问会自动新建。
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sessions.map((s) => {
              const active = s.id === currentId;
              return (
                <li key={s.id} className="group relative flex items-center">
                  <button
                    onClick={() => onSelect(s.id)}
                    className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                      active
                        ? 'bg-[#f5f5f7] font-medium text-[#1d1d1f]'
                        : 'text-[#6e6e73] hover:bg-[#fafafc]'
                    }`}
                    title={`${s.title}（${s.messageCount} 条消息）`}
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={() => onRename(s.id)}
                    className="absolute right-7 hidden rounded-md px-1.5 py-0.5 text-[12px] text-[#86868b] hover:bg-white hover:text-[#1d1d1f] group-hover:block"
                    title="重命名"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="absolute right-1.5 hidden rounded-md px-1.5 py-0.5 text-[12px] text-[#86868b] hover:bg-white hover:text-[#d93025] group-hover:block"
                    title="删除会话"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 文档范围 */}
      <div className="mt-3 border-t border-[#f0f0f2] pt-3">
        <button
          onClick={() => setScopeOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[12px] font-medium text-[#6e6e73] transition-colors hover:bg-[#f5f5f7]"
        >
          <span>文档范围</span>
          <span className="text-[11px] text-[#a1a1a6]">{scopeIds.length === 0 ? '全部文档' : `${scopeIds.length} 篇`}</span>
        </button>
        {scopeOpen && (
          <div className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg bg-[#fafafc] p-1">
            <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-[#f5f5f7]">
              <input
                type="checkbox"
                checked={scopeIds.length === 0}
                onChange={() => onScopeChange([])}
                className="accent-[#1d1d1f]"
              />
              全部文档
            </label>
            {docs.length === 0 && (
              <p className="px-2 py-1.5 text-[11px] text-[#a1a1a6]">还没有文档，先到首页上传</p>
            )}
            {docs.map((d) => (
              <label key={d.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] hover:bg-[#f5f5f7]">
                <input
                  type="checkbox"
                  checked={scopeIds.includes(d.id)}
                  onChange={() => toggleDoc(d.id)}
                  className="accent-[#1d1d1f]"
                />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}