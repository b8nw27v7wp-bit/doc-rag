/** 健康检查：GET /api/health（供部署探活 / Docker healthcheck 用）
 * 设密码时匿名只回最小存活信息，防库计数泄漏；登录后回全量。
 */
import { NextRequest } from 'next/server';
import { documentCount, chunkCount, sessionCount, dbSizeBytes } from '@/lib/db';
import { embedInfo, isEmbedLoaded, resolvedEmbedDim } from '@/lib/embed';
import { embedSemaphore } from '@/lib/semaphore';
import { AUTH_COOKIE, authEnabled, isAuthorized } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req?: NextRequest) {
  const uptimeSec = Math.round(process.uptime());
  const authed = !authEnabled() || (req ? isAuthorized(req.cookies.get(AUTH_COOKIE)?.value) : true);
  // 未认证探活：只回存活，不泄漏计数/配置（Docker HEALTHCHECK 仍判 200）
  if (!authed) {
    let dbOk = true;
    try {
      documentCount();
    } catch {
      dbOk = false;
    }
    return Response.json(
      { status: dbOk ? 'ok' : 'degraded', uptimeSec },
      { status: dbOk ? 200 : 503 }
    );
  }

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
    uptimeSec,
    database: { ok: dbOk, documents, chunks, sessions, sizeBytes },
    embedding: { local: true, loaded: isEmbedLoaded(), resolvedDim: resolvedEmbedDim(), ...embedInfo() },
    jobs: { embeddingActive: embedSemaphore.active(), embeddingPending: embedSemaphore.pending() },
    llm: { configured: Boolean(process.env.LLM_API_KEY) },
    auth: { passwordEnabled: Boolean(process.env.APP_PASSWORD) },
  };

  return Response.json(body, { status: dbOk ? 200 : 503 });
}