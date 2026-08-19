/**
 * 文档关键词提取：基于 BM25 同款 tokenizer 的词频加权，零依赖、零 LLM 成本。
 * 入库时生成，作为文档「标签」便于浏览与索引。
 */
import { tokenize } from './bm25';

/**
 * 提取文本高频关键词（去重、按权重降序）。
 * 权重 = 词频 × 词长对数（词越长越具区分度；单字兜底权重低）。
 */
export function topKeywords(text: string, n = 8): string[] {
  const tf = new Map<string, number>();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);

  const scored: { term: string; score: number }[] = [];
  for (const [tok, count] of tf) {
    const kind = tok[0]; // w / b / c
    const term = tok.slice(2);
    const lenWeight = kind === 'w' ? Math.log(1 + term.length) : kind === 'b' ? Math.log(3) : Math.log(2);
    scored.push({ term, score: count * lenWeight });
  }
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scored) {
    if (seen.has(s.term)) continue;
    seen.add(s.term);
    out.push(s.term);
    if (out.length >= n) break;
  }
  return out;
}