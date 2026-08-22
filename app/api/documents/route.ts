/** 文档列表与删除（支持单个 id 或批量 ids） */
import { NextRequest } from 'next/server';
import { listDocuments, deleteDocument, deleteDocuments, documentCount, chunkCount, dbSizeBytes } from '@/lib/db';
import { parseIdList, parsePositiveInt, parsePagination } from '@/lib/validate';

export const runtime = 'nodejs';

export async function GET(req?: NextRequest) {
  let limit = 0;
  let offset = 0;
  if (req) {
    const pagination = parsePagination(new URL(req.url).searchParams);
    if (pagination === null) return Response.json({ error: '分页参数无效' }, { status: 400 });
    limit = pagination.limit;
    offset = pagination.offset;
  }
  const all = listDocuments();
  const total = all.length;
  const documents = limit > 0 ? all.slice(offset, offset + limit) : all;
  return Response.json({
    documents,
    total,
    stats: { documents: documentCount(), chunks: chunkCount(), dbMB: Math.round((dbSizeBytes() / (1024 * 1024)) * 100) / 100 },
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  // 批量：?ids=1,2,3
  if (idsParam) {
    const ids = parseIdList(idsParam, 500);
    if (ids === null) return Response.json({ error: 'ids 参数无效（需逗号分隔正整数，最多 500）' }, { status: 400 });
    const deleted = deleteDocuments(ids);
    return Response.json({ ok: true, deleted });
  }
  // 单个：?id=1
  const id = parsePositiveInt(Number(searchParams.get('id')), 1_000_000_000);
  if (id === null) return Response.json({ error: '缺少 id 或 ids 参数' }, { status: 400 });
  deleteDocument(id);
  return Response.json({ ok: true });
}