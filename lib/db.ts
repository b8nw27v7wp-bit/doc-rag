/**
 * 数据层：Node 内置 node:sqlite（零原生依赖），WAL 模式。
 * 表：documents（文档元信息）+ chunks（分块文本 + 384 维向量 BLOB）。
 * 数据文件默认在 ./data/app.db，可用环境变量 DATA_DIR 覆盖。
 * 惰性初始化：模块导入零副作用（Next 构建期不触发数据库访问，避免多 worker 锁冲突）。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { bytesToF32 } from './vector';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!db) {
    const d = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
    d.exec('PRAGMA journal_mode = WAL;');
    d.exec('PRAGMA busy_timeout = 5000;');
    d.exec('PRAGMA foreign_keys = ON;');
    d.exec(`
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  ext          TEXT    NOT NULL,
  size         INTEGER NOT NULL,
  char_count   INTEGER NOT NULL,
  chunk_count  INTEGER NOT NULL,
  content_hash TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS chunks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx       INTEGER NOT NULL,
  text      TEXT    NOT NULL,
  context   TEXT,
  embedding BLOB    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL DEFAULT '新会话',
  doc_ids    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  refs       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
`);
    migrate(d);
    db = d;
  }
  return db;
}

/**
 * 幂等迁移：老库（无 content_hash / updated_at 列）补齐列。
 * ALTER TABLE 新增列不能用非恒定默认值，故 updated_at 先加空列再回填 created_at。
 */
function migrate(d: DatabaseSync): void {
  const docCols = new Set(
    (d.prepare('PRAGMA table_info(documents)').all() as { name: string }[]).map((c) => c.name)
  );
  if (!docCols.has('content_hash')) {
    d.exec('ALTER TABLE documents ADD COLUMN content_hash TEXT');
  }
  if (!docCols.has('updated_at')) {
    d.exec('ALTER TABLE documents ADD COLUMN updated_at TEXT');
    d.exec("UPDATE documents SET updated_at = COALESCE(updated_at, created_at, '')");
  }
  const chunkCols = new Set(
    (d.prepare('PRAGMA table_info(chunks)').all() as { name: string }[]).map((c) => c.name)
  );
  if (!chunkCols.has('context')) {
    d.exec('ALTER TABLE chunks ADD COLUMN context TEXT');
  }
}

export interface DocumentRecord {
  id: number;
  name: string;
  ext: string;
  size: number;
  charCount: number;
  chunkCount: number;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkRecord {
  id: number;
  docId: number;
  docName: string;
  idx: number;
  text: string;
  /** 上下文头（contextual retrieval），可能为空 */
  context: string | null;
  embedding: Float32Array;
}

function f32ToU8(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

/** 写入一个文档及其全部向量块，事务提交；contentHash 用于重复检测；context 为上下文头 */
export function insertDocument(
  name: string,
  ext: string,
  size: number,
  chunks: { text: string; vec: Float32Array; context?: string }[],
  contentHash: string | null = null
): number {
  const d = getDb();
  const docId = Number(
    d
      .prepare(
        'INSERT INTO documents (name, ext, size, char_count, chunk_count, content_hash) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(name, ext, size, chunks.reduce((a, c) => a + c.text.length, 0), chunks.length, contentHash).lastInsertRowid
  );
  const ins = d.prepare('INSERT INTO chunks (doc_id, idx, text, context, embedding) VALUES (?, ?, ?, ?, ?)');
  d.exec('BEGIN');
  try {
    for (let i = 0; i < chunks.length; i++) {
      ins.run(docId, i, chunks[i].text, chunks[i].context ?? null, f32ToU8(chunks[i].vec));
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  return docId;
}

/** 文档列表（新上传在前） */
export function listDocuments(): DocumentRecord[] {
  const rows = getDb()
    .prepare(
      'SELECT id, name, ext, size, char_count, chunk_count, content_hash, created_at, updated_at FROM documents ORDER BY id DESC'
    )
    .all() as unknown as {
    id: number;
    name: string;
    ext: string;
    size: number;
    char_count: number;
    chunk_count: number;
    content_hash: string | null;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ext: r.ext,
    size: r.size,
    charCount: r.char_count,
    chunkCount: r.chunk_count,
    contentHash: r.content_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** 单文档元信息 */
export function getDocument(id: number): DocumentRecord | null {
  const row = getDb()
    .prepare(
      'SELECT id, name, ext, size, char_count, chunk_count, content_hash, created_at, updated_at FROM documents WHERE id = ?'
    )
    .get(id) as
    | {
        id: number;
        name: string;
        ext: string;
        size: number;
        char_count: number;
        chunk_count: number;
        content_hash: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ext: row.ext,
    size: row.size,
    charCount: row.char_count,
    chunkCount: row.chunk_count,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function documentCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };
  return Number(row.n);
}

export function chunkCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number };
  return Number(row.n);
}

/** 删除文档（级联删除其向量块） */
export function deleteDocument(id: number): void {
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id);
}

/** 批量删除文档（级联删除向量块），返回实际删除数 */
export function deleteDocuments(ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = getDb().prepare(`DELETE FROM documents WHERE id IN (${placeholders})`).run(...ids);
  return Number(res.changes);
}

/** 按名称 + 内容哈希查找重复文档，返回已存在文档 id（无则 null） */
export function findDocumentByHash(name: string, contentHash: string): number | null {
  const row = getDb()
    .prepare('SELECT id FROM documents WHERE name = ? AND content_hash = ? LIMIT 1')
    .get(name, contentHash) as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

/** 重组文档全文（按 idx 顺序拼接全部块文本） */
export function getDocumentText(id: number): string {
  const rows = getDb()
    .prepare('SELECT text FROM chunks WHERE doc_id = ? ORDER BY idx ASC')
    .all(id) as unknown as { text: string }[];
  return rows.map((r) => r.text).join('\n\n');
}

export interface SearchHit {
  docId: number;
  docName: string;
  idx: number;
  text: string;
  snippet: string;
}

/** 转义 LIKE 特殊字符 */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 全文检索：对分块文本做 LIKE 子串匹配（跨所有文档）。
 * 返回命中的块与其上下文切片；可用于文档库全文搜索。
 */
export function searchChunks(query: string, limit = 20): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const rows = getDb()
    .prepare(
      `SELECT c.doc_id, d.name AS doc_name, c.idx, c.text
       FROM chunks c JOIN documents d ON d.id = c.doc_id
       WHERE c.text LIKE ? ESCAPE '\\'
       ORDER BY d.id DESC, c.idx ASC LIMIT ?`
    )
    .all(`%${escapeLike(q)}%`, limit) as unknown as {
    doc_id: number;
    doc_name: string;
    idx: number;
    text: string;
  }[];
  return rows.map((r) => ({
    docId: r.doc_id,
    docName: r.doc_name,
    idx: r.idx,
    text: r.text,
    snippet: makeSnippet(r.text, q),
  }));
}

/** 生成命中上下文切片（命中词前后各约 40 字符 + 高亮标记） */
export function makeSnippet(text: string, query: string, radius = 40): string {
  const lower = text.toLowerCase();
  let pos = lower.indexOf(query.toLowerCase());
  if (pos < 0) pos = Math.min(radius, text.length); // 无明确命中时取开头
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + query.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

/** 全量向量块（含文档名，用于检索） */
export function allChunks(): ChunkRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.doc_id, d.name AS doc_name, c.idx, c.text, c.context, c.embedding
       FROM chunks c JOIN documents d ON d.id = c.doc_id`
    )
    .all() as unknown as {
    id: number;
    doc_id: number;
    doc_name: string;
    idx: number;
    text: string;
    context: string | null;
    embedding: Uint8Array;
  }[];
  return rows.map((r) => ({
    id: r.id,
    docId: r.doc_id,
    docName: r.doc_name,
    idx: r.idx,
    text: r.text,
    context: r.context,
    embedding: bytesToF32(r.embedding),
  }));
}

/** 数据库文件大小（README/页面展示用） */
export function dbSizeBytes(): number {
  try {
    return statSync(path.join(DATA_DIR, 'app.db')).size;
  } catch {
    return 0;
  }
}

// ────────────────────────── 会话与消息 ──────────────────────────

export interface SessionRecord {
  id: number;
  title: string;
  /** 检索范围：空数组 = 全部文档 */
  docIds: number[];
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface MessageRecord {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  /** assistant 消息的引用来源 JSON（SourceHit[] 序列化文本） */
  refs: string;
  createdAt: string;
}

function parseDocIds(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** 新建会话：title 空时自动取「新会话」，返回会话 id */
export function createSession(title: string, docIds: number[] = []): number {
  const d = getDb();
  const res = d
    .prepare('INSERT INTO sessions (title, doc_ids) VALUES (?, ?)')
    .run(title.trim() || '新会话', docIds.join(','));
  return Number(res.lastInsertRowid);
}

/** 会话列表（最近更新在前，附带消息数） */
export function listSessions(): SessionRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.title, s.doc_ids, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
       FROM sessions s ORDER BY s.updated_at DESC, s.id DESC`
    )
    .all() as unknown as {
    id: number;
    title: string;
    doc_ids: string;
    created_at: string;
    updated_at: string;
    message_count: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    docIds: parseDocIds(r.doc_ids),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: Number(r.message_count),
  }));
}

export function getSession(id: number): { id: number; title: string; docIds: number[] } | null {
  const row = getDb().prepare('SELECT id, title, doc_ids FROM sessions WHERE id = ?').get(id) as
    | { id: number; title: string; doc_ids: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, title: row.title, docIds: parseDocIds(row.doc_ids) };
}

export function updateSessionTitle(id: number, title: string): void {
  getDb().prepare('UPDATE sessions SET title = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(title.trim() || '新会话', id);
}

/** 更新会话检索范围（文档 id 列表，空数组 = 全部） */
export function updateSessionDocIds(id: number, docIds: number[]): void {
  getDb()
    .prepare('UPDATE sessions SET doc_ids = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?')
    .run(docIds.join(','), id);
}

/** 更新会话活动时间；标题为默认值时用 message 标题化 */
export function touchSession(id: number, message: string): void {
  const d = getDb();
  d.prepare('UPDATE sessions SET updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(id);
  const s = getSession(id);
  if (s && s.title === '新会话') {
    updateSessionTitle(id, titleFromMessage(message));
  }
}

/** 从首条提问截取会话标题（≤24 字，单行） */
export function titleFromMessage(msg: string): string {
  const oneLine = msg.replace(/\s+/g, ' ').trim();
  return oneLine.length > 24 ? `${oneLine.slice(0, 24)}…` : oneLine;
}

export function deleteSession(id: number): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id); // messages 级联删除
}

export function appendMessage(sessionId: number, role: 'user' | 'assistant', content: string, refs = ''): number {
  const res = getDb()
    .prepare('INSERT INTO messages (session_id, role, content, refs) VALUES (?, ?, ?, ?)')
    .run(sessionId, role, content, refs);
  return Number(res.lastInsertRowid);
}

/** 会话全部消息（时间正序） */
export function listMessages(sessionId: number): MessageRecord[] {
  const rows = getDb()
    .prepare('SELECT id, session_id, role, content, refs, created_at FROM messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId) as unknown as {
    id: number;
    session_id: number;
    role: 'user' | 'assistant';
    content: string;
    refs: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    refs: r.refs,
    createdAt: r.created_at,
  }));
}

export function sessionCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
  return Number(row.n);
}

export { DATA_DIR };