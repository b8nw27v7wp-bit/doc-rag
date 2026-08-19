/** 会话导出 Markdown：GET /api/sessions/export?id=3（缺省导出全部会话） */
import { NextRequest } from 'next/server';
import { listSessions, getSession, listMessages } from '@/lib/db';
import { sessionToMarkdown, sessionsToMarkdown, type ExportMessage } from '@/lib/export';

export const runtime = 'nodejs';

function toExportMessage(refs: string, content: string, role: 'user' | 'assistant'): ExportMessage {
  return { role, content, refs };
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\n\r\t]/g, '').trim();
  return clean.slice(0, 64) || '会话';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));

  let content: string;
  let filename: string;

  if (id) {
    const s = getSession(id);
    if (!s) return Response.json({ error: '会话不存在' }, { status: 404 });
    const messages = listMessages(id).map((m) => toExportMessage(m.refs, m.content, m.role));
    content = sessionToMarkdown(s.title, messages);
    filename = `${sanitizeFilename(s.title)}.md`;
  } else {
    const sessions = listSessions().map((s) => ({
      title: s.title,
      messages: listMessages(s.id).map((m) => toExportMessage(m.refs, m.content, m.role)),
    }));
    if (sessions.length === 0) return Response.json({ error: '暂无会话可导出' }, { status: 404 });
    content = sessionsToMarkdown(sessions);
    filename = 'docrag-会话导出.md';
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}