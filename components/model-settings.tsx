'use client';

import { useState } from 'react';
import { useT } from '@/components/locale';

export interface Settings {
  provider: string;
  baseURL: string;
  model: string;
  apiKey: string;
  expand: boolean;
  temperature: number;
}

export const PRESETS: Record<string, { baseURL: string; model: string; label: string }> = {
  deepseek: { baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', label: 'DeepSeek 官方' },
  glm: { baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', label: '智谱 GLM' },
  kimi: { baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', label: '月之暗面 Kimi' },
  ollama: { baseURL: 'http://localhost:11434/v1', model: 'qwen2.5:7b', label: 'Ollama 本地模型（全离线）' },
  custom: { baseURL: '', model: '', label: '自定义 OpenAI 兼容端点' },
};

export function presetLabel(provider: string): string {
  return PRESETS[provider]?.label ?? provider;
}

export function maskKey(key: string, t: (s: string) => string): string {
  if (!key) return t('未配置');
  return key.length > 8 ? `…${key.slice(-4)}` : t('已配置');
}

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export default function ModelSettings({ settings, onSave, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<Settings>(settings);

  const applyPreset = (provider: string) => {
    const p = PRESETS[provider] ?? PRESETS.custom;
    setDraft((s) => ({ ...s, provider, baseURL: p.baseURL, model: p.model }));
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-5" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">{t('模型设置')}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[#86868b]">
          Key 仅保存在本机浏览器 localStorage，随请求头发送给所选服务商，不落到服务器。
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] font-medium">
            {t('服务商')}
            <select value={draft.provider} onChange={(e) => applyPreset(e.target.value)} className="h-9 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none">
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
              value={draft.baseURL}
              onChange={(e) => setDraft((s) => ({ ...s, baseURL: e.target.value }))}
              placeholder="https://api.deepseek.com/v1"
              className="h-9 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] font-medium">
            {t('模型')}
            <input
              value={draft.model}
              onChange={(e) => setDraft((s) => ({ ...s, model: e.target.value }))}
              placeholder="deepseek-chat"
              className="h-9 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] font-medium">
            {t('API Key')}
            <div className="flex gap-2">
              <input
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft((s) => ({ ...s, apiKey: e.target.value }))}
                placeholder="sk-…（Ollama 本地模型可留空）"
                className="h-9 min-w-0 flex-1 rounded-lg bg-[#f5f5f7] px-3 text-[13px] outline-none"
              />
              {draft.apiKey && (
                <button onClick={() => setDraft((s) => ({ ...s, apiKey: '' }))} className="shrink-0 rounded-lg px-3 text-[12px] text-[#d93025] hover:bg-[#f5f5f7]">
                  {t('清除')}
                </button>
              )}
            </div>
          </label>

          <label className="flex flex-col gap-1.5 text-[12px] font-medium">
            {t('温度')} · {draft.temperature.toFixed(1)}
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => setDraft((s) => ({ ...s, temperature: Number(e.target.value) }))}
              className="accent-[#1d1d1f]"
            />
          </label>

          <label className="flex items-center gap-2 text-[12px] font-medium">
            <input
              type="checkbox"
              checked={draft.expand}
              onChange={(e) => setDraft((s) => ({ ...s, expand: e.target.checked }))}
              className="accent-[#1d1d1f]"
            />
            {t('查询增强（多查询检索）')}
          </label>
          <p className="text-[12px] leading-relaxed text-[#86868b]">
            {t('开启后先把问题改写成多个检索查询再合并召回，复杂/模糊问题命中率更高；会额外发起一次模型调用、稍慢。')}
          </p>

          {draft.provider === 'ollama' && (
            <p className="text-[12px] text-[#86868b]">
              使用前请先启动 Ollama 并拉取模型（如 <code className="rounded bg-[#f5f5f7] px-1">ollama pull qwen2.5:7b</code>）。
              全离线运行，文档数据不出本机。
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={() => onSave(draft)} className="rounded-xl bg-[#1d1d1f] px-5 py-2 text-[13px] font-medium text-white hover:opacity-85">
            {t('保存')}
          </button>
        </div>
      </div>
    </div>
  );
}