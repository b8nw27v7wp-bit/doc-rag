/** 文档摘要生成：POST /api/documents/summarize { id }（可选 LLM 功能） */
import { NextRequest } from 'next/server';
import { getDocument, getDocumentText, setDocumentSummary } from '@/lib/db';
import { chatOnce } from '@/lib/llm';
import { buildSummaryPrompt } from '@/lib/summarize';
import { resolveLlmConfig, type ResolvedLlmConfig } from '@/lib/llm-config';
import { isLocalBaseURL, UnsafeBaseUrlError } from '@/lib/ssrf';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { id?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const id = Number(body.id);
  if (!id) return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  const doc = getDocument(id);
  if (!doc) return Response.json({ error: '文档不存在' }, { status: 404 });
  const text = getDocumentText(id);
  if (!text.trim()) return Response.json({ error: '文档无内容' }, { status: 400 });

  let cfg: ResolvedLlmConfig;
  try {
    cfg = resolveLlmConfig(req);
  } catch (e) {
    return Response.json({ error: e instanceof UnsafeBaseUrlError ? e.message : '端点地址无效' }, { status: 400 });
  }
  if (!cfg.apiKey && !isLocalBaseURL(cfg.baseURL)) {
    return Response.json({ error: '未配置 API Key，无法生成摘要' }, { status: 400 });
  }

  try {
    const summary = await chatOnce(cfg, buildSummaryPrompt(text));
    setDocumentSummary(id, summary);
    return Response.json({ ok: true, id, summary });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '摘要生成失败' }, { status: 502 });
  }
}