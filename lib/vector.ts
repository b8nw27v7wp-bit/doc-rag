/** 向量工具：余弦相似度（向量已归一化时即点积）+ 前 k 检索 */

/** 点积（嵌入已归一化，等效余弦相似度） */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export interface ScoredHit {
  index: number;
  score: number;
}

/** 返回与 query 最相似的前 k 个向量下标，过滤低于 minScore 的结果 */
export function topK(vectors: Float32Array[], query: Float32Array, k: number, minScore = 0.18): ScoredHit[] {
  const scored: ScoredHit[] = vectors.map((v, index) => ({ index, score: dot(v, query) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((h) => h.score >= minScore).slice(0, k);
}

/** Float32Array ↔ Uint8Array 互转（存 SQLite BLOB 用） */
export function f32ToBytes(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export function bytesToF32(b: Uint8Array): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}