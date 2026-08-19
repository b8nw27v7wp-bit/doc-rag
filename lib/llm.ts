/**
 * LLM 流式层：OpenAI 兼容 chat/completions 流式调用。
 * 兼容 DeepSeek / GLM / Kimi / Ollama 本地模型等一切 OpenAI 协议端点。
 */
import { validateBaseURL } from './ssrf';

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** SSE data 帧解析结果（支持推理模型的 reasoning_content） */
export interface SsePayload {
  delta?: string;
  reasoning?: string;
}

/** 解析单条 SSE data JSON；无法解析返回空对象 */
export function parseSsePayload(payload: string): SsePayload {
  try {
    const json = JSON.parse(payload) as {
      choices?: { delta?: { content?: string; reasoning_content?: string } }[];
    };
    const d = json.choices?.[0]?.delta;
    return { delta: d?.content, reasoning: d?.reasoning_content };
  } catch {
    return {};
  }
}

export interface StreamOptions {
  /** 外部中止信号（客户端停止） */
  signal?: AbortSignal;
  /** 单次调用总超时（默认 120s） */
  timeoutMs?: number;
  /** 采样温度（默认 0.3） */
  temperature?: number;
  /** 最大生成 token 数（缺省用服务商默认） */
  maxTokens?: number;
  /** 推理模型思考内容回调（如 deepseek-reasoner） */
  onReasoning?: (text: string) => void;
}

/**
 * 流式对话。onDelta 逐段回调累积文本，返回完整回答。
 * 解析 SSE（data: {...} → delta.content），兼容 [DONE] 结束标记。
 * 超时抛「生成超时」，外部主动中止抛 AbortError；推理模型思考内容经 onReasoning 单独回调。
 */
export async function streamChat(
  config: LLMConfig,
  messages: ChatMsg[],
  onDelta: (text: string) => void,
  opts: StreamOptions = {}
): Promise<string> {
  const external = opts.signal;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const temperature = opts.temperature ?? 0.3;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = external ? AbortSignal.any([external, timeoutSignal]) : timeoutSignal;

  const base = validateBaseURL(config.baseURL);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    }),
    signal: combined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM 接口错误 ${res.status}: ${body.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  const reader = res.body!.getReader();
  let full = '';
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        const parsed = parseSsePayload(payload);
        if (parsed.reasoning && opts.onReasoning) opts.onReasoning(parsed.reasoning);
        if (parsed.delta) {
          full += parsed.delta;
          onDelta(parsed.delta);
        }
      }
    }
  } catch (e) {
    // 外部主动中止（用户点停止）→ 原样抛 AbortError，由调用方按取消处理
    if (external?.aborted) throw e;
    if (timeoutSignal.aborted && !external?.aborted) {
      throw new Error('生成超时，请重试或缩短问题');
    }
    throw e;
  }
  return full;
}

/**
 * 非流式对话：单次返回完整回答（用于查询改写、标题生成等辅助调用）。
 * @param timeoutMs 默认 30s
 */
export async function chatOnce(
  config: LLMConfig,
  messages: ChatMsg[],
  timeoutMs = 30_000
): Promise<string> {
  const base = validateBaseURL(config.baseURL);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM 接口错误 ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (json.choices?.[0]?.message?.content ?? '').trim();
}

/** 探测服务是否可达（设置面板/Ollama 状态用）：GET {base}/models */
export async function reachable(config: Omit<LLMConfig, 'apiKey'>): Promise<boolean> {
  try {
    const base = validateBaseURL(config.baseURL);
    const res = await fetch(`${base}/models`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}