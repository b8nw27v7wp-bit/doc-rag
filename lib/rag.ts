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
}

export const RAG_TOP_K = 6;
export const RAG_MIN_SCORE = 0.18;

export function buildRagMessages(question: string, hits: SourceHit[]): ChatMsg[] {
  const docs = hits
    .map(
      (h, i) =>
        `[${i + 1}] 出自《${h.docName}》（第 ${h.idx + 1} 段）\n${h.text}`
    )
    .join('\n\n');

  const system =
    '你是一个严谨的文档问答助手。请仅依据下方「资料」回答用户问题，不要使用训练记忆中的知识。\n' +
    '规则：\n' +
    '1. 回答中引用资料处标注来源序号，格式为 [n]（n 对应资料编号）。\n' +
    '2. 多个资料共同支撑时连续标注，如 [1][2]。\n' +
    '3. 资料不足或无关时，明确回答「资料中未找到相关内容」，不要编造。\n' +
    '4. 用中文回答（除非提问使用其他语言）。';

  return [
    { role: 'system', content: system },
    { role: 'user', content: `资料：\n\n${docs}\n\n---\n\n问题：${question}` },
  ];
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