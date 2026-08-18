/**
 * LLM 流式层：OpenAI 兼容 chat/completions 流式调用。
 * 兼容 DeepSeek / GLM / Kimi / Ollama 本地模型等一切 OpenAI 协议端点。
 */
export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 流式对话。onDelta 逐段回调累积文本，返回完整回答。
 * 解析 SSE（data: {...} → delta.content），兼容 [DONE] 结束标记。
 */
export async function streamChat(
  config: LLMConfig,
  messages: ChatMsg[],
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const base = config.baseURL.replace(/\/+$/, '');
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
      temperature: 0.3,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM 接口错误 ${res.status}: ${body.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  const reader = res.body!.getReader();
  let full = '';
  let buf = '';

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
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // 忽略无法解析的帧
      }
    }
  }
  return full;
}

/** 探测服务是否可达（设置面板/Ollama 状态用）：GET {base}/models */
export async function reachable(config: Omit<LLMConfig, 'apiKey'>): Promise<boolean> {
  try {
    const res = await fetch(`${config.baseURL.replace(/\/+$/, '')}/models`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}