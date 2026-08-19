import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmrSelect, type RankItem } from '../lib/rerank';

function v(...xs: number[]): Float32Array {
  return new Float32Array(xs);
}

test('MMR：相关性最高者优先入选', () => {
  const items: RankItem[] = [
    { index: 0, score: 3, vector: v(1, 0, 0) },
    { index: 1, score: 1, vector: v(0, 1, 0) },
    { index: 2, score: 2, vector: v(0, 0, 1) },
  ];
  const res = mmrSelect({ items, k: 3 });
  assert.equal(res[0].index, 0, '最高分先入选');
  assert.deepEqual(
    res.map((r) => r.index).sort(),
    [0, 1, 2],
    '返回全部项（顺序可能不同）'
  );
});

test('MMR：相似冗余块被多样性惩罚，选出差异大的块', () => {
  // 0 与 1 向量几乎相同（冗余），2 差异大
  const items: RankItem[] = [
    { index: 0, score: 1.0, vector: v(1, 0) },
    { index: 1, score: 0.9, vector: v(0.99, 0.01) },
    { index: 2, score: 0.6, vector: v(0, 1) },
  ];
  const res = mmrSelect({ items, k: 2 });
  assert.deepEqual(
    res.map((r) => r.index),
    [0, 2],
    '首块冗余的 1 被跳过，选差异大的 2'
  );
});

test('MMR：lambda 越低越偏多样性', () => {
  const items: RankItem[] = [
    { index: 0, score: 1.0, vector: v(1, 0) },
    { index: 1, score: 0.99, vector: v(0.999, 0.001) },
    { index: 2, score: 0.5, vector: v(0, 1) },
  ];
  // 默认 lambda=0.7 时 0.99 相关性足够高，仍会选冗余块
  assert.deepEqual(mmrSelect({ items, k: 2 }).map((r) => r.index), [0, 1]);
  // lambda=0.5 时多样性优先，跳过冗余块选差异大的 2
  assert.deepEqual(mmrSelect({ items, k: 2, lambda: 0.5 }).map((r) => r.index), [0, 2]);
});

test('MMR：k 超过候选数时返回全部', () => {
  const items: RankItem[] = [
    { index: 0, score: 1, vector: v(1, 0) },
    { index: 1, score: 0.8, vector: v(0, 1) },
  ];
  assert.equal(mmrSelect({ items, k: 5 }).length, 2);
});

test('MMR：lambda=1 退化为纯按相关性排序', () => {
  const items: RankItem[] = [
    { index: 0, score: 0.5, vector: v(1, 0) },
    { index: 1, score: 0.9, vector: v(1, 0) },
    { index: 2, score: 0.7, vector: v(1, 0) },
  ];
  const res = mmrSelect({ items, k: 3, lambda: 1 });
  assert.deepEqual(
    res.map((r) => r.index),
    [1, 2, 0]
  );
});

test('MMR：空候选返回空', () => {
  assert.deepEqual(mmrSelect({ items: [], k: 3 }), []);
});

test('MMR：无向量时依赖自定义相似度', () => {
  const items: RankItem[] = [
    { index: 0, score: 1 },
    { index: 1, score: 0.9 },
  ];
  const res = mmrSelect({
    items,
    k: 2,
    similarity: (a, b) => (a.index === 0 && b.index === 0 ? 1 : 0),
  });
  assert.equal(res.length, 2);
  assert.equal(res[0].index, 0);
});