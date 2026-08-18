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
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  ext         TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  char_count  INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS chunks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx       INTEGER NOT NULL,
  text      TEXT    NOT NULL,
  embedding BLOB    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
`);
    db = d;
  }
  return db;
}

export interface DocumentRecord {
  id: number;
  name: string;
  ext: string;
  size: number;
  charCount: number;
  chunkCount: number;
  createdAt: string;
}

export interface ChunkRecord {
  id: number;
  docId: number;
  docName: string;
  idx: number;
  text: string;
  embedding: Float32Array;
}

function f32ToU8(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

/** 写入一个文档及其全部向量块，事务提交 */
export function insertDocument(
  name: string,
  ext: string,
  size: number,
  chunks: { text: string; vec: Float32Array }[]
): number {
  const d = getDb();
  const docId = Number(
    d
      .prepare('INSERT INTO documents (name, ext, size, char_count, chunk_count) VALUES (?, ?, ?, ?, ?)')
      .run(name, ext, size, chunks.reduce((a, c) => a + c.text.length, 0), chunks.length).lastInsertRowid
  );
  const ins = d.prepare('INSERT INTO chunks (doc_id, idx, text, embedding) VALUES (?, ?, ?, ?)');
  d.exec('BEGIN');
  try {
    for (let i = 0; i < chunks.length; i++) {
      ins.run(docId, i, chunks[i].text, f32ToU8(chunks[i].vec));
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
    .prepare('SELECT id, name, ext, size, char_count, chunk_count, created_at FROM documents ORDER BY id DESC')
    .all() as unknown as {
    id: number;
    name: string;
    ext: string;
    size: number;
    char_count: number;
    chunk_count: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ext: r.ext,
    size: r.size,
    charCount: r.char_count,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
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

/** 全量向量块（含文档名，用于检索） */
export function allChunks(): ChunkRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.doc_id, d.name AS doc_name, c.idx, c.text, c.embedding
       FROM chunks c JOIN documents d ON d.id = c.doc_id`
    )
    .all() as unknown as {
    id: number;
    doc_id: number;
    doc_name: string;
    idx: number;
    text: string;
    embedding: Uint8Array;
  }[];
  return rows.map((r) => ({
    id: r.id,
    docId: r.doc_id,
    docName: r.doc_name,
    idx: r.idx,
    text: r.text,
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

export { DATA_DIR };