import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePositiveInt, parseIdList, toBoundedString, parseTemperature } from '../lib/validate';

test('parsePositiveInt：合法/非法/越界', () => {
  assert.equal(parsePositiveInt(3, 10), 3);
  assert.equal(parsePositiveInt(0, 10), null);
  assert.equal(parsePositiveInt(-1, 10), null);
  assert.equal(parsePositiveInt(11, 10), null);
  assert.equal(parsePositiveInt('3', 10), null);
  assert.equal(parsePositiveInt(undefined), null);
});

test('parseIdList：逗号分隔、去重、剔除非法、上限', () => {
  assert.deepEqual(parseIdList('1,2,3', 10), [1, 2, 3]);
  assert.deepEqual(parseIdList('1,2,1,x,,0.5', 10), [1, 2]);
  assert.equal(parseIdList('1,2,3', 2), null);
  assert.equal(parseIdList('x', 10), null);
  assert.equal(parseIdList(123, 10), null);
});

test('toBoundedString：trim + 截断 + 空白拒绝', () => {
  assert.equal(toBoundedString('  hello  ', 10), 'hello');
  assert.equal(toBoundedString('长'.repeat(20), 10)?.length, 10);
  assert.equal(toBoundedString('   ', 10), null);
  assert.equal(toBoundedString(123, 10), null);
});

test('parseTemperature：范围校验与回退', () => {
  assert.equal(parseTemperature(0.7, null), 0.7);
  assert.equal(parseTemperature(3, null), null, '超上限返回回退值');
  assert.equal(parseTemperature(-1, 0.3), 0.3);
  assert.equal(parseTemperature(undefined, 0.5), 0.5);
});