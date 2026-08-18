/** 会话消息查询：恢复对话与引用重放 */
import { NextRequest } from 'next/server';
import { listMessages, getSession } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sessionId = Number(new URL(req.url).searchParams.get('session'));
  if (!sessionId) return Response.json({ error: '缺少 session 参数' }, { status: 400 });
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: '会话不存在' }, { status: 404 });
  const messages = listMessages(sessionId).map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    // assistant 消息携带引用来源（恢复后可重放引用面板）
    refs: m.refs ? safeParse(m.refs) : undefined,
  }));
  return Response.json({ session, messages });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}