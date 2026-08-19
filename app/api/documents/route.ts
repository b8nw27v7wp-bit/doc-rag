/** 文档列表与删除（支持单个 id 或批量 ids） */
import { NextRequest } from 'next/server';
import { listDocuments, deleteDocument, deleteDocuments, documentCount, chunkCount, dbSizeBytes } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    documents: listDocuments(),
    stats: { documents: documentCount(), chunks: chunkCount(), dbMB: Math.round((dbSizeBytes() / (1024 * 1024)) * 100) / 100 },
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  // 批量：?ids=1,2,3
  if (idsParam) {
    const ids = idsParam
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return Response.json({ error: 'ids 参数无效' }, { status: 400 });
    if (ids.length > 500) return Response.json({ error: '一次最多删除 500 份文档' }, { status: 400 });
    const deleted = deleteDocuments(ids);
    return Response.json({ ok: true, deleted });
  }
  // 单个：?id=1
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: '缺少 id 或 ids 参数' }, { status: 400 });
  deleteDocument(id);
  return Response.json({ ok: true });
}