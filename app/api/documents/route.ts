/** 文档列表与删除 */
import { NextRequest } from 'next/server';
import { listDocuments, deleteDocument, documentCount, chunkCount, dbSizeBytes } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    documents: listDocuments(),
    stats: { documents: documentCount(), chunks: chunkCount(), dbMB: Math.round((dbSizeBytes() / (1024 * 1024)) * 100) / 100 },
  });
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  deleteDocument(id);
  return Response.json({ ok: true });
}