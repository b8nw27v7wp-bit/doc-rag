import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSsePayload } from '../lib/llm';

test('parseSsePayload：解析 delta 内容', () => {
  const p = parseSsePayload('{"choices":[{"delta":{"content":"你好"}}]}');
  assert.equal(p.delta, '你好');
  assert.equal(p.reasoning, undefined);
});

test('parseSsePayload：解析 reasoning_content（推理模型）', () => {
  const p = parseSsePayload('{"choices":[{"delta":{"reasoning_content":"让我想想"}}]}');
  assert.equal(p.reasoning, '让我想想');
  assert.equal(p.delta, undefined);
});

test('parseSsePayload：非法 JSON / 空 choices 返回空对象', () => {
  assert.deepEqual(parseSsePayload('not-json'), {});
  assert.deepEqual(parseSsePayload('{"choices":[]}'), { delta: undefined, reasoning: undefined });
});