import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRefs, refsToMarkdown, sessionToMarkdown, sessionsToMarkdown } from '../lib/export';

const REF = { n: 1, docName: '信号处理.md', idx: 0, text: 'FFT 是快速傅里叶变换。' };

test('normalizeRefs：数组 / JSON 字符串 / 非法 / 空', () => {
  assert.deepEqual(normalizeRefs([REF]), [REF]);
  assert.deepEqual(normalizeRefs(JSON.stringify([REF])), [REF]);
  assert.deepEqual(normalizeRefs('not-json'), []);
  assert.deepEqual(normalizeRefs(undefined), []);
  assert.deepEqual(normalizeRefs(''), []);
});

test('refsToMarkdown 含文档名与段号', () => {
  const md = refsToMarkdown([REF]);
  assert.ok(md.includes('[1]'));
  assert.ok(md.includes('《信号处理.md》'));
  assert.ok(md.includes('第 1 段'));
});

test('sessionToMarkdown：标题 + 问答 + 引用', () => {
  const md = sessionToMarkdown('示例会话', [
    { role: 'user', content: '什么是 FFT？' },
    { role: 'assistant', content: 'FFT 是傅里叶变换[1]。', refs: [REF] },
  ]);
  assert.ok(md.startsWith('# 示例会话'));
  assert.ok(md.includes('## 提问'));
  assert.ok(md.includes('## 回答'));
  assert.ok(md.includes('什么是 FFT？'));
  assert.ok(md.includes('FFT 是傅里叶变换[1]。'));
  assert.ok(md.includes('引用来源'));
});

test('sessionToMarkdown：无引用不输出来源段', () => {
  const md = sessionToMarkdown('T', [{ role: 'user', content: 'hi' }]);
  assert.ok(!md.includes('引用来源'));
});

test('sessionsToMarkdown 合并多个会话', () => {
  const md = sessionsToMarkdown([
    { title: 'A', messages: [{ role: 'user', content: 'x' }] },
    { title: 'B', messages: [{ role: 'user', content: 'y' }] },
  ]);
  assert.ok(md.includes('# A'));
  assert.ok(md.includes('# B'));
});

test('sessionToMarkdown 引用若为字符串 JSON 也能解析', () => {
  const md = sessionToMarkdown('T', [
    { role: 'assistant', content: '答 [1]', refs: JSON.stringify([REF]) },
  ]);
  assert.ok(md.includes('引用来源'));
  assert.ok(md.includes('《信号处理.md》'));
});