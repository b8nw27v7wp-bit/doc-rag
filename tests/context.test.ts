import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withNeighborContext, type ChunkRef } from '../lib/context';

test('withNeighborContext：单文档首块无左邻块', () => {
  const all: ChunkRef[] = [
    { docId: 1, idx: 0, text: '块0' },
    { docId: 1, idx: 1, text: '块1' },
    { docId: 1, idx: 2, text: '块2' },
  ];
  const out = withNeighborContext(all, [all[0]], 1);
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('块0') && out[0].includes('块1'));
  assert.ok(!out[0].includes('块2'), '首块半径 1 不应包含第 3 块');
});

test('withNeighborContext：中间块包含左右邻块', () => {
  const all: ChunkRef[] = [
    { docId: 1, idx: 0, text: 'A' },
    { docId: 1, idx: 1, text: 'B' },
    { docId: 1, idx: 2, text: 'C' },
  ];
  const out = withNeighborContext(all, [all[1]], 1)[0];
  assert.ok(out.includes('A') && out.includes('B') && out.includes('C'));
});

test('withNeighborContext：跨文档不串味', () => {
  const all: ChunkRef[] = [
    { docId: 1, idx: 0, text: '文档一' },
    { docId: 2, idx: 0, text: '文档二' },
  ];
  const out = withNeighborContext(all, [all[0]], 1)[0];
  assert.ok(out.includes('文档一'));
  assert.ok(!out.includes('文档二'));
});

test('withNeighborContext：半径 0 仅返回自身', () => {
  const all: ChunkRef[] = [
    { docId: 1, idx: 0, text: 'S0' },
    { docId: 1, idx: 1, text: 'S1' },
  ];
  assert.deepEqual(withNeighborContext(all, [all[0]], 0), ['S0']);
});

test('withNeighborContext：多中心返回顺序与输入一致', () => {
  const all: ChunkRef[] = [
    { docId: 1, idx: 0, text: 'A' },
    { docId: 1, idx: 1, text: 'B' },
  ];
  const out = withNeighborContext(all, [all[1], all[0]], 0);
  assert.deepEqual(out, ['B', 'A']);
});