import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRefs, buildRagMessages, RAG_TOP_K } from '../lib/rag';

test('提取引用编号：去重 + 升序', () => {
  const refs = extractRefs('见 [3] 与 [1]，再次引用 [3] 和 [2]');
  assert.deepEqual(refs, [1, 2, 3]);
});

test('无引用返回空数组', () => {
  assert.deepEqual(extractRefs('这里没有引用标记'), []);
});

test('越界编号也会被提取（由调用方与 sources 比对过滤）', () => {
  const refs = extractRefs('引用 [9]');
  assert.deepEqual(refs, [9]);
});

test('buildRagMessages 组装资料与提问，编号从 1 开始', () => {
  const msgs = buildRagMessages('什么是 FFT？', [
    { n: 1, docName: '信号处理.md', idx: 0, text: 'FFT 是快速傅里叶变换。', score: 0.9 },
    { n: 2, docName: '信号处理.md', idx: 3, text: '维基百科说 FFT 用于频谱分析。', score: 0.8 },
  ]);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('[1]'), '资料应带编号');
  assert.ok(msgs[1].content.includes('【信号处理.md】') || msgs[1].content.includes('《信号处理.md》'));
  assert.ok(msgs[1].content.endsWith('什么是 FFT？'));
});

test('RAG 常量合理', () => {
  assert.ok(RAG_TOP_K >= 4 && RAG_TOP_K <= 8, 'top-k 取 4~8 之间');
});