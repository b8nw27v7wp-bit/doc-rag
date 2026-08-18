'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface SourceItem {
  n: number;
  docName: string;
  idx: number;
  text: string;
  score: number;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceItem[];
  error?: boolean;
}

interface Settings {
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
}

const PRESETS: Record<string, { baseURL: string; model: string; label: string }> = {
  deepseek: { baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', label: 'DeepSeek 官方' },
  glm: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', label: '智谱 GLM' },
  kimi: { baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', label: '月之暗面 Kimi' },
  ollama: { baseURL: 'http://localhost:11434/v1', model: 'qwen2.5:7b', label: 'Ollama 本地模型（全离线）' },
  custom: { baseURL: '', model: '', label: '自定义 OpenAI 兼容端点' },
};

const DEFAULT_SETTINGS: Settings = { provider: 'deepseek', baseURL: PRESETS.deepseek.baseURL, model: PRESETS.deepseek.model, apiKey: '' };
const LS_KEY = 'docrag.settings';

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function maskKey(key: string): string {
  if (!key) return '未配置';
  return key.length > 8 ? `…${key.slice(-4)}` : '已配置';
}

export default function ChatPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [docCount, setDocCount] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then((d) => setDocCount(d.stats?.documents ?? 0))
      .catch(() => setDocCount(0));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const patchLast = useCallback((patch: Partial<Msg>) => {
    setMsgs((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput('');
    setMsgs((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { 'x-api-key': settings.apiKey } : {}),
          ...(settings.baseURL ? { 'x-base-url': settings.baseURL } : {}),
          ...(settings.model ? { 'x-model': settings.model } : {}),
        },
        body: JSON.stringify({ message: q }),
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
          let ev: { type: string; text?: string; sources?: SourceItem[]; message?: string };
          try {
            ev = JSON.parse(line) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === 'delta') {
            acc += ev.text ?? '';
            patchLast({ content: acc });
          } else if (ev.type === 'sources') {
            patchLast({ sources: ev.sources });
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
    }
  }, [input, streaming, settings, patchLast]);

  const stop = () => abortRef.current?.abort();

  const applyPreset = (provider: string) => {
    const p = PRESETS[provider] ?? PRESETS.custom;
    setSettings((s) => ({ ...s, provider, baseURL: p.baseURL, model: p.model }));
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
      // 隐私模式等场景写入失败，本次会话内仍生效
    }
    setSettingsOpen(false);
  };

  const clearKey = () => setSettings((s) => ({ ...s, apiKey: '' }));

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      {/* 顶栏操作区 */}
      <div className="flex items-center justify-between py-4">
        <p className="text-[13px] text-[#86868b]">
          {docCount === null
            ? '加载文档库…'
            : docCount === 0
              ? '文档库为空，先到首页上传文档'
              : `${docCount} 份文档已可问答`}
        </p>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-lg px-3 py-1.5 text-[13px] text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]"
        >
          模型设置 · {PRESETS[settings.provider]?.label ?? settings.provider} · {maskKey(settings.apiKey)}
        </button>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto pb-4">
        {msgs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-[15px] font-medium text-[#6e6e73]">向你的文档提问</p>
            <p className="max-w-sm text-[13px] leading-relaxed text-[#a1a1a6]">
              回答基于向量检索的文档内容生成，并标注引用来源。
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
          placeholder={streaming ? '生成中…' : '输入问题，Enter 发送'}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl bg-[#f5f5f7] px-4 py-2.5 text-[14px] outline-none transition-colors placeholder:text-[#a1a1a6] focus:bg-[#ebebee]"
        />
        {streaming ? (
          <button
            onClick={stop}
            className="h-[44px] shrink-0 rounded-xl bg-[#1d1d1f] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-85"
          >
            停止
          </button>
        ) : (
          <button
            onClick={() => void send()}
            disabled={!input.trim()}
            className="h-[44px] shrink-0 rounded-xl bg-[#1d1d1f] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-30"
          >
            发送
          </button>
        )}
      </div>

      {/* 设置面板 */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-5"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold">模型设置</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#86868b]">
              Key 仅保存在本机浏览器 localStorage，随请求头发送给所选服务商，不落到服务器。
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-[12px] font-medium">
                服务商
                <select
                  value={settings.provider}
                  onChange={(e) => applyPreset(e.target.value)}
                  className="h-9 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
                >
                  {Object.entries(PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-[12px] font-medium">
                Base URL
                <input
                  value={settings.baseURL}
                  onChange={(e) => setSettings((s) => ({ ...s, baseURL: e.target.value }))}
                  placeholder="https://api.deepseek.com/v1"
                  className="h-9 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-[12px] font-medium">
                模型
                <input
                  value={settings.model}
                  onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  placeholder="deepseek-chat"
                  className="h-9 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-[12px] font-medium">
                API Key
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value }))}
                    placeholder="sk-…（Ollama 本地模型可留空）"
                    className="h-9 min-w-0 flex-1 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
                  />
                  {settings.apiKey && (
                    <button
                      onClick={clearKey}
                      className="shrink-0 rounded-lg px-3 text-[12px] text-[#d93025] hover:bg-[#f5f5f7]"
                    >
                      清除
                    </button>
                  )}
                </div>
              </label>

              {settings.provider === 'ollama' && (
                <p className="text-[12px] text-[#86868b]">
                  使用前请先启动 Ollama 并拉取模型（如 <code className="rounded bg-[#f5f5f7] px-1">ollama pull qwen2.5:7b</code>）。
                  全离线运行，文档数据不出本机。
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={saveSettings}
                className="rounded-xl bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white hover:opacity-85"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#1d1d1f] px-4 py-2.5 text-[14px] leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  // 把 [n] 引用标记渲染为可点击的编号 chip
  const parts = msg.content.split(/(\[\d+\])/g).filter(Boolean);

  return (
    <div className="flex flex-col">
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
                <button
                  key={i}
                  className="ref-chip"
                  onClick={() => setExpanded(expanded === n ? null : n)}
                  title="查看引用来源"
                >
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
                expanded === s.n
                  ? 'bg-[#1d1d1f] text-white'
                  : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#ebebee]'
              }`}
            >
              {s.n} · {s.docName} · {s.score}
            </button>
          ))}
        </div>
      )}

      {msg.sources && expanded !== null && (
        <div className="mt-2 rounded-xl bg-[#fafafc] p-4 text-[13px] leading-relaxed text-[#3a3a3c]">
          {msg.sources
            .filter((s) => s.n === expanded)
            .map((s) => (
              <div key={s.n}>
                <p className="mb-1.5 text-[11px] font-medium text-[#86868b]">
                  来源 {s.n} · 《{s.docName}》第 {s.idx + 1} 段 · 相似度 {s.score}
                </p>
                <p className="whitespace-pre-wrap">{s.text}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}