/** 会话管理：列表 / 新建 / 删除 / 重命名 */
import { NextRequest } from 'next/server';
import {
  listSessions,
  createSession,
  deleteSession,
  updateSessionTitle,
  updateSessionDocIds,
  setSessionPinned,
  sessionCount,
} from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ sessions: listSessions(), count: sessionCount() });
}

export async function POST(req: NextRequest) {
  let body: { title?: string; docIds?: number[] } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const id = createSession(body.title ?? '', body.docIds ?? []);
  return Response.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  const body = (await req.json().catch(() => ({}))) as { title?: string; docIds?: number[]; pinned?: boolean };
  if (!id) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  if (body.title !== undefined) updateSessionTitle(id, body.title);
  if (body.docIds !== undefined) updateSessionDocIds(id, body.docIds);
  if (body.pinned !== undefined) setSessionPinned(id, body.pinned);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  deleteSession(id);
  return Response.json({ ok: true });
}