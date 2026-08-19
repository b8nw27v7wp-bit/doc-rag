import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMultiSearch, type FusionHit } from '../lib/search';

function hit(index: number, vectorScore: number, keywordScore = 0): FusionHit {
  return { index, vectorScore, keywordScore, rrf: 0 };
}

test('mergeMultiSearch：多查询命中同一块时跨查询累积、排名更高', () => {
  const qa = [hit(0, 0.9), hit(1, 0.8)];
  const qb = [hit(1, 0.8), hit(2, 0.7)];
  const merged = mergeMultiSearch([qa, qb], 3);
  assert.equal(merged[0].index, 1, '同时被两查询命中的块应排第一');
  assert.equal(merged.length, 3);
});

test('mergeMultiSearch：命中块分数取各查询最大值', () => {
  const qa = [hit(0, 0.5), hit(1, 0.4, 0.9)];
  const qb = [hit(1, 0.7, 0.2)];
  const merged = mergeMultiSearch([qa, qb], 3);
  const one = merged.find((m) => m.index === 1)!;
  assert.equal(one.vectorScore, Math.max(0.4, 0.7));
  assert.equal(one.keywordScore, Math.max(0.9, 0.2));
});

test('mergeMultiSearch：k 截断生效', () => {
  const qa = [hit(0, 0.9), hit(1, 0.8), hit(2, 0.7)];
  assert.equal(mergeMultiSearch([qa], 2).length, 2);
});

test('mergeMultiSearch：空查询列表返回空', () => {
  assert.deepEqual(mergeMultiSearch([], 3), []);
});