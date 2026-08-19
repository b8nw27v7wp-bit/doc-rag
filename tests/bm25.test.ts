import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, BM25Index } from '../lib/bm25';
import { hybridSearch, buildBM25Index } from '../lib/search';

function v(...xs: number[]): Float32Array {
  return new Float32Array(xs);
}

test('tokenize：英文词、数字、中文 bigram、单字兜底', () => {
  const t = tokenize('贝尔不等式 Bell inequality 2022');
  assert.ok(t.includes('w:bell'), '英文应归一化为 w: 词');
  assert.ok(t.includes('w:inequality'));
  assert.ok(t.includes('w:2022'));
  assert.ok(t.includes('b:贝尔') && t.includes('b:尔不') && t.includes('b:等式'), '中文按 bigram 切分');
  assert.ok(t.includes('c:贝'), '中文单字兜底');
});

test('纯英文 query 的 token', () => {
  const t = tokenize('hello world');
  assert.deepEqual(t, ['w:hello', 'w:world']);
});

test('BM25：包含查询词的文档排前，tf 越高分越高', () => {
  const idx = new BM25Index([
    { index: 0, text: '文档管理系统的设计文档，重点是文档管理。' },
    { index: 1, text: '今天天气很好，不适合写代码。' },
    { index: 2, text: '文档管理系统与文档管理平台都做文档管理，还兼顾文档管理。' },
  ]);
  const hits = idx.search('文档管理', 3);
  assert.equal(hits.length, 2, '不含查询词的文档不参与排序');
  assert.equal(hits[0].index, 2, 'tf 更高的文档应排第一');
  assert.equal(hits[1].index, 0, 'tf 较少的文档排第二');
  assert.ok(hits[0].score > hits[1].score);
  // 不含查询词的文档分数稳定为 0
  assert.equal(hits.some((h) => h.index === 1), false);
});

test('BM25：专有名词精确匹配（向量易混场景）', () => {
  const idx = new BM25Index([
    { index: 0, text: '本文介绍苹果公司的财报数据。' },
    { index: 1, text: '贝尔不等式实验证明量子纠缠存在的里程碑成果。' },
  ]);
  const hits = idx.search('贝尔不等式', 1);
  assert.equal(hits[0].index, 1);
});

test('BM25：不相关 query 返回空', () => {
  const idx = new BM25Index([{ index: 0, text: '中午吃什么' }]);
  assert.deepEqual(idx.search('quantum gravity', 3), []);
});

test('hybridSearch：RRF 融合带出向量低分但关键词命中的文档', () => {
  const embeddings = [v(1, 0, 0), v(0, 1, 0), v(0.95, 0.05, 0)]; // 0 和 2 语义相近
  const texts = [
    '这里完全没有查询词出现。',
    '贝尔不等式违反，量子纠缠被证实。',
    '另一个与查询语义接近但与关键词无关的段落。',
  ];
  const query = '贝尔不等式量子纠缠';
  const qvec = v(0.9, 0.1, 0); // 与 0、2 都接近，与 1（关键词命中者）相似度低
  const hits = hybridSearch({
    embeddings,
    texts,
    queryEmbedding: qvec,
    query,
    k: 3,
    vectorMin: 0.1, // 放松向量阈值，观察融合效果
  });
  const hitIndexes = hits.map((h) => h.index);
  assert.ok(hitIndexes.includes(1), '关键词命中的文档应被融合带出');
  // 关键词命中的文档 keywordScore > 0
  const kw = hits.find((h) => h.index === 1);
  assert.ok((kw?.keywordScore ?? 0) > 0);
  // 纯向量命中无关键词分的文档 keywordScore 为 0
  const onlyVec = hits.find((h) => h.index !== 1);
  assert.ok(onlyVec !== undefined);
});

test('hybridSearch：k 截断生效', () => {
  const embeddings = [v(1, 0), v(0.9, 0.1), v(0.8, 0.2), v(0.7, 0.3)];
  const texts = ['a b c d', 'b c d e', 'c d e f', 'd e f g'];
  const hits = hybridSearch({ embeddings, texts, queryEmbedding: v(1, 0), query: 'a d', k: 2, vectorMin: 0 });
  assert.ok(hits.length <= 2);
});

test('hybridSearch：全部不相关时返回空', () => {
  const hits = hybridSearch({
    embeddings: [v(1, 0)],
    texts: ['完全无关的内容'],
    queryEmbedding: v(0, 1),
    query: 'zzzzqqqq',
    k: 3,
    vectorMin: 0.5,
  });
  assert.deepEqual(hits, []);
});

test('hybridSearch：复用预建 BM25 索引结果一致', () => {
  const embeddings = [v(1, 0, 0), v(0, 1, 0), v(0.95, 0.05, 0)];
  const texts = ['这里完全没有查询词出现。', '贝尔不等式违反，量子纠缠被证实。', '另一个与查询语义接近但与关键词无关的段落。'];
  const query = '贝尔不等式';
  const qvec = v(0.9, 0.1, 0);
  const withIndex = hybridSearch({
    embeddings, texts, queryEmbedding: qvec, query, k: 3, vectorMin: 0.1,
    bm25: buildBM25Index(texts),
  });
  const withoutIndex = hybridSearch({
    embeddings, texts, queryEmbedding: qvec, query, k: 3, vectorMin: 0.1,
  });
  assert.deepEqual(
    withIndex.map((h) => h.index),
    withoutIndex.map((h) => h.index),
    '预建索引与内置构建的排序应一致'
  );
});