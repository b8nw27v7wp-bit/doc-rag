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