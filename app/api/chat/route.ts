/**
 * 问答流式接口：向量检索 → RAG prompt（含多轮历史）→ 流式回答 → 自动存档。
 * 输出 NDJSON：{type:'delta',text} | {type:'sources',sources,refs} | {type:'error',message}
 * 请求体：{ message, sessionId?, docIds? }
 *   - sessionId 缺省时自动新建会话；docIds 缺省时使用会话保存的范围，空数组 = 全部文档
 * API Key 透传：请求头 x-api-key 优先（BYOK），否则 .env.local 的 LLM_API_KEY 兜底。
 */
import { NextRequest } from 'next/server';
import {
  allChunks,
  createSession,
  getSession,
  appendMessage,
  listMessages,
  touchSession,
  deleteSession,
  type ChunkRecord,
} from '@/lib/db';
import { embedText } from '@/lib/embed';
import { hybridSearch } from '@/lib/search';
import { mmrSelect, MMR_LAMBDA } from '@/lib/rerank';
import { withNeighborContext } from '@/lib/context';
import {
  buildRagMessages,
  extractRefs,
  RAG_TOP_K,
  RAG_MIN_SCORE,
  HISTORY_LIMIT,
  type SourceHit,
} from '@/lib/rag';
import { streamChat, type ChatMsg } from '@/lib/llm';

export const runtime = 'nodejs';

interface ChatBody {
  message?: string;
  sessionId?: number;
  docIds?: number[];
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return Response.json({ error: '缺少 message' }, { status: 400 });

  // 会话解析：无 id 自动新建；有 id 需存在
  let sessionId = Number(body.sessionId) || 0;
  if (sessionId > 0 && !getSession(sessionId)) {
    return Response.json({ error: '会话不存在' }, { status: 404 });
  }
  if (sessionId === 0) {
    sessionId = createSession('新会话', body.docIds ?? []);
  }

  // 检索范围：请求指定 > 会话已保存 > 全部文档
  let scopeDocIds = body.docIds;
  if (!scopeDocIds) scopeDocIds = getSession(sessionId)?.docIds ?? [];

  // 多轮历史（最近 HISTORY_LIMIT 条，原样恢复角色）
  const history: ChatMsg[] = [];
  for (const m of listMessages(sessionId).slice(-HISTORY_LIMIT)) {
    if (m.role === 'user' || m.role === 'assistant') {
      history.push({ role: m.role, content: m.content });
    }
  }

  // 配置解析：请求头优先（BYOK），环境变量兜底
  const apiKey = req.headers.get('x-api-key')?.trim() || process.env.LLM_API_KEY?.trim() || '';
  const baseURL =
    req.headers.get('x-base-url')?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    'https://api.deepseek.com/v1';
  const model = req.headers.get('x-model')?.trim() || process.env.LLM_MODEL?.trim() || 'deepseek-chat';

  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(baseURL);
  if (!apiKey && !isLocal) {
    return Response.json(
      { error: '未配置 API Key：请在问答页「设置」中填写，或在 .env.local 配置 LLM_API_KEY（Ollama 本地模型无需 Key）' },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      let answered = false;
      try {
        let candidates: ChunkRecord[] = allChunks();
        if (candidates.length === 0) {
          send({ type: 'error', message: '文档库为空，请先到首页上传文档' });
          return;
        }
        // 按会话范围过滤
        if (scopeDocIds.length > 0) {
          const set = new Set(scopeDocIds);
          candidates = candidates.filter((c) => set.has(c.docId));
          if (candidates.length === 0) {
            send({ type: 'error', message: '当前会话选定的文档范围内没有可检索的内容，请调整文档范围' });
            return;
          }
        }
        const qvec = await embedText(message);
        // 混合检索：向量语义 + BM25 关键词，RRF 融合（多取候选供后续重排）
        const fused = hybridSearch({
          embeddings: candidates.map((c) => c.embedding),
          texts: candidates.map((c) => c.text),
          queryEmbedding: qvec,
          query: message,
          k: RAG_TOP_K * 3,
          vectorMin: RAG_MIN_SCORE,
        });
        if (fused.length === 0) {
          send({ type: 'error', message: '没有检索到与问题相关的资料，换个问法或补充文档试试' });
          return;
        }

        // MMR 多样性重排：从扩大的候选里去掉冗余块，保留信息量最大的 top-k
        const fusedByIndex = new Map(fused.map((h) => [h.index, h]));
        const top = mmrSelect({
          items: fused.map((h) => ({
            index: h.index,
            score: h.rrf,
            vector: candidates[h.index].embedding,
            docId: candidates[h.index].docId,
          })),
          k: RAG_TOP_K,
          lambda: MMR_LAMBDA,
        });
        const selected = top.length > 0 ? top : fused.slice(0, RAG_TOP_K).map((h) => h);

        // 邻块上下文扩展：命中块并入同文档相邻块，答案更完整
        const centers = selected.map((it) => candidates[it.index]);
        const expanded = withNeighborContext(candidates, centers);

        const sources: SourceHit[] = selected.map((it, rank) => {
          const h = fusedByIndex.get(it.index);
          return {
            n: rank + 1,
            docName: candidates[it.index].docName,
            idx: candidates[it.index].idx,
            text: expanded[rank],
            score: h?.vectorScore ?? 0,
            keywordScore: h?.keywordScore ?? 0,
          };
        });

        // 存档用户提问（先存，失败时也能在会话里看到）
        appendMessage(sessionId, 'user', message);
        touchSession(sessionId, message);
        // 回传会话 id（前端无会话请求时用于自动绑定）
        send({ type: 'session', id: sessionId });

        const messages = buildRagMessages(message, sources, history);
        const answer = await streamChat(
          { apiKey, baseURL, model },
          messages,
          (t) => send({ type: 'delta', text: t }),
          req.signal
        );
        answered = true;
        const refs = extractRefs(answer);
        send({ type: 'sources', sources, refs });
        // 存档回答（含引用来源 JSON）
        appendMessage(sessionId, 'assistant', answer, JSON.stringify(sources));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: 'error', message: msg });
      } finally {
        if (!answered && sessionId) {
          // 本轮未产出回答，避免产生孤立空会话：无历史消息的会话删除
          if (listMessages(sessionId).length === 0) deleteSession(sessionId);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
  });
}