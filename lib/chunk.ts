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