/**
 * LLM 配置解析（集中化）：从请求头（BYOK 优先）或环境变量解析，baseURL 经 SSRF 校验。
 * chat 与 summarize 等需要调用 LLM 的路由复用，避免重复逻辑。
 */
import type { NextRequest } from 'next/server';
import { validateBaseURL } from './ssrf';

export interface ResolvedLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  /** 采样温度（null = 使用默认 0.3） */
  temperature: number | null;
  /** 最大生成 token（null = 服务商默认） */
  maxTokens: number | null;
  /** 单次调用超时 ms */
  timeoutMs: number;
}

export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_MODEL = 'deepseek-chat';

function envNumber(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 解析 LLM 配置；baseURL 非法时抛 UnsafeBaseUrlError */
export function resolveLlmConfig(req: NextRequest): ResolvedLlmConfig {
  const baseURL = validateBaseURL(
    req.headers.get('x-base-url')?.trim() || process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL
  );
  return {
    apiKey: req.headers.get('x-api-key')?.trim() || process.env.LLM_API_KEY?.trim() || '',
    baseURL,
    model: req.headers.get('x-model')?.trim() || process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    temperature: envNumber('LLM_TEMPERATURE'),
    maxTokens: envNumber('LLM_MAX_TOKENS'),
    timeoutMs: envNumber('LLM_TIMEOUT_MS') ?? 120_000,
  };
}