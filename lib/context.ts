/**
 * 邻块上下文扩展：单个检索块往往只是答案片段，把同文档相邻块并入上下文，
 * 让 LLM 看到完整论述，减少断章取义与答非所问。
 *
 * 拼接顺序以中心块优先（保证完整中心文本不被截断），再按距离依次附加右侧/左侧邻块；
 * 超出长度上限时从尾部截断，仅丢弃最外围的补充内容。
 */
export interface ChunkRef {
  docId: number;
  idx: number;
  text: string;
}

export const CONTEXT_RADIUS = 1;
/** 扩展后拼接文本的长度上限（字符），超出从尾部截断 */
export const CONTEXT_MAX_CHARS = 800;

/**
 * 为每个中心块生成合并了相邻块（同 docId，idx±radius）的完整上下文文本。
 * @param all      检索范围内按原始顺序排列的全部块（含 docId 与 idx）
 * @param centers  选中的中心块
 * @param radius   相邻块半径
 * @returns 与 centers 一一对应的扩展文本
 */
export function withNeighborContext(all: ChunkRef[], centers: ChunkRef[], radius = CONTEXT_RADIUS): string[] {
  const byDoc = new Map<number, ChunkRef[]>();
  for (const c of all) {
    const arr = byDoc.get(c.docId);
    if (arr) arr.push(c);
    else byDoc.set(c.docId, [c]);
  }
  for (const arr of byDoc.values()) arr.sort((a, b) => a.idx - b.idx);

  return centers.map((center) => {
    const arr = byDoc.get(center.docId) ?? [center];
    // 中心块在按 idx 排序数组中的位置；找不到时退化为仅中心文本
    const pos = arr.findIndex((c) => c.idx === center.idx);
    const parts: string[] = [center.text];
    if (pos >= 0) {
      for (let r = 1; r <= radius; r++) {
        const right = arr[pos + r];
        if (right) parts.push(right.text);
        const left = arr[pos - r];
        if (left) parts.push(left.text);
      }
    }
    return trimToFit(parts.join('\n\n'), CONTEXT_MAX_CHARS);
  });
}

function trimToFit(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}