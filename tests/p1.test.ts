/**
 * P1 功能测试：分批嵌入常量/字符上限、BM25 搜索、topK 参数校验、批量重嵌校验、
 * 历史压缩预算、健康脱敏（均不依赖模型与网络）。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const dir = mkdtempSync(path.join(tmpdir(), 'docrag-p1-'));
process.env.DATA_DIR = dir;

function req(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

let db: typeof import('../lib/db');
let search: typeof import('../app/api/search/route');
let chat: typeof import('../app/api/chat/route');
let reembed: typeof import('../app/api/documents/reembed/route');
let health: typeof import('../app/api/health/route');

before(async () => {
  [db, search, chat, reembed, health] = await Promise.all([
    import('../lib/db'),
    import('../app/api/search/route'),
    import('../app/api/chat/route'),
    import('../app/api/documents/reembed/route'),
    import('../app/api/health/route'),
  ]);
});

after(() => {
  delete process.env.APP_PASSWORD;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 句柄忽略
  }
});

test('parseDocument：超长文本被拒绝并提示拆分', async () => {
  const { parseDocument, MAX_DOC_CHARS } = await import('../lib/parse');
  assert.ok(MAX_DOC_CHARS >= 1000);
  const huge = 'a'.repeat(MAX_DOC_CHARS + 100);
  await assert.rejects(() => parseDocument('huge.txt', Buffer.from(huge, 'utf8')), /文本过长/);
});

test('embed：分批常量与加载状态', async () => {
  const { EMBED_BATCH_SIZE, isEmbedLoaded } = await import('../lib/embed');
  assert.ok(EMBED_BATCH_SIZE >= 1);
  assert.equal(isEmbedLoaded(), false);
});

test('compactHistory：总预算内保留最新、丢弃最早', async () => {
  const { compactHistory, HISTORY_BUDGET_CHARS } = await import('../lib/rag');
  const mk = (c: string) => ({ role: 'user' as const, content: c });
  const history = Array.from({ length: 12 }, (_, i) => mk(`msg${i}-` + 'x'.repeat(1990)));
  const out = compactHistory(history);
  const total = out.reduce((s, m) => s + m.content.length, 0);
  assert.ok(total <= HISTORY_BUDGET_CHARS + 10);
  assert.ok(out.length < 12);
  assert.ok(out[out.length - 1].content.startsWith('msg11-'));
});

test('search：默认 bm25 命中，mode 非法 400，like 兼容', async () => {
  const id = db.insertDocument('P1搜索文档', 'md', 10, [
    { text: 'P1独特词青铜门卫矩阵测试段落，用于验证BM25分词召回。', vec: new Float32Array(3).fill(0.2) },
  ]);
  const r1 = await search.GET(req(`http://localhost/api/search?q=${encodeURIComponent('青铜门卫')}`));
  assert.equal(r1.status, 200);
  const b1 = await r1.json();
  assert.equal(b1.mode, 'bm25');
  assert.ok(b1.results.some((r: { docId: number }) => r.docId === id));

  const r2 = await search.GET(req('http://localhost/api/search?q=test&mode=bad'));
  assert.equal(r2.status, 400);

  const r3 = await search.GET(req(`http://localhost/api/search?q=${encodeURIComponent('青铜门卫')}&mode=like`));
  assert.equal(r3.status, 200);
  const b3 = await r3.json();
  assert.equal(b3.mode, 'like');
  assert.ok(b3.results.some((r: { docId: number }) => r.docId === id));
});

test('chat：非法 topK/minScore 返回 400', async () => {
  const badTop = await chat.POST(
    req('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi', topK: 99 }),
    })
  );
  assert.equal(badTop.status, 400);

  const badMin = await chat.POST(
    req('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hi', minScore: 5 }),
    })
  );
  assert.equal(badMin.status, 400);
});

test('reembed：批量参数校验与不存在文档汇总', async () => {
  const bad = await reembed.POST(
    req('http://localhost/api/documents/reembed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: 'bad' }),
    })
  );
  assert.equal(bad.status, 400);

  const missing = await reembed.POST(
    req('http://localhost/api/documents/reembed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [999999] }),
    })
  );
  assert.equal(missing.status, 200);
  const body = await missing.json();
  assert.equal(body.succeeded, 0);
  assert.equal(body.results[0].ok, false);
});

test('health：设密码时匿名只回最小存活信息', async () => {
  process.env.APP_PASSWORD = 'p1-test-pass';
  try {
    const fake = { cookies: { get: () => undefined } } as unknown as NextRequest;
    const res = await health.GET(fake);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptimeSec, 'number');
    assert.equal(body.database, undefined);
  } finally {
    delete process.env.APP_PASSWORD;
  }
});
