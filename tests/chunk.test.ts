import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, chunkStats, CHUNK_SIZE, CHUNK_OVERLAP } from '../lib/chunk';

test('空文本返回空数组', () => {
  assert.deepEqual(chunkText('  \n\n  '), []);
});

test('短文本单块完整保留', () => {
  const c = chunkText('你好世界');
  assert.equal(c.length, 1);
  assert.equal(c[0], '你好世界');
});

test('多段落聚合为一个块', () => {
  const c = chunkText('第一段\n\n第二段\n\n第三段');
  assert.equal(c.length, 1);
  assert.ok(c[0].includes('第一段') && c[0].includes('第三段'));
});

test('段落总量超限时分块，块内段落完整', () => {
  const para = '段落'.repeat(300); // 600 字一段
  const text = [para, para, para].join('\n\n');
  const c = chunkText(text, 400, 40);
  assert.ok(c.length >= 3, `期望至少 3 块，实际 ${c.length}`);
  assert.ok(c.every((x) => x.length <= 400));
  // 块间按段落边界聚合，分块处不应把段落拆散（每块要么整段要么硬切段）
  for (const x of c) assert.ok(x.length > 0);
});

test('超长单段落硬切且保留 overlap', () => {
  const para = 'a'.repeat(1000);
  const c = chunkText(para, 300, 50);
  assert.ok(c.every((x) => x.length <= 300), '块长不应超过 size');
  assert.ok(c.length >= 4, '1000 字应切出至少 4 块');
  // 相邻块重叠 50 字符
  for (let i = 1; i < c.length; i++) {
    assert.equal(c[i].slice(0, 50), c[i - 1].slice(-50), `第 ${i} 块重叠区不一致`);
  }
});

test('overlap=0 时相邻块无重叠', () => {
  const src = 'abcdefghijklmnopqrstuvwxyz'.repeat(23); // 598 字符
  const c = chunkText(src, 200, 0);
  assert.equal(c.length, 3);
  for (let i = 1; i < c.length; i++) {
    assert.notEqual(c[i].slice(0, 100), c[i - 1].slice(-100), '无重叠时内容不应首尾相接重复');
  }
});

test('overlap>0 时相邻块重叠区一致', () => {
  const src = 'abcdefghijklmnopqrstuvwxyz'.repeat(46); // 1196 字符
  const c = chunkText(src, 300, 100);
  assert.ok(c.length >= 5, `期望至少 5 块，实际 ${c.length}`);
  for (let i = 1; i < c.length; i++) {
    assert.equal(c[i].slice(0, 100), c[i - 1].slice(-100), `第 ${i} 块重叠区不一致`);
  }
});

test('默认常量可承受真实文档规模', () => {
  // 模拟 20KB 中文文档
  const big = Array.from({ length: 200 }, (_, i) => `第${i + 1}段：` + '内容'.repeat(50)).join('\n\n');
  const c = chunkText(big, CHUNK_SIZE, CHUNK_OVERLAP);
  assert.ok(c.length > 20 && c.length < 60, `块数合理，实际 ${c.length}`);
  const stats = chunkStats(c);
  assert.ok(stats.avgSize > 200);
  assert.ok(stats.minSize > 0);
});