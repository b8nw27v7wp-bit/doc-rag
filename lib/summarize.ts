/**
 * 文档摘要：可选功能，调用 LLM 生成一句话摘要（BYOK 或 Ollama）。
 * 纯函数负责组装 prompt；生成与存储由 /api/documents/summarize 负责。
 */
import type { ChatMsg } from './llm';

/** 摘要生成的最大输入长度（字符） */
export const SUMMARY_INPUT_LIMIT = 6000;

export function buildSummaryPrompt(text: string): ChatMsg[] {
  const clipped = text.length > SUMMARY_INPUT_LIMIT ? text.slice(0, SUMMARY_INPUT_LIMIT) : text;
  return [
    {
      role: 'system',
      content:
        '你是文档摘要助手。用一到两句话概括文档主题与要点，使用中文，不超过 80 字，直接输出摘要、不要编号或解释。',
    },
    { role: 'user', content: clipped },
  ];
}