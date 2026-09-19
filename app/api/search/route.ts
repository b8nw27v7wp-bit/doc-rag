/** 全文检索：GET /api/search?q=关键词&limit=20&mode=bm25|like（默认 bm25，零命中回退 like） */
import { NextRequest } from 'next/server';
import { searchChunks, searchChunksBM25 } from '@/lib/db';
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
  const mode = (searchParams.get('mode') ?? 'bm25').toLowerCase();
  if (mode !== 'bm25' && mode !== 'like') {
    return Response.json({ error: 'mode 参数无效（bm25|like）' }, { status: 400 });
  }
  if (mode === 'like') {
    const results = searchChunks(q, limit);
    return Response.json({ query: q, total: results.length, results, mode: 'like' });
  }
  // 默认 BM25（中文 bigram，对专有名词/分词更友好），零命中时回退 LIKE 保底
  let results: { docId: number; docName: string; idx: number; text: string; snippet: string; score?: number }[] =
    searchChunksBM25(q, limit);
  let usedMode = 'bm25';
  if (results.length === 0) {
    results = searchChunks(q, limit);
    usedMode = 'like-fallback';
  }
  return Response.json({ query: q, total: results.length, results, mode: usedMode });
}