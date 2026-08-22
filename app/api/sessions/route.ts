/** 会话管理：列表 / 新建 / 删除 / 重命名 */
import { NextRequest } from 'next/server';
import {
  listSessions,
  createSession,
  deleteSession,
  updateSessionTitle,
  updateSessionDocIds,
  setSessionPinned,
  getSession,
  sessionCount,
} from '@/lib/db';
import { parseDocIds, parsePositiveInt, toBoundedString } from '@/lib/validate';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ sessions: listSessions(), count: sessionCount() });
}

export async function POST(req: NextRequest) {
  let body: { title?: unknown; docIds?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (body.title !== undefined && typeof body.title !== 'string') {
    return Response.json({ error: 'title 必须为字符串' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? toBoundedString(body.title, 80) ?? '' : '';
  let docIds: number[] = [];
  if (body.docIds !== undefined) {
    const parsed = parseDocIds(body.docIds);
    if (parsed === null) return Response.json({ error: 'docIds 参数无效' }, { status: 400 });
    docIds = parsed;
  }
  const id = createSession(title, docIds);
  return Response.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parsePositiveInt(Number(searchParams.get('id')), 1_000_000_000);
  if (id === null) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  if (!getSession(id)) return Response.json({ error: '会话不存在' }, { status: 404 });
  let body: { title?: unknown; docIds?: unknown; pinned?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') return Response.json({ error: 'title 必须为字符串' }, { status: 400 });
    const bounded = toBoundedString(body.title, 80);
    if (bounded === null && body.title.trim() !== '') return Response.json({ error: 'title 无效' }, { status: 400 });
    updateSessionTitle(id, bounded ?? '');
  }
  if (body.docIds !== undefined) {
    const parsed = parseDocIds(body.docIds);
    if (parsed === null) return Response.json({ error: 'docIds 参数无效' }, { status: 400 });
    updateSessionDocIds(id, parsed);
  }
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== 'boolean') return Response.json({ error: 'pinned 必须为布尔值' }, { status: 400 });
    setSessionPinned(id, body.pinned);
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = parsePositiveInt(Number(new URL(req.url).searchParams.get('id')), 1_000_000_000);
  if (id === null) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  deleteSession(id);
  return Response.json({ ok: true });
}