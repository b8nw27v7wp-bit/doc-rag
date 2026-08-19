import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// 隔离的数据目录：必须在 import db 之前设置
const dir = mkdtempSync(path.join(tmpdir(), 'docrag-db-test-'));
process.env.DATA_DIR = dir;

let db: typeof import('../lib/db');

before(async () => {
  db = await import('../lib/db');
});

after(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 上文件句柄未释放时忽略
  }
});

test('createSession 默认标题与自增 id', () => {
  const a = db.createSession('');
  const b = db.createSession('');
  assert.ok(b > a);
  assert.equal(db.getSession(a)?.title, '新会话');
});

test('会话保存检索范围 docIds', () => {
  const id = db.createSession('范围测试', [3, 7, 12]);
  const s = db.getSession(id);
  assert.deepEqual(s?.docIds, [3, 7, 12]);
});

test('updateSessionTitle / updateSessionDocIds 生效', () => {
  const id = db.createSession('旧标题', [1]);
  db.updateSessionTitle(id, '新标题');
  db.updateSessionDocIds(id, [9]);
  const s = db.getSession(id);
  assert.equal(s?.title, '新标题');
  assert.deepEqual(s?.docIds, [9]);
});

test('appendMessage + listMessages 按时间正序返回', () => {
  const id = db.createSession('');
  db.appendMessage(id, 'user', '问题一');
  db.appendMessage(id, 'assistant', '回答一', '[{"n":1}]');
  db.appendMessage(id, 'user', '追问');
  const msgs = db.listMessages(id);
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(msgs[1].refs, '[{"n":1}]');
});

test('deleteSession 级联删除消息', () => {
  const id = db.createSession('');
  db.appendMessage(id, 'user', 'x');
  db.deleteSession(id);
  assert.equal(db.getSession(id), null);
  assert.deepEqual(db.listMessages(id), []);
});

test('touchSession 用首条消息生成标题（截断 24 字）', () => {
  const id = db.createSession('');
  db.touchSession(id, '这是一个超过二十四个字会被截断添加省略号的长长问题内容');
  assert.equal(db.getSession(id)?.title, '这是一个超过二十四个字会被截断添加省略号的长长问…');
  // 已有自定义标题的会话不被覆盖
  const id2 = db.createSession('已命名');
  db.touchSession(id2, '新问题');
  assert.equal(db.getSession(id2)?.title, '已命名');
});

test('listSessions 按最近更新排序并统计消息数', () => {
  const old = db.createSession('旧会话');
  const newer = db.createSession('新会话');
  db.appendMessage(newer, 'user', '问');
  db.appendMessage(newer, 'assistant', '答');
  const list = db.listSessions();
  assert.equal(list.length >= 2, true, '应至少包含两个会话');
  assert.equal(list[0].id, newer, '更新的会话排前面');
  assert.equal(list[0].messageCount, 2);
  assert.equal(list.some((s) => s.id === old), true);
});

test('titleFromMessage 清理空白并按长度截断', () => {
  assert.equal(db.titleFromMessage('  多行\n问题 \n内容  '), '多行 问题 内容');
  assert.equal(db.titleFromMessage('短问题'), '短问题');
  assert.equal(db.titleFromMessage('字'.repeat(30)).length, 25); // 24 字 + 省略号
});

test('insertDocument 记录 contentHash 供去重查询', () => {
  const id = db.insertDocument('哈希文档', 'md', 10, [{ text: '内容', vec: new Float32Array([0.5]) }], 'abc123');
  assert.equal(db.findDocumentByHash('哈希文档', 'abc123'), id);
  assert.equal(db.findDocumentByHash('哈希文档', 'other'), null);
  assert.equal(db.findDocumentByHash('别的文档', 'abc123'), null);
});

test('deleteDocuments 批量删除并返回删除数', () => {
  const a = db.insertDocument('批量A', 'txt', 1, [{ text: 'a', vec: new Float32Array([0]) }]);
  const b = db.insertDocument('批量B', 'txt', 1, [{ text: 'b', vec: new Float32Array([0]) }]);
  const changed = db.deleteDocuments([a, b, 999999]);
  assert.equal(changed, 2);
  assert.equal(db.getDocument(a), null);
  assert.equal(db.getDocument(b), null);
});

test('getDocumentText 按 idx 顺序重组全文', () => {
  const id = db.insertDocument('重组', 'txt', 1, [
    { text: '块0', vec: new Float32Array([0]) },
    { text: '块1', vec: new Float32Array([0]) },
    { text: '块2', vec: new Float32Array([0]) },
  ]);
  assert.equal(db.getDocumentText(id), '块0\n\n块1\n\n块2');
});

test('searchChunks 命中关键字并返回文档名与切片', () => {
  const id = db.insertDocument('检索文档', 'md', 1, [{ text: '这是包含贝尔不等式实验验证的段落内容，用于全文检索测试。', vec: new Float32Array([0]) }]);
  const hits = db.searchChunks('贝尔不等式', 10);
  assert.ok(hits.some((h) => h.docId === id), '应命中刚入库的文档');
  const hit = hits.find((h) => h.docId === id)!;
  assert.equal(hit.docName, '检索文档');
  assert.ok(hit.snippet.includes('贝尔不等式'));
});

test('searchChunks：LIKE 特殊字符转义（% 不被当作通配符）', () => {
  const id = db.insertDocument('百分号', 'txt', 1, [{ text: '进度达到 100% 完成', vec: new Float32Array([0]) }]);
  assert.equal(db.searchChunks('100%', 10).some((h) => h.docId === id), true);
});

test('searchChunks：空查询返回空', () => {
  assert.deepEqual(db.searchChunks('   ', 10), []);
});

test('makeSnippet 截取命中上下文', () => {
  const text = 'a'.repeat(50) + '关键词' + 'b'.repeat(50);
  const s = db.makeSnippet(text, '关键词');
  assert.ok(s.includes('关键词'));
  assert.ok(s.length < text.length);
});

test('insertDocument 存储并还原 chunk 上下文头', () => {
  const id = db.insertDocument('上下文文档', 'md', 1, [
    { text: '块0', vec: new Float32Array([0.1, 0.2]), context: '《上下文文档》 · 第一章 · 第 1/1 段' },
  ]);
  const chunk = db.allChunks().find((c) => c.docId === id);
  assert.ok(chunk);
  assert.equal(chunk.context, '《上下文文档》 · 第一章 · 第 1/1 段');
  assert.equal(chunk.text, '块0');
  const vec = Array.from(chunk.embedding);
  assert.ok(Math.abs(vec[0] - 0.1) < 1e-6, 'float32 往返近似一致');
  assert.ok(Math.abs(vec[1] - 0.2) < 1e-6);
});

test('insertDocument 存储关键词，setDocumentSummary 回填摘要', () => {
  const id = db.insertDocument('关键词文档', 'md', 1, [{ text: '内容', vec: new Float32Array([0]) }], null, ['检索', '向量']);
  const d = db.getDocument(id);
  assert.deepEqual(d?.keywords, ['检索', '向量']);
  assert.equal(d?.summary, null);
  db.setDocumentSummary(id, '一句话摘要');
  assert.equal(db.getDocument(id)?.summary, '一句话摘要');
});

test('setSessionPinned 置顶会话排在列表前', () => {
  const a = db.createSession('普通会话');
  const b = db.createSession('置顶会话');
  db.setSessionPinned(b, true);
  const list = db.listSessions();
  const bi = list.findIndex((s) => s.id === b);
  const ai = list.findIndex((s) => s.id === a);
  assert.ok(bi >= 0 && ai >= 0, '两个会话都在列表中');
  assert.ok(bi < ai, '置顶会话排在普通会话前');
  assert.equal(list[bi].pinned, true);
  assert.equal(list[ai].pinned, false);
  // 取消置顶后恢复
  db.setSessionPinned(b, false);
  const list2 = db.listSessions();
  assert.equal(list2.find((s) => s.id === b)?.pinned, false);
});

test('allChunks 内存缓存：未变更时同引用，变更后失效', () => {
  const a = db.allChunks();
  assert.strictEqual(a, db.allChunks(), '未变更时应返回同一缓存对象');
  db.insertDocument('缓存失效', 'txt', 1, [{ text: 'x', vec: new Float32Array([0]) }]);
  assert.notStrictEqual(a, db.allChunks(), '写入后缓存应失效重建');
});