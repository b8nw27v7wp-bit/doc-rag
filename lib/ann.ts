/**
 * IVF-Lite 近似向量索引（纯 JS、零依赖、确定性）：
 * k-means 聚类把向量分到 nlist 个桶，查询时只探测与 query 最相近的 nprobe 个桶，
 * 把全量 O(N·d) 点积降为 O(nprobe/nlist·N·d)。向量已归一化，点积即余弦相似度。
 */
export interface AnnIndex {
  nlist: number;
  dim: number;
  /** 各簇质心（已归一化） */
  centroids: Float32Array[];
  /** 每个簇包含的向量下标 */
  buckets: number[][];
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  const out = new Float32Array(v.length);
  if (norm < 1e-9) {
    out.set(v);
    return out;
  }
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** 构建索引；nlist 缺省取 sqrt(N)（夹在 [1, n] 内） */
export function buildAnnIndex(
  vectors: Float32Array[],
  opts: { nlist?: number; iterations?: number; seed?: number } = {}
): AnnIndex {
  const n = vectors.length;
  if (n === 0) return { nlist: 0, dim: 0, centroids: [], buckets: [] };
  const dim = vectors[0].length;
  const nlist = Math.max(1, Math.min(opts.nlist ?? Math.round(Math.sqrt(n)), n));
  const iterations = opts.iterations ?? 10;
  const rand = lcg(opts.seed ?? 42);

  // 随机挑选 nlist 个互不相同的向量作初始质心
  const centroids: Float32Array[] = [];
  const used = new Set<number>();
  while (centroids.length < nlist) {
    const idx = Math.floor(rand() * n);
    if (!used.has(idx)) {
      used.add(idx);
      centroids.push(vectors[idx].slice());
    }
  }

  const assign = (): number[][] => {
    const buckets: number[][] = Array.from({ length: nlist }, () => []);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < nlist; c++) {
        const s = dot(vectors[i], centroids[c]);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      buckets[best].push(i);
    }
    return buckets;
  };

  let buckets: number[][] = [];
  for (let it = 0; it < iterations; it++) {
    buckets = assign();
    for (let c = 0; c < nlist; c++) {
      const members = buckets[c];
      if (members.length === 0) continue;
      const mean = new Float32Array(dim);
      for (const i of members) {
        const v = vectors[i];
        for (let d = 0; d < dim; d++) mean[d] += v[d];
      }
      for (let d = 0; d < dim; d++) mean[d] /= members.length;
      centroids[c] = normalize(mean);
    }
  }
  buckets = assign(); // 最终质心与桶保持一致

  return { nlist, dim, centroids, buckets };
}

/** 探测与 query 最近的前 nprobe 个桶，返回候选向量下标（去重、无序） */
export function annCandidateIndices(ann: AnnIndex, query: Float32Array, nprobe: number): number[] {
  if (ann.nlist === 0) return [];
  const scored = ann.centroids.map((c, i) => ({ i, s: dot(c, query) }));
  scored.sort((a, b) => b.s - a.s);
  const out: number[] = [];
  const probe = Math.min(Math.max(1, nprobe), ann.nlist);
  for (let p = 0; p < probe; p++) {
    out.push(...ann.buckets[scored[p].i]);
  }
  return [...new Set(out)];
}

/** 推荐参数：nlist=sqrt(N)（≤256），nprobe≈max(2, nlist/8) */
export function recommendedAnnParams(n: number): { nlist: number; nprobe: number } {
  const nlist = Math.max(2, Math.min(Math.round(Math.sqrt(n)), 256));
  const nprobe = Math.max(2, Math.round(nlist / 8));
  return { nlist, nprobe };
}