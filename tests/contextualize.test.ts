import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, contextualize } from '../lib/contextualize';

test('buildContext 含文档名、章节路径与位置', () => {
  const c = buildContext('信号处理.md', ['第一章', '傅里叶'], 2, 10);
  assert.ok(c.includes('《信号处理.md》'));
  assert.ok(c.includes('第一章 › 傅里叶'));
  assert.ok(c.includes('第 3/10 段'));
});

test('buildContext 无章节路径时仅文档名与位置', () => {
  const c = buildContext('笔记.txt', [], 0, 4);
  assert.ok(c.includes('《笔记.txt》'));
  assert.ok(c.includes('第 1/4 段'));
  assert.ok(!c.includes('›'));
});

test('contextualize 将上下文头置于原文之前', () => {
  const out = contextualize('手册.md', ['附录'], 0, 3, '正文内容');
  assert.ok(out.startsWith('《手册.md》'));
  assert.ok(out.endsWith('正文内容'));
  const idx = out.indexOf('正文内容');
  assert.ok(out.slice(0, idx).includes('附录'));
});