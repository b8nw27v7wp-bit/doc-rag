/** 全文检索：GET /api/search?q=关键词&limit=20 */
import { NextRequest } from 'next/server';
import { searchChunks } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  if (!q) return Response.json({ error: '缺少 q 参数' }, { status: 400 });
  const results = searchChunks(q, limit);
  return Response.json({ query: q, total: results.length, results });
}