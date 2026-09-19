/** 文档重新嵌入：POST /api/documents/reembed { id } 单篇或 { ids: number[] } 批量（换嵌入模型后重建向量） */
import { NextRequest } from 'next/server';
import { getDocument, getDocumentText, rebuildDocumentChunks } from '@/lib/db';
import { chunkStructured } from '@/lib/chunk';
import { embedTexts, embedInfo } from '@/lib/embed';
import { buildContext, contextualize } from '@/lib/contextualize';
import { embedSemaphore } from '@/lib/semaphore';
import { parseDocIds, parsePositiveInt } from '@/lib/validate';

export const runtime = 'nodejs';

async function reembedOne(id: number, signal?: AbortSignal) {
  const doc = getDocument(id);
  if (!doc) throw new Error('文档不存在');
  const text = getDocumentText(id);
  if (!text.trim()) throw new Error('文档无内容');
  const structured = chunkStructured(text);
  if (structured.length === 0) throw new Error('未能切分文本');
  const total = structured.length;
  const contexts = structured.map((s, i) => buildContext(doc.name, s.path, i, total));
  const release = await embedSemaphore.acquire({ timeoutMs: 120_000, signal });
  try {
    if (signal?.aborted) throw new Error('请求已取消');
    const vecs = await embedTexts(structured.map((s, i) => contextualize(doc.name, s.path, i, total, s.text)));
    const meta = embedInfo();
    const newCount = rebuildDocumentChunks(
      id,
      structured.map((s, i) => ({ text: s.text, vec: vecs[i], context: contexts[i] })),
      { model: meta.model, dtype: meta.dtype, dim: vecs[0]?.length ?? meta.dim }
    );
    return { before: doc.chunkCount, after: newCount, model: meta.model };
  } finally {
    release();
  }
}

export async function POST(req: NextRequest) {
  let body: { id?: unknown; ids?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  // 批量：{ ids: [1,2,3] }，逐篇处理并汇总（换模型后一键全库重建）
  if (body.ids !== undefined) {
    const ids = parseDocIds(body.ids, 200);
    if (ids === null) return Response.json({ error: 'ids 参数无效（正整数数组，最多 200）' }, { status: 400 });
    const results: { id: number; ok: boolean; before?: number; after?: number; error?: string }[] = [];
    for (const id of ids) {
      if (req.signal.aborted) break;
      try {
        const r = await reembedOne(id, req.signal);
        results.push({ id, ok: true, ...r });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return Response.json({ ok: true, results, succeeded, failed: results.length - succeeded });
  }
  const id = parsePositiveInt(body.id, 1_000_000_000);
  if (id === null) return Response.json({ error: '缺少 id 或 ids 参数' }, { status: 400 });
  try {
    const r = await reembedOne(id, req.signal);
    return Response.json({ ok: true, id, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '重新嵌入失败';
    const status = msg === '文档不存在' ? 404 : 500;
    return Response.json({ error: msg }, { status });
  }
}