/**
 * BM25 关键词检索（零依赖，倒排 posting 提速）。
 * 设计与动机：
 *  - 向量检索擅长语义相似，但对专有名词/精确术语（如「贝尔不等式」「GLM-4」）迟钝；
 *    关键词检索正好互补，两者 RRF 融合可显著提升召回。
 *  - 中文分词不做第三方依赖：CJK 连续串按滑窗 bigram 切分，单字兜底（前缀区分权重）。
 *  - 索引构建时同时生成 posting（token → 命中文档与 tf），查询只遍历命中文档，
 *    不再全库扫描（大库提速的主要来源），打分结果与逐文档扫描完全一致。
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
  // 全角字符归一化为半角，便于英文/数字匹配
  const normalized = text.toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const tokens: string[] = [];
  for (const m of normalized.matchAll(/[a-z0-9]+/g)) {
    tokens.push(`w:${m[0]}`);
  }
  // 覆盖全部汉字（含扩展 A/B 等），使用 Unicode Script 属性
  for (const seq of normalized.match(/\p{Script=Han}+/gu) ?? []) {
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
  /** 各文档 token 序列（保留以便按文档长度归一） */
  private readonly tokenized: string[][];
  private readonly df = new Map<string, number>();
  /** token → 命中文档（doc index + tf），即倒排索引 */
  private readonly postings = new Map<string, Array<{ i: number; tf: number }>>();
  private readonly avgdl: number;
  private readonly N: number;

  constructor(docs: BM25Doc[]) {
    this.N = docs.length;
    this.tokenized = new Array(docs.length);
    let totalLen = 0;

    for (let i = 0; i < docs.length; i++) {
      const toks = tokenize(docs[i].text);
      this.tokenized[i] = toks;
      totalLen += toks.length;
      const local = new Map<string, number>();
      for (const t of toks) local.set(t, (local.get(t) ?? 0) + 1);
      for (const [t, tf] of local) {
        this.df.set(t, (this.df.get(t) ?? 0) + 1);
        const arr = this.postings.get(t);
        if (arr) arr.push({ i, tf });
        else this.postings.set(t, [{ i, tf }]);
      }
    }
    this.avgdl = totalLen / Math.max(1, this.N);
  }

  search(query: string, k: number): BM25Hit[] {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    const scores = new Map<number, number>();
    const uniqueQ = [...new Set(qTokens)];
    for (const t of uniqueQ) {
      const posting = this.postings.get(t);
      if (!posting || posting.length === 0) continue;
      const df = this.df.get(t) ?? 0;
      // 平滑 idf（Lucene 风格），恒 >0
      const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
      for (const { i, tf } of posting) {
        const denom = tf + K1 * (1 - B + B * (this.tokenized[i].length / this.avgdl));
        scores.set(i, (scores.get(i) ?? 0) + (idf * (tf * (K1 + 1))) / denom);
      }
    }
    return [...scores.entries()]
      .map(([index, score]) => ({ index, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}