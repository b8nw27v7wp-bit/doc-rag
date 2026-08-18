/**
 * 混合检索：向量语义检索 + BM25 关键词检索，RRF（Reciprocal Rank Fusion）融合。
 * RRF 只依赖排名无需分数归一，对两种分数尺度不同的检索器天然友好。
 */
import { topK } from './vector';
import { BM25Index } from './bm25';

export interface FusionHit {
  index: number;
  vectorScore: number;
  keywordScore: number;
  rrf: number;
}

export interface HybridParams {
  embeddings: Float32Array[];
  texts: string[];
  queryEmbedding: Float32Array;
  query: string;
  k?: number;
  vectorMin?: number;
  rrfK?: number;
}

const RRF_K = 60;

export function hybridSearch(params: HybridParams): FusionHit[] {
  const k = params.k ?? 6;
  // 各检索器多取一些候选再融合（避免 top-k 截断漏掉单侧高排名项）
  const candidateN = Math.max(k * 3, 12);
  const vecHits = topK(params.embeddings, params.queryEmbedding, candidateN, params.vectorMin ?? 0.18);
  const bm25 = new BM25Index(params.texts.map((text, index) => ({ index, text })));
  const kwHits = bm25.search(params.query, candidateN);
  const rrfK = params.rrfK ?? RRF_K;

  const agg = new Map<number, { rrf: number; vectorScore: number; keywordScore: number }>();
  vecHits.forEach((h, rank) => {
    const cur = agg.get(h.index) ?? { rrf: 0, vectorScore: h.score, keywordScore: 0 };
    cur.rrf += 1 / (rrfK + rank + 1);
    agg.set(h.index, cur);
  });
  kwHits.forEach((h, rank) => {
    const cur = agg.get(h.index) ?? { rrf: 0, vectorScore: 0, keywordScore: h.score };
    cur.rrf += 1 / (rrfK + rank + 1);
    cur.keywordScore = Math.max(cur.keywordScore, h.score);
    agg.set(h.index, cur);
  });

  return [...agg.entries()]
    .map(([index, v]) => ({
      index,
      vectorScore: Math.round(v.vectorScore * 100) / 100,
      keywordScore: Math.round(v.keywordScore * 100) / 100,
      rrf: v.rrf,
    }))
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, k);
}