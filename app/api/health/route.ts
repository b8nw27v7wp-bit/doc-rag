/** 健康检查：GET /api/health（供部署探活 / Docker healthcheck 用） */
import { documentCount, chunkCount, sessionCount, dbSizeBytes } from '@/lib/db';
import { embedInfo } from '@/lib/embed';
import { embedSemaphore } from '@/lib/semaphore';

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
    embedding: { local: true, ...embedInfo() },
    jobs: { embeddingActive: embedSemaphore.active(), embeddingPending: embedSemaphore.pending() },
    llm: { configured: Boolean(process.env.LLM_API_KEY) },
    auth: { passwordEnabled: Boolean(process.env.APP_PASSWORD) },
  };

  return Response.json(body, { status: dbOk ? 200 : 503 });
}