import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dot, topK, f32ToBytes, bytesToF32 } from '../lib/vector';

function v(...xs: number[]): Float32Array {
  return new Float32Array(xs);
}

test('正交向量点积为 0', () => {
  assert.equal(dot(v(1, 0), v(0, 1)), 0);
});

test('归一化向量自点积约等于 1', () => {
  assert.ok(Math.abs(dot(v(0.6, 0.8), v(0.6, 0.8)) - 1) < 1e-6);
});

test('负向量点积为负', () => {
  assert.ok(dot(v(1, 0), v(-1, 0)) < 0);
});

test('topK 按相似度排序并过滤低分', () => {
  const q = v(1, 0);
  const vecs = [v(0.9, 0.1), v(0.99, 0.01), v(0.1, 0.9)];
  const hits = topK(vecs, q, 2, 0.5);
  assert.deepEqual(
    hits.map((h) => h.index),
    [1, 0]
  );
});

test('topK k 截断生效', () => {
  const q = v(1, 0);
  const vecs = [v(0.9, 0.1), v(0.8, 0.2), v(0.7, 0.3)];
  const hits = topK(vecs, q, 1, 0);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].index, 0);
});

test('全部低分返回空', () => {
  assert.deepEqual(topK([v(0.1, 0.9)], v(1, 0), 1, 0.5), []);
});

test('BLOB 往返一致', () => {
  const a = v(0.1, 0.2, 0.3, -0.5, 1);
  const round = bytesToF32(f32ToBytes(a));
  assert.deepEqual(Array.from(round), Array.from(a));
});