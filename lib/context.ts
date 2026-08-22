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
/** 扩展后拼接文本的长度上限（字符），超出从尾部截断
 * 需 ≥ 2×CHUNK_SIZE(600) 以保证满长块的邻块扩展能生效；取 1500 可容纳中心块 + 单侧邻块，兼顾 LLM 上下文长度 */
export const CONTEXT_MAX_CHARS = 1500;

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
    const pos = arr.findIndex((c) => c.idx === center.idx);
    if (pos < 0) return trimToFit(center.text, CONTEXT_MAX_CHARS);
    const window: ChunkRef[] = [center];
    for (let r = 1; r <= radius; r++) {
      const right = arr[pos + r];
      if (right) window.push(right);
      const left = arr[pos - r];
      if (left) window.push(left);
    }
    // 按原文顺序排序，保证时间线正确；中心块已在 window 中，确保不会被截断丢失
    window.sort((a, b) => a.idx - b.idx);
    // 若超长，优先保留中心及其最近邻，逐步剔除最远块直到fits
    let text = window.map((c) => c.text).join('\n\n');
    if (text.length > CONTEXT_MAX_CHARS) {
      const sortedByDist = [...window].sort((a, b) => Math.abs(a.idx - center.idx) - Math.abs(b.idx - center.idx));
      // 从最远端开始剔除，直到fits（始终保留中心）
      const keep = [...sortedByDist];
      while (keep.length > 1) {
        const candidate = [...keep].sort((a, b) => a.idx - b.idx).map((c) => c.text).join('\n\n');
        if (candidate.length <= CONTEXT_MAX_CHARS) {
          text = candidate;
          break;
        }
        // 移除距离最远的块
        keep.pop();
      }
      if (keep.length === 1) {
        text = trimToFit(keep[0].text, CONTEXT_MAX_CHARS);
      } else if (text.length > CONTEXT_MAX_CHARS) {
        text = trimToFit(text, CONTEXT_MAX_CHARS);
      }
    }
    return text;
  });
}

function trimToFit(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}