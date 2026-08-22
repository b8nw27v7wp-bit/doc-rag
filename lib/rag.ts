/**
 * RAG 组装：检索命中的块 → 带编号引用的 prompt；回答解析引用标记。
 */
import type { ChatMsg } from './llm';

export interface SourceHit {
  n: number;
  docName: string;
  idx: number;
  text: string;
  score: number;
  /** 混合检索中的关键词分（0 = 未被关键词检索命中） */
  keywordScore?: number;
}

export const RAG_TOP_K = 6;
export const RAG_MIN_SCORE = 0.18;
/** 注入 LLM 的历史消息条数上限 */
export const HISTORY_LIMIT = 12;
/** 历史单条截断长度，防止超长上下文撑爆 token */
export const HISTORY_MAX_CHARS = 2000;

export function buildSystemPrompt(): string {
  return (
    '你是一个严谨的文档问答助手。请仅依据对话中「资料」回答用户问题，不要使用训练记忆中的知识。\n' +
    '规则：\n' +
    '1. 回答中引用资料处标注来源序号，格式为 [n]（n 对应资料编号）。\n' +
    '2. 多个资料共同支撑时连续标注，如 [1][2]。\n' +
    '3. 资料不足或无关时，明确回答「资料中未找到相关内容」，不要编造。\n' +
    '4. 结合历史对话理解用户的追问与意图，但引用只标注本轮资料。\n' +
    '5. 用中文回答（除非提问使用其他语言）。'
  );
}

/**
 * 组装 RAG 消息序列：system（规则）+ 历史对话 + 当前回合（资料 + 问题）。
 * @param history 历史消息（user/assistant，不含 system）
 */
export function buildRagMessages(question: string, hits: SourceHit[], history: ChatMsg[] = []): ChatMsg[] {
  const docs = hits
    .map(
      (h, i) =>
        `[${i + 1}] 出自《${h.docName}》（第 ${h.idx + 1} 段）\n${h.text.slice(0, 4000)}`
    )
    .join('\n\n');

  const messages: ChatMsg[] = [{ role: 'system', content: buildSystemPrompt() }];
  for (const h of history.slice(-HISTORY_LIMIT)) {
    const content = h.content.length > HISTORY_MAX_CHARS ? h.content.slice(0, HISTORY_MAX_CHARS) + '…' : h.content;
    messages.push({ role: h.role, content });
  }
  messages.push({
    role: 'user',
    content: `资料：\n\n${docs}\n\n---\n\n问题：${question}`,
  });
  return messages;
}

/** 从回答中提取引用的源编号（去重、升序） */
export function extractRefs(answer: string): number[] {
  const refs: number[] = [];
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const n = Number(m[1]);
    if (!refs.includes(n)) refs.push(n);
  }
  return refs.sort((a, b) => a - b);
}