/**
 * 路由层集成测试：直接调用 route handler（无需起服务/无需模型/无需网络），
 * 覆盖不依赖嵌入与 LLM 的纯逻辑分支：会话 CRUD、文档 CRUD、搜索、健康、备份、去重、chat 空库分支。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NextRequest } from 'next/server';

const dir = mkdtempSync(path.join(tmpdir(), 'docrag-routes-'));
process.env.DATA_DIR = dir;
process.env.LLM_API_KEY = 'sk-test-do-not-call';

function req(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

let db: typeof import('../lib/db');
let hash: typeof import('../lib/hash');
let sessions: typeof import('../app/api/sessions/route');
let documents: typeof import('../app/api/documents/route');
let content: typeof import('../app/api/documents/content/route');
let search: typeof import('../app/api/search/route');
let health: typeof import('../app/api/health/route');
let lock: typeof import('../app/api/lock/route');
let backup: typeof import('../app/api/backup/route');
let upload: typeof import('../app/api/upload/route');
let chat: typeof import('../app/api/chat/route');

before(async () => {
  [db, hash, sessions, documents, content, search, health, lock, backup, upload, chat] = await Promise.all([
    import('../lib/db'),
    import('../lib/hash'),
    import('../app/api/sessions/route'),
    import('../app/api/documents/route'),
    import('../app/api/documents/content/route'),
    import('../app/api/search/route'),
    import('../app/api/health/route'),
    import('../app/api/lock/route'),
    import('../app/api/backup/route'),
    import('../app/api/upload/route'),
    import('../app/api/chat/route'),
  ]);
});

after(() => {
  delete process.env.LLM_API_KEY;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 上句柄未释放时忽略
  }
});

test('health：返回状态与统计', async () => {
  const res = await health.GET();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.database.documents, 'number');
  assert.equal(body.embedding.local, true);
  assert.equal(typeof body.jobs.embeddingActive, 'number');
});

test('chat：空库返回清晰错误事件（不触发模型加载）', async () => {
  const res = await chat.POST(
    req('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '你好' }),
    })
  );
  assert.equal(res.status, 200);
  const text = await res.text();
  const events = text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === 'error' && String(e.message).includes('文档库为空')));
});

test('chat：超长问题返回 400', async () => {
  const res = await chat.POST(
    req('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '长'.repeat(5000) }),
    })
  );
  assert.equal(res.status, 400);
});

test('lock：未启用密码时直接通过；限流生效', async () => {
  delete process.env.APP_PASSWORD;
  const first = await lock.POST(req('http://localhost/api/lock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(first.status, 200);
  // 连续 10 次错误密码后应 429（仅用于验证限流器接入）
  process.env.APP_PASSWORD = 'correct-pass';
  try {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await lock.POST(
        req('http://localhost/api/lock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) })
      );
      if (r.status === 429) got429 = true;
    }
    assert.equal(got429, true, '高频尝试应触发限流');
  } finally {
    delete process.env.APP_PASSWORD;
  }
});

test('sessions：创建/重命名/置顶/删除全流程', async () => {
  const created = await sessions.POST(req('http://localhost/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(created.status, 200);
  const { id } = await created.json();
  assert.ok(Number(id) > 0);

  const renamed = await sessions.PATCH(
    req(`http://localhost/api/sessions?id=${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '路由测试会话' }) })
  );
  assert.equal(renamed.status, 200);

  const pinned = await sessions.PATCH(
    req(`http://localhost/api/sessions?id=${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pinned: true }) })
  );
  assert.equal(pinned.status, 200);

  const listRes = await sessions.GET();
  const list = await listRes.json();
  const row = list.sessions.find((s: { id: number; title: string; pinned: boolean }) => s.id === id);
  assert.ok(row, '会话应出现在列表');
  assert.equal(row.title, '路由测试会话');
  assert.equal(row.pinned, true);

  const del = await sessions.DELETE(req(`http://localhost/api/sessions?id=${id}`, { method: 'DELETE' }));
  assert.equal(del.status, 200);
});

test('documents：列表/原文/全文搜索/批量删除', async () => {
  const id = db.insertDocument('路由测试文档', 'md', 10, [{ text: '这是路由测试的内容段落，包含独特词富贵险中求。', vec: new Float32Array(3).fill(0.2) }]);
  const listRes = await documents.GET();
  const list = await listRes.json();
  assert.ok(list.documents.some((d: { id: number }) => d.id === id));

  const contentRes = await content.GET(req(`http://localhost/api/documents/content?id=${id}`));
  const c = await contentRes.json();
  assert.ok(c.text.includes('富贵险中求'));

  const searchRes = await search.GET(req(`http://localhost/api/search?q=${encodeURIComponent('富贵险中求')}`));
  const s = await searchRes.json();
  assert.ok(s.results.some((r: { docId: number }) => r.docId === id));

  const del = await documents.DELETE(req(`http://localhost/api/documents?ids=${id}`, { method: 'DELETE' }));
  assert.equal(del.status, 200);
  assert.equal((await del.json()).deleted, 1);
});

test('documents：ids 超限返回 400', async () => {
  const many = Array.from({ length: 600 }, (_, i) => i + 1).join(',');
  const res = await documents.DELETE(req(`http://localhost/api/documents?ids=${many}`, { method: 'DELETE' }));
  assert.equal(res.status, 400);
});

test('upload：同名同内容被去重跳过（不触发模型）', async () => {
  const name = `dup-${Date.now()}.txt`;
  const content = '去重测试内容段落';
  const h = hash.contentHash(Buffer.from(content, 'utf8'));
  db.insertDocument(name, 'txt', content.length, [{ text: content, vec: new Float32Array([0.1]) }], h);
  const form = new FormData();
  form.append('files', new File([content], name));
  const res = await upload.POST(req('http://localhost/api/upload', { method: 'POST', body: form }));
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.results[0].skipped, true);
});

test('backup：下载快照 → 变更 → 恢复回滚', async () => {
  const before = db.documentCount();
  db.insertDocument('恢复前文档', 'txt', 1, [{ text: 'x', vec: new Float32Array([1]) }]);
  const snapshot = db.documentCount();

  const get = await backup.GET();
  assert.equal(get.status, 200);
  const buf = Buffer.from(await get.arrayBuffer());
  assert.equal(buf.subarray(0, 16).toString('utf8'), 'SQLite format 3\u0000');

  db.insertDocument('恢复后消失的文档', 'txt', 1, [{ text: 'y', vec: new Float32Array([1]) }]);
  assert.equal(db.documentCount(), snapshot + 1);

  const form = new FormData();
  form.append('file', new File([buf], 'restore.db'));
  const post = await backup.POST(req('http://localhost/api/backup', { method: 'POST', body: form }));
  assert.equal((await post.json()).ok, true);
  assert.equal(db.documentCount(), snapshot);
  assert.equal(db.documentCount() >= before, true);
});

test('backup：非法文件恢复返回 400', async () => {
  const form = new FormData();
  form.append('file', new File(['垃圾数据'], 'bad.db'));
  const res = await backup.POST(req('http://localhost/api/backup', { method: 'POST', body: form }));
  assert.equal(res.status, 400);
});