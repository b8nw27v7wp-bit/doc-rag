import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, contentHashText } from '../lib/hash';

test('contentHash 对相同字节输出相同哈希', () => {
  const a = Buffer.from('hello world');
  const b = Buffer.from('hello world');
  const c = Buffer.from('hello world!');
  assert.equal(contentHash(a), contentHash(b));
  assert.notEqual(contentHash(a), contentHash(c));
});

test('contentHash 输出 64 位 hex（SHA-256）', () => {
  const h = contentHash(Buffer.from('abc'));
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('contentHashText 与 Buffer 版一致', () => {
  assert.equal(contentHashText('text'), contentHash(Buffer.from('text', 'utf8')));
});

test('contentHash 支持 Uint8Array 与 Buffer', () => {
  const u8 = new Uint8Array([1, 2, 3]);
  assert.equal(contentHash(u8), contentHash(Buffer.from([1, 2, 3])));
});