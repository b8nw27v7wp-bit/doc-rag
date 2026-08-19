'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SessionSidebar, { type SessionView, type DocOption } from '@/components/session-sidebar';
import MessageBubble, { type Msg, type SourceItem } from '@/components/message-bubble';
import ModelSettings, { PRESETS, presetLabel, maskKey, type Settings } from '@/components/model-settings';
import { useT } from '@/components/locale';

const DEFAULT_SETTINGS: Settings = {
  provider: 'deepseek',
  baseURL: PRESETS.deepseek.baseURL,
  model: PRESETS.deepseek.model,
  apiKey: '',
  expand: false,
  temperature: 0.3,
};
const LS_KEY = 'docrag.settings';

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function ChatPage() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [scopeIds, setScopeIds] = useState<number[]>([]);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      // 静默失败，下次操作重试
    }
  }, []);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {});
    fetch('/api/documents')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.documents ?? []) as { id: number; name: string }[];
        setDocs(list.map((x) => ({ id: x.id, name: x.name })));
        setDocCount(list.length);
      })
      .catch(() => setDocCount(0));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const patchLast = useCallback((patch: Partial<Msg>) => {
    setMsgs((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, ...patch } : m)));
  }, []);

  const newChat = useCallback(async () => {
    abortRef.current?.abort();
    await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await refreshSessions();
    setCurrentId(null);
    setScopeIds([]);
    setMsgs([]);
    setNotice('');
  }, [refreshSessions]);

  const selectSession = useCallback(
    async (id: number) => {
      if (streaming) return; // 生成中不切换
      abortRef.current?.abort();
      try {
        const res = await fetch(`/api/messages?session=${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const history: Msg[] = (data.messages ?? []).map(
          (m: { role: 'user' | 'assistant'; content: string; refs?: unknown }) => ({
            role: m.role,
            content: m.content,
            sources: Array.isArray(m.refs) ? (m.refs as SourceItem[]) : undefined,
          })
        );
        setMsgs(history);
        setCurrentId(id);
        setScopeIds(data.session?.docIds ?? []);
        setInput('');
        setNotice('');
      } catch {
        // 忽略
      }
    },
    [streaming]
  );

  const removeSession = useCallback(
    async (id: number) => {
      await fetch(`/api/sessions?id=${id}`, { method: 'DELETE' });
      if (currentIdRef.current === id) {
        setCurrentId(null);
        setMsgs([]);
        setScopeIds([]);
      }
      await refreshSessions();
    },
    [refreshSessions]
  );

  const renameSession = useCallback(
    async (id: number) => {
      const cur = sessions.find((s) => s.id === id)?.title ?? '';
      const next = window.prompt(t('重命名会话'), cur);
      if (next === null || next.trim() === '' || next === cur) return;
      await fetch(`/api/sessions?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
      await refreshSessions();
    },
    [sessions, refreshSessions, t]
  );

  const togglePin = useCallback(
    async (id: number, pinned: boolean) => {
      await fetch(`/api/sessions?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      await refreshSessions();
    },
    [refreshSessions]
  );

  const exportSession = useCallback(() => {
    const url = currentIdRef.current ? `/api/sessions/export?id=${currentIdRef.current}` : '/api/sessions/export';
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const changeScope = useCallback((ids: number[]) => {
    setScopeIds(ids);
    const id = currentIdRef.current;
    if (id) {
      void fetch(`/api/sessions?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docIds: ids }),
      });
    }
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput('');
    setNotice('');
    setMsgs((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = '';
    let gotSession = false;
    try {
      const body = {
        message: q,
        ...(currentIdRef.current ? { sessionId: currentIdRef.current } : {}),
        ...(scopeIds.length > 0 ? { docIds: scopeIds } : {}),
        ...(settings.expand ? { expand: true } : {}),
        temperature: settings.temperature,
      };
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { 'x-api-key': settings.apiKey } : {}),
          ...(settings.baseURL ? { 'x-base-url': settings.baseURL } : {}),
          ...(settings.model ? { 'x-model': settings.model } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(e?.error || `请求失败 ${res.status}`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let ev: {
            type: string;
            text?: string;
            sources?: SourceItem[];
            refs?: number[];
            invalidRefs?: number[];
            message?: string;
            id?: number;
          };
          try {
            ev = JSON.parse(line) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === 'session' && ev.id) {
            gotSession = true;
            currentIdRef.current = ev.id;
            setCurrentId(ev.id);
            void refreshSessions();
          } else if (ev.type === 'delta') {
            acc += ev.text ?? '';
            patchLast({ content: acc });
          } else if (ev.type === 'reasoning') {
            setMsgs((prev) =>
              prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, reasoning: (m.reasoning ?? '') + (ev.text ?? '') } : m))
            );
          } else if (ev.type === 'warning') {
            setNotice(ev.message ?? '');
          } else if (ev.type === 'sources') {
            patchLast({ sources: ev.sources, invalidRefs: ev.invalidRefs });
          } else if (ev.type === 'error') {
            throw new Error(ev.message || '未知错误');
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        patchLast({ content: acc || (e instanceof Error ? e.message : String(e)), error: true });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (!gotSession) void refreshSessions();
    }
  }, [input, streaming, settings, scopeIds, patchLast, refreshSessions]);

  const stop = () => abortRef.current?.abort();

  const saveSettings = (next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // 隐私模式等场景写入失败，本次会话内仍生效
    }
    setSettingsOpen(false);
  };

  return (
    <div className="flex h-[calc(100dvh-56px)]">
      <SessionSidebar
        sessions={sessions}
        currentId={currentId}
        docs={docs}
        scopeIds={scopeIds}
        onNew={() => void newChat()}
        onSelect={(id) => void selectSession(id)}
        onDelete={(id) => void removeSession(id)}
        onRename={(id) => void renameSession(id)}
        onPin={(id, pinned) => void togglePin(id, pinned)}
        onScopeChange={changeScope}
      />

      {/* 对话区 */}
      <div className="flex min-w-0 flex-1 flex-col pl-5">
        <div className="flex items-center justify-between py-4">
          <p className="min-w-0 truncate text-[13px] text-[#86868b]">
            {currentId === null
              ? docCount === null
                ? t('加载文档库…')
                : docCount === 0
                  ? t('文档库为空，先到首页上传文档')
                  : t('新对话 · 提问将自动保存')
              : sessions.find((s) => s.id === currentId)?.title ?? t('新对话 · 提问将自动保存')}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={exportSession}
              className="rounded-lg px-3 py-1.5 text-[13px] text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]"
              title={currentId === null ? '导出全部会话为 Markdown' : '导出当前会话为 Markdown'}
            >
              {t('导出')}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-1 shrink-0 rounded-lg px-3 py-1.5 text-[13px] text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]"
            >
              {t('模型设置')} · {presetLabel(settings.provider)} · {maskKey(settings.apiKey, t)}
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto pb-4">
          {msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <p className="text-[15px] font-medium text-[#6e6e73]">{t('向你的文档提问')}</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-[#a1a1a6]">
                回答基于向量检索的文档内容生成并标注引用；对话会自动保存，随时回来继续。
                {scopeIds.length > 0 && ' 当前仅检索选中文档。'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {msgs.map((m, i) => (
                <MessageBubble key={i} msg={m} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {notice && (
          <div className="mb-1 rounded-lg bg-[#fff8e6] px-3 py-2 text-[12px] text-[#8a6d1a]">{notice}</div>
        )}

        {/* 输入区 */}
        <div className="flex items-end gap-2 border-t border-[#f0f0f2] py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={streaming ? t('生成中…') : t('输入问题，Enter 发送')}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl bg-[#f5f5f7] px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-[#a1a1a6] focus:bg-[#ebebee]"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="h-[44px] shrink-0 rounded-xl bg-[#1d1d1f] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
            >
              {t('停止')}
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="h-[44px] shrink-0 rounded-xl bg-[#1d1d1f] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              {t('发送')}
            </button>
          )}
        </div>
      </div>

      {settingsOpen && <ModelSettings settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}