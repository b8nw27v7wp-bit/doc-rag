/** 向量工具：余弦相似度（向量已归一化时即点积）+ 前 k 检索 */

/** 点积（嵌入已归一化，等效余弦相似度）；长度不等时按较短维度截断计算 */
export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export interface ScoredHit {
  index: number;
  score: number;
}

/** 返回与 query 最相似的前 k 个向量下标，过滤低于 minScore 的结果 */
export function topK(vectors: Float32Array[], query: Float32Array, k: number, minScore = 0.18): ScoredHit[] {
  const scored: ScoredHit[] = [];
  for (let i = 0; i < vectors.length; i++) {
    const s = dot(vectors[i], query);
    if (s >= minScore) scored.push({ index: i, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Float32Array ↔ Uint8Array 互转（存 SQLite BLOB 用） — 拷贝隔离，避免与 SQLite 共享 Buffer 复用导致别名破坏；BLOB 按小端序读写（Node 平台约定） */
export function f32ToBytes(v: Float32Array): Uint8Array {
  const copy = new Uint8Array(v.byteLength);
  copy.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  return copy;
}

export function bytesToF32(b: Uint8Array): Float32Array {
  if (b.byteLength % 4 !== 0) {
    // 截断到 4 字节对齐（异常输入防护，正常 BLOB 恒为 4 倍数）
    const aligned = b.byteLength - (b.byteLength % 4);
    const copy = new Uint8Array(aligned);
    copy.set(b.subarray(0, aligned));
    return new Float32Array(copy.buffer, 0, aligned / 4);
  }
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}