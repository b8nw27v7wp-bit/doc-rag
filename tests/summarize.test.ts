import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryPrompt, SUMMARY_INPUT_LIMIT } from '../lib/summarize';

test('buildSummaryPrompt：system + 用户文本', () => {
  const msgs = buildSummaryPrompt('一篇关于向量检索的文档');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('向量检索'));
});

test('buildSummaryPrompt：超长输入截断到上限', () => {
  const long = 'x'.repeat(SUMMARY_INPUT_LIMIT + 1000);
  const msgs = buildSummaryPrompt(long);
  assert.equal(msgs[1].content.length, SUMMARY_INPUT_LIMIT);
});

test('buildSummaryPrompt：system 含中文摘要约束', () => {
  const msgs = buildSummaryPrompt('内容');
  assert.ok(msgs[0].content.includes('摘要'));
});