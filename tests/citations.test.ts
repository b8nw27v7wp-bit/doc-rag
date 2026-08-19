import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCitations } from '../lib/citations';

test('checkCitations：区分有效与越界引用', () => {
  const c = checkCitations('见 [1][2]，还有 [5] 和 [0]', 3);
  assert.deepEqual(c.valid, [1, 2]);
  assert.deepEqual(c.invalid, [0, 5], '越界引用按编号升序');
});

test('checkCitations：重复引用去重', () => {
  const c = checkCitations('[1] 再次 [1]，越界 [9][9]', 2);
  assert.deepEqual(c.valid, [1]);
  assert.deepEqual(c.invalid, [9]);
});

test('checkCitations：无引用返回空', () => {
  assert.deepEqual(checkCitations('没有任何引用', 3), { valid: [], invalid: [] });
});