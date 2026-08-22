/** 全文检索：GET /api/search?q=关键词&limit=20 */
import { NextRequest } from 'next/server';
import { searchChunks } from '@/lib/db';
import { parsePositiveInt, toBoundedString } from '@/lib/validate';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get('q') ?? '';
  const q = toBoundedString(rawQ, 200);
  if (!q) return Response.json({ error: '缺少 q 参数' }, { status: 400 });
  let limit = 20;
  const limitRaw = searchParams.get('limit');
  if (limitRaw !== null) {
    const parsed = parsePositiveInt(Number(limitRaw), 100);
    if (parsed === null) return Response.json({ error: 'limit 参数无效（1~100）' }, { status: 400 });
    limit = parsed;
  }
  const results = searchChunks(q, limit);
  return Response.json({ query: q, total: results.length, results });
}