import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recallAtK, precisionAtK, mrr } from '../lib/eval';

test('recallAtK：前 k 命中相关项比例', () => {
  const predicted = [0, 1, 2, 3];
  const relevant = [2, 9];
  assert.equal(recallAtK(predicted, relevant, 3), 0.5);
  assert.equal(recallAtK(predicted, relevant, 4), 0.5); // 9 不在结果中
});

test('recallAtK：无相关项返回 1（避免除零）', () => {
  assert.equal(recallAtK([0, 1], [], 2), 1);
});

test('precisionAtK：前 k 中相关占比', () => {
  const predicted = [0, 1, 2, 3];
  const relevant = [1, 2, 9];
  assert.equal(precisionAtK(predicted, relevant, 3), 2 / 3);
});

test('mrr：首个相关项排名倒数', () => {
  assert.equal(mrr([5, 0, 2], [2]), 1 / 3);
  assert.equal(mrr([0, 1], [0]), 1);
  assert.equal(mrr([0, 1], [9]), 0);
});