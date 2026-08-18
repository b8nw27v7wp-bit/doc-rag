/**
 * BM25 关键词检索（零依赖）。
 * 设计与动机：
 *  - 向量检索擅长语义相似，但对专有名词/精确术语（如「贝尔不等式」「GLM-4」）迟钝；
 *    关键词检索正好互补，两者 RRF 融合可显著提升召回。
 *  - 中文分词不做第三方依赖：CJK 连续串按滑窗 bigram 切分，单字兜底（前缀区分权重）。
 */

export interface BM25Doc {
  index: number;
  text: string;
}

export interface BM25Hit {
  index: number;
  score: number;
}

/**
 * Token 化：英文/数字词（w: 前缀）+ 中文 bigram（b: 前缀）+ 中文单字兜底（c: 前缀）。
 * 前缀让三类 token 互不冲突；单字 df 高、idf 低，天然权重小。
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  for (const m of lower.matchAll(/[a-z0-9]+/g)) {
    tokens.push(`w:${m[0]}`);
  }
  for (const seq of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i < seq.length - 1; i++) {
      tokens.push(`b:${seq.slice(i, i + 2)}`);
    }
    for (const ch of new Set(seq)) {
      tokens.push(`c:${ch}`);
    }
  }
  return tokens;
}

const K1 = 1.5;
const B = 0.75;

export class BM25Index {
  private readonly tokenized: string[][];
  private readonly df = new Map<string, number>();
  private readonly avgdl: number;
  private readonly N: number;

  constructor(docs: BM25Doc[]) {
    this.N = docs.length;
    this.tokenized = docs.map((d) => tokenize(d.text));
    const totalLen = this.tokenized.reduce((a, t) => a + t.length, 0);
    this.avgdl = totalLen / Math.max(1, this.N);
    const seen = new Set<string>();
    for (const toks of this.tokenized) {
      seen.clear();
      for (const t of toks) {
        if (!seen.has(t)) {
          seen.add(t);
          this.df.set(t, (this.df.get(t) ?? 0) + 1);
        }
      }
    }
  }

  search(query: string, k: number): BM25Hit[] {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    const scores = new Map<number, number>();
    const idfCache = new Map<string, number>();
    const uniqueQ = [...new Set(qTokens)];
    for (const t of uniqueQ) {
      let idf = idfCache.get(t);
      if (idf === undefined) {
        const df = this.df.get(t) ?? 0;
        // 平滑 idf，避免除零；df 过高（超半数字档）时自然压低
        idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
        idfCache.set(t, idf);
      }
      if (idf <= 0) continue;
      for (let i = 0; i < this.tokenized.length; i++) {
        const toks = this.tokenized[i];
        const tf = countOf(toks, t);
        if (tf === 0) continue;
        const denom = tf + K1 * (1 - B + B * (toks.length / this.avgdl));
        scores.set(i, (scores.get(i) ?? 0) + (idf * (tf * (K1 + 1))) / denom);
      }
    }
    return [...scores.entries()]
      .map(([index, score]) => ({ index, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

function countOf(arr: string[], target: string): number {
  let n = 0;
  for (const x of arr) if (x === target) n++;
  return n;
}