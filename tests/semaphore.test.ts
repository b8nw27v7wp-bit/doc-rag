import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSemaphore } from '../lib/semaphore';

test('createSemaphore：并发上限内直接放行，超限排队', async () => {
  const sem = createSemaphore(2);
  assert.equal(sem.active(), 0);
  const r1 = await sem.acquire();
  const r2 = await sem.acquire();
  assert.equal(sem.active(), 2);
  let third = false;
  void sem.acquire().then(() => {
    third = true;
  });
  assert.equal(sem.pending(), 1);
  assert.equal(third, false);
  r1();
  await Promise.resolve();
  assert.equal(third, true, '释放后排队任务应获得许可');
  r2();
});

test('createSemaphore：release 幂等，全部释放后计数归零', async () => {
  const sem = createSemaphore(1);
  const r = await sem.acquire();
  r();
  r(); // 重复释放不超减
  assert.equal(sem.active(), 0);
  assert.equal(sem.pending(), 0);
});