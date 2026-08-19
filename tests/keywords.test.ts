import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topKeywords } from '../lib/keywords';

test('topKeywords：高频词优先、去重、返回原文词', () => {
  const kw = topKeywords('文档管理系统 文档管理 文档管理 向量检索');
  assert.ok(kw.includes('文档'), '高频 bigram 应在关键词中');
  assert.ok(new Set(kw).size === kw.length, '无重复');
  assert.ok(kw.every((k) => typeof k === 'string' && k.length > 0));
});

test('topKeywords：词频明显更高的词排在最前', () => {
  assert.equal(topKeywords('graph graph graph vector', 4)[0], 'graph');
});

test('topKeywords：中文 bigram 关键词可提取', () => {
  const kw = topKeywords('量子纠缠与贝尔不等式实验验证了量子纠缠存在的里程碑成果');
  assert.ok(kw.includes('量子纠缠') || kw.includes('纠缠'), '应包含高频中文词');
});

test('topKeywords：空文本返回空', () => {
  assert.deepEqual(topKeywords(''), []);
});

test('topKeywords：n 限制输出数量', () => {
  const text = '苹果 香蕉 橙子 西瓜 葡萄 草莓 蓝莓 芒果 柠檬 樱桃';
  assert.ok(topKeywords(text, 5).length <= 5);
});