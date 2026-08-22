/** 文档原文内容查询：GET /api/documents/content?id=3 */
import { NextRequest } from 'next/server';
import { getDocument, getDocumentText } from '@/lib/db';
import { parsePositiveInt } from '@/lib/validate';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const id = parsePositiveInt(Number(new URL(req.url).searchParams.get('id')), 1_000_000_000);
  if (id === null) return Response.json({ error: '缺少 id 参数或格式错误' }, { status: 400 });
  const doc = getDocument(id);
  if (!doc) return Response.json({ error: '文档不存在' }, { status: 404 });
  const text = getDocumentText(id);
  return Response.json({
    id: doc.id,
    name: doc.name,
    ext: doc.ext,
    size: doc.size,
    charCount: doc.charCount,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    text,
  });
}