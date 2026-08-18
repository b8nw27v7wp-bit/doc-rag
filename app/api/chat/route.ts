/**
 * 问答流式接口：向量检索 → RAG prompt → 流式回答。
 * 输出 NDJSON：{type:'delta',text} | {type:'sources',sources,refs} | {type:'error',message}
 * API Key 透传：请求头 x-api-key 优先（BYOK），否则 .env.local 的 LLM_API_KEY 兜底。
 */
import { NextRequest } from 'next/server';
import { allChunks } from '@/lib/db';
import { embedText } from '@/lib/embed';
import { topK } from '@/lib/vector';
import { buildRagMessages, extractRefs, RAG_TOP_K, RAG_MIN_SCORE, type SourceHit } from '@/lib/rag';
import { streamChat } from '@/lib/llm';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return Response.json({ error: '缺少 message' }, { status: 400 });

  // 配置解析：请求头优先（BYOK），环境变量兜底
  const apiKey = req.headers.get('x-api-key')?.trim() || process.env.LLM_API_KEY?.trim() || '';
  const baseURL =
    req.headers.get('x-base-url')?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    'https://api.deepseek.com/v1';
  const model = req.headers.get('x-model')?.trim() || process.env.LLM_MODEL?.trim() || 'deepseek-chat';

  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(baseURL);
  if (!apiKey && !isLocal) {
    return Response.json({ error: '未配置 API Key：请在问答页「设置」中填写，或在 .env.local 配置 LLM_API_KEY（Ollama 本地模型无需 Key）' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        const chunks = allChunks();
        if (chunks.length === 0) {
          send({ type: 'error', message: '文档库为空，请先到首页上传文档' });
          return;
        }
        const qvec = await embedText(message);
        const hits = topK(chunks.map((c) => c.embedding), qvec, RAG_TOP_K, RAG_MIN_SCORE);
        if (hits.length === 0) {
          send({ type: 'error', message: '没有检索到与问题相关的资料，换个问法或补充文档试试' });
          return;
        }
        const sources: SourceHit[] = hits.map((h) => ({
          n: h.index + 1,
          docName: chunks[h.index].docName,
          idx: chunks[h.index].idx,
          text: chunks[h.index].text.slice(0, 300),
          score: Math.round(h.score * 100) / 100,
        }));

        const messages = buildRagMessages(message, sources);
        const answer = await streamChat({ apiKey, baseURL, model }, messages, (t) => send({ type: 'delta', text: t }), req.signal);
        send({ type: 'sources', sources, refs: extractRefs(answer) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
  });
}