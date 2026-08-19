/** 文本分块：按段落聚合，超长段落硬切，块间保留 overlap 重叠 */

export const CHUNK_SIZE = 600;
export const CHUNK_OVERLAP = 120;

/**
 * 将长文本切分为带重叠的块，按段落优先聚合。
 * @param text 原始文本
 * @param size 块目标长度（字符）
 * @param overlap 相邻块重叠长度（字符）
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const norm = text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!norm) return [];

  const paragraphs = norm
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = '';

  for (const p of paragraphs) {
    // 当前块装不下了，先落盘
    if (buf && buf.length + p.length + 2 > size) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
    // 单个段落超长：硬切，保留 overlap
    while (buf.length > size) {
      chunks.push(buf.slice(0, size));
      buf = buf.slice(size - overlap);
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export interface StructuredChunk {
  text: string;
  /** 该块所处的 Markdown 标题路径（如 ['第一章', '第一节']），无标题时为空数组 */
  path: string[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * 结构感知分块：识别 Markdown ATX 标题，按标题层级切分并记录标题路径。
 * 无标题的纯文本退化为与 chunkText 相同的段落分块（path 全为空）。
 * 标题路径后续用于「上下文检索」（contextual retrieval）构建章节上下文头。
 */
export function chunkStructured(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): StructuredChunk[] {
  const norm = text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!norm) return [];

  // 第一遍：按标题把全文切成 section（每个 section = 标题 + 正文），记录其标题栈
  const sections: { path: string[]; text: string }[] = [];
  const path: string[] = [];
  let lines: string[] = [];
  const flush = () => {
    const t = lines.join('\n').trim();
    if (t) sections.push({ path: path.slice(), text: t });
    lines = [];
  };

  for (const raw of norm.split('\n')) {
    const m = HEADING_RE.exec(raw);
    if (m) {
      flush();
      // 跳级标题（如 H1 → H3）按层下钻一层处理，避免产生路径空洞
      const level = Math.min(m[1].length, path.length + 1);
      path.length = level - 1;
      path[level - 1] = m[2];
      lines = [raw];
    } else {
      lines.push(raw);
    }
  }
  flush();

  // 第二遍：每个 section 内部仍按段落/超长硬切，块继承其标题路径
  const result: StructuredChunk[] = [];
  for (const sec of sections) {
    for (const piece of chunkText(sec.text, size, overlap)) {
      result.push({ text: piece, path: sec.path.slice() });
    }
  }
  return result;
}

/** 统计：块数 + 平均块长（测试用） */
export function chunkStats(chunks: string[]): { count: number; avgSize: number; minSize: number } {
  if (chunks.length === 0) return { count: 0, avgSize: 0, minSize: 0 };
  const sizes = chunks.map((c) => c.length);
  return {
    count: chunks.length,
    avgSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
    minSize: Math.min(...sizes),
  };
}