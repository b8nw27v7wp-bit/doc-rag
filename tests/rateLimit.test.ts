import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../lib/rateLimit';

test('createRateLimiter：窗口内超限拒绝，不同 key 互不影响', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(limiter.tryAcquire('a'), true);
  assert.equal(limiter.tryAcquire('a'), true);
  assert.equal(limiter.tryAcquire('a'), true);
  assert.equal(limiter.tryAcquire('a'), false, '第四次应被限流');
  assert.equal(limiter.tryAcquire('b'), true, '不同 key 不受影响');
});

test('createRateLimiter：窗口过期后恢复额度', async () => {
  const limiter = createRateLimiter({ windowMs: 20, max: 1 });
  assert.equal(limiter.tryAcquire('k'), true);
  assert.equal(limiter.tryAcquire('k'), false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(limiter.tryAcquire('k'), true, '窗口过期后应恢复');
});