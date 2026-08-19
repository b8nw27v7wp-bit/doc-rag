/** 文档重新嵌入：POST /api/documents/reembed { id }（换嵌入模型后重建向量） */
import { NextRequest } from 'next/server';
import { getDocument, getDocumentText, rebuildDocumentChunks } from '@/lib/db';
import { chunkStructured } from '@/lib/chunk';
import { embedTexts, embedInfo } from '@/lib/embed';
import { buildContext } from '@/lib/contextualize';
import { embedSemaphore } from '@/lib/semaphore';
import { parsePositiveInt } from '@/lib/validate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { id?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const id = parsePositiveInt(body.id, 1_000_000_000);
  if (id === null) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  const doc = getDocument(id);
  if (!doc) return Response.json({ error: '文档不存在' }, { status: 404 });
  const text = getDocumentText(id);
  if (!text.trim()) return Response.json({ error: '文档无内容' }, { status: 400 });

  const structured = chunkStructured(text);
  if (structured.length === 0) return Response.json({ error: '未能切分文本' }, { status: 422 });
  const total = structured.length;
  const contexts = structured.map((s, i) => buildContext(doc.name, s.path, i, total));

  const release = await embedSemaphore.acquire();
  try {
    const vecs = await embedTexts(structured.map((s, i) => `${contexts[i]}\n\n${s.text}`));
    const meta = embedInfo();
    const newCount = rebuildDocumentChunks(
      id,
      structured.map((s, i) => ({ text: s.text, vec: vecs[i], context: contexts[i] })),
      { model: meta.model, dtype: meta.dtype, dim: vecs[0]?.length ?? meta.dim }
    );
    return Response.json({ ok: true, id, before: doc.chunkCount, after: newCount, model: meta.model });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '重新嵌入失败' }, { status: 500 });
  } finally {
    release();
  }
}