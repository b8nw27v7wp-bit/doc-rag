/**
 * 多查询检索（Multi-Query RAG）：把一个提问改写成若干个不同角度的检索查询，
 * 每个查询独立检索后再合并排名。可显著提升复杂/模糊问题的召回（热点：查询改写/扩展）。
 *
 * 查询改写依赖 LLM（非流式）；检索合并为纯函数，可离线单测。
 */
import type { ChatMsg } from './llm';

export const MAX_QUERIES = 3;

/** 组装查询改写提示：要求输出换行分隔的多个检索查询（不含序号之外的说明） */
export function buildQueryExpansionPrompt(question: string): ChatMsg[] {
  return [
    {
      role: 'system',
      content:
        '你是检索查询改写助手。针对用户问题，生成若干条适合文档检索的独立查询，' +
        '每条从不同角度（关键词、同义改写、更具体/更宽泛）表达，彼此互补以提升召回。',
    },
    {
      role: 'user',
      content:
        `请为下面的问题输出至多 ${MAX_QUERIES} 条检索查询，每行一条，只输出查询本身，不要编号、不要解释。\n\n` +
        `问题：${question}`,
    },
  ];
}

/** 解析改写结果：支持「1. xxx」「- xxx」等行；兼容混合格式（部分编号、部分裸行） */
export function parseQueryLines(text: string): string[] {
  const out: string[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const m = /^\s*(?:\d+\s*[.)、]\s*|[-*]\s+)(.+?)\s*$/.exec(line);
    if (m) {
      const v = m[1].trim();
      if (v) out.push(v);
    } else {
      const t = line.trim();
      if (t && !t.startsWith('#')) out.push(t);
    }
  }
  // 去重保序
  return [...new Set(out)].filter(Boolean);
}