/**
 * 上下文检索（Contextual Retrieval）：在嵌入前为每个块拼接一条「上下文头」，
 * 说明该块出自哪篇文档、哪个章节、处于什么位置。这让向量携带结构信息，
 * 查询时即使原文措辞不同，也能借文档名/章节名拉近语义距离（Anthropic 2024 提出的检索优化）。
 *
 * 上下文头只参与 embedding 与分块存储，回答正文仍展示原始 text。
 */
export function buildContext(docName: string, path: string[], idx: number, total: number): string {
  const parts = [`《${docName}》`];
  if (path.length > 0) parts.push(path.join(' › '));
  parts.push(`第 ${idx + 1}/${total} 段`);
  return parts.join(' · ');
}

/** 生成参与 embedding 的文本：上下文头 + 原文 */
export function contextualize(docName: string, path: string[], idx: number, total: number, text: string): string {
  return `${buildContext(docName, path, idx, total)}\n\n${text}`;
}