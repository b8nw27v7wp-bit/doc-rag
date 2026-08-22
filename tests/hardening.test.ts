/**
 * 新增硬化测试：校验输入校验、SSRF 增强、限流工具、分片历史截断等边界
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// validate
import { parseDocIds, parsePagination, parsePositiveInt, toBoundedString } from '../lib/validate';
import { validateBaseURL, isLocalBaseURL } from '../lib/ssrf';
import { createRateLimiter, clientIpKey } from '../lib/rateLimit';
import { buildRagMessages, HISTORY_MAX_CHARS } from '../lib/rag';

test('parseDocIds：数组校验与上限', () => {
  assert.deepEqual(parseDocIds([1, 2, 3]), [1, 2, 3]);
  assert.equal(parseDocIds([0]), null);
  assert.equal(parseDocIds([1.5]), null);
  assert.equal(parseDocIds('1,2' as unknown as number[]), null);
  assert.deepEqual(parseDocIds([1, 1, 2]), [1, 2]);
  assert.equal(parseDocIds(Array.from({ length: 201 }, (_, i) => i + 1)), null);
});

test('parsePagination：合法与非法', () => {
  const ok = parsePagination(new URLSearchParams('limit=10&offset=5'));
  assert.deepEqual(ok, { limit: 10, offset: 5 });
  assert.equal(parsePagination(new URLSearchParams('limit=0')), null);
  assert.equal(parsePagination(new URLSearchParams('limit=501')), null);
  assert.equal(parsePagination(new URLSearchParams('page=0')), null);
  const page = parsePagination(new URLSearchParams('page=2&pageSize=10'));
  assert.deepEqual(page, { limit: 10, offset: 10 });
  assert.equal(parsePagination(new URLSearchParams('pageSize=101')), null);
});

test('validateBaseURL：阻断 userinfo', () => {
  assert.throws(() => validateBaseURL('https://user:pass@example.com/v1'), /用户名/);
  assert.equal(validateBaseURL('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
});

test('validateBaseURL：阻断过长主机名', () => {
  const long = 'https://' + 'a'.repeat(254) + '.com/v1';
  assert.throws(() => validateBaseURL(long), /过长/);
});

test('validateBaseURL：仍放行合法 http 与 localhost', () => {
  assert.doesNotThrow(() => validateBaseURL('http://localhost:11434/v1'));
  assert.doesNotThrow(() => validateBaseURL('https://10.0.0.1/v1'));
});

test('clientIpKey：取最右 XFF', () => {
  const req = { headers: { get: (k: string) => (k === 'x-forwarded-for' ? '1.1.1.1, 2.2.2.2, 3.3.3.3' : null) } } as unknown as Parameters<typeof clientIpKey>[0];
  assert.equal(clientIpKey(req), '3.3.3.3');
  const req2 = { headers: { get: () => null } } as unknown as Parameters<typeof clientIpKey>[0];
  assert.equal(clientIpKey(req2), 'local');
});

test('createRateLimiter：GC 不影响正常限流', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limiter.tryAcquire('a'), true);
  assert.equal(limiter.tryAcquire('a'), true);
  assert.equal(limiter.tryAcquire('a'), false);
  assert.equal(limiter.tryAcquire('b'), true);
});

test('buildRagMessages：长历史被截断', () => {
  const long = 'x'.repeat(HISTORY_MAX_CHARS + 500);
  const msgs = buildRagMessages('问题', [{ n: 1, docName: 'a', idx: 0, text: '资料内容', score: 0.9 }], [{ role: 'user', content: long }]);
  const hist = msgs.find((m) => m.content === long);
  assert.equal(hist, undefined);
  const truncated = msgs.find((m) => m.content.length === HISTORY_MAX_CHARS + 1);
  assert.ok(truncated);
});

test('toBoundedString：边界', () => {
  assert.equal(toBoundedString('  hello  ', 10), 'hello');
  assert.equal(toBoundedString('   ', 10), null);
  assert.equal(toBoundedString(123 as unknown as string, 10), null);
  assert.equal(toBoundedString('a'.repeat(20), 10)?.length, 10);
});

test('parsePositiveInt：字符串返回 null（严格校验）', () => {
  assert.equal(parsePositiveInt('5' as unknown as number), null);
  assert.equal(parsePositiveInt(0), null);
  assert.equal(parsePositiveInt(5), 5);
});

// 新增：校验 chat 参数边界（通过 validate 函数间接）
test('isLocalBaseURL 兼容 ipv6', () => {
  assert.equal(isLocalBaseURL('http://[::1]:11434/v1'), true);
  assert.equal(isLocalBaseURL('http://example.com/v1'), false);
});
