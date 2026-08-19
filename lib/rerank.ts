/**
 * MMR（Maximal Marginal Relevance）多样性重排。
 * 混合检索 + RRF 融合可能同时返回多个来自同一段落/相近语义的冗余块，
 * MMR 在「相关性」与「多样性」之间平衡：优先挑相关性高、且与已选结果差异大的块。
 *
 * 相关性分数在内部先按最大值归一化到 [0,1]，使 lambda 可与相似度（0..1）同尺度叠加。
 */
export interface RankItem {
  /** 指向原始候选数组的下标 */
  index: number;
  /** 相关性分数（越大越相关，如 RRF 分数） */
  score: number;
  /** 可选向量，用于多样性相似度（默认用归一化向量的余弦/点积） */
  vector?: Float32Array;
  /** 可选文档 id：优先保证跨文档多样性可注入文档级惩罚 */
  docId?: number;
}

export interface MMRParams {
  items: RankItem[];
  k: number;
  /** 0..1，越大越偏相关性，越小越偏多样性 */
  lambda?: number;
  /** 自定义相似度（默认向量点积） */
  similarity?: (a: RankItem, b: RankItem) => number;
}

export const MMR_LAMBDA = 0.7;
export const MMR_DEFAULT_K = 6;

function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function defaultSimilarity(a: RankItem, b: RankItem): number {
  if (!a.vector || !b.vector) return 0;
  return dot(a.vector, b.vector);
}

/** 返回按 MMR 挑选出的项（保留原 index/score/vector 字段，顺序即最终顺序） */
export function mmrSelect(params: MMRParams): RankItem[] {
  const lambda = params.lambda ?? MMR_LAMBDA;
  const sim = params.similarity ?? defaultSimilarity;
  const pool = [...params.items];
  const maxScore = Math.max(...pool.map((i) => i.score), 1e-9);
  const selected: RankItem[] = [];

  while (selected.length < params.k && pool.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      let maxSim = 0;
      for (const s of selected) {
        maxSim = Math.max(maxSim, sim(it, s));
      }
      const rel = it.score / maxScore;
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestVal) {
        bestVal = mmr;
        bestIdx = i;
      }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected;
}