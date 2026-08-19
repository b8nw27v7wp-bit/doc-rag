/**
 * 会话导出：把会话（含引用来源）渲染为 Markdown 文本，供下载/分享。
 */
export interface ExportRef {
  n: number;
  docName: string;
  idx: number;
  text: string;
}

export interface ExportMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 引用来源：ExportRef[] 或已序列化的 JSON 字符串 */
  refs?: ExportRef[] | string;
  createdAt?: string;
}

/** 把可能的 refs（数组 / JSON 字符串 / 空）归一化为 ExportRef[] */
export function normalizeRefs(refs: ExportRef[] | string | undefined): ExportRef[] {
  if (Array.isArray(refs)) return refs;
  if (typeof refs === 'string' && refs.trim()) {
    try {
      const parsed: unknown = JSON.parse(refs);
      return Array.isArray(parsed) ? (parsed as ExportRef[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function refsToMarkdown(refs: ExportRef[]): string {
  if (refs.length === 0) return '';
  const lines = refs.map(
    (r) => `> [${r.n}] 《${r.docName}》第 ${r.idx + 1} 段：${r.text.replace(/\n+/g, ' ')}`
  );
  return `\n**引用来源**\n\n${lines.join('\n')}\n`;
}

/** 单个会话渲染为 Markdown（标题 + 逐条问答 + 引用） */
export function sessionToMarkdown(title: string, messages: ExportMessage[]): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const m of messages) {
    if (m.role === 'user') {
      lines.push('## 提问', '', m.content, '');
    } else {
      lines.push('## 回答', '', m.content, '');
      const refs = normalizeRefs(m.refs);
      if (refs.length > 0) lines.push(refsToMarkdown(refs));
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** 多个会话打包成一个文档，用二级标题分隔 */
export function sessionsToMarkdown(
  sessions: { title: string; messages: ExportMessage[] }[]
): string {
  return sessions.map((s) => sessionToMarkdown(s.title, s.messages)).join('\n\n');
}