import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryLines, buildQueryExpansionPrompt, MAX_QUERIES } from '../lib/multiQuery';

test('parseQueryLines 解析数字与项目符号编号行', () => {
  const out = parseQueryLines('1. 查询一\n2. 查询二\n- 查询三');
  assert.deepEqual(out, ['查询一', '查询二', '查询三']);
});

test('parseQueryLines 去重并过滤空行', () => {
  const out = parseQueryLines('1. 甲\n2. 甲\n3. 乙\n\n');
  assert.deepEqual(out, ['甲', '乙']);
});

test('parseQueryLines 无编号时回退按行拆分', () => {
  const out = parseQueryLines('无编号查询一\n无编号查询二');
  assert.deepEqual(out, ['无编号查询一', '无编号查询二']);
});

test('parseQueryLines 空文本返回空', () => {
  assert.deepEqual(parseQueryLines(''), []);
});

test('buildQueryExpansionPrompt 含问题与数量上限', () => {
  const msgs = buildQueryExpansionPrompt('什么是量子纠缠');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('什么是量子纠缠'));
  assert.ok(msgs[1].content.includes(String(MAX_QUERIES)));
});

test('MAX_QUERIES 常量合理（1~5）', () => {
  assert.ok(MAX_QUERIES >= 1 && MAX_QUERIES <= 5);
});