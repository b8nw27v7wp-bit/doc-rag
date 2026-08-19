/** 健康检查：GET /api/health（供部署探活 / Docker healthcheck 用） */
import { NextResponse } from 'next/server';
import { documentCount, chunkCount, sessionCount, dbSizeBytes } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  let dbOk = true;
  let documents = 0;
  let chunks = 0;
  let sessions = 0;
  let sizeBytes = 0;
  try {
    documents = documentCount();
    chunks = chunkCount();
    sessions = sessionCount();
    sizeBytes = dbSizeBytes();
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    database: { ok: dbOk, documents, chunks, sessions, sizeBytes },
    embedding: { local: true, model: process.env.EMBED_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' },
    llm: { configured: Boolean(process.env.LLM_API_KEY) },
    auth: { passwordEnabled: Boolean(process.env.APP_PASSWORD) },
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}