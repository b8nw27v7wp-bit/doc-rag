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
import { hybridSearch, mergeMultiSearch, buildBM25Index, type FusionHit } from '@/lib/search';
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
import { streamChat, chatOnce, type ChatMsg } from '@/lib/llm';
import { buildQueryExpansionPrompt, parseQueryLines, MAX_QUERIES } from '@/lib/multiQuery';
import { resolveLlmConfig, type ResolvedLlmConfig } from '@/lib/llm-config';
import { isLocalBaseURL, UnsafeBaseUrlError } from '@/lib/ssrf';
import { checkCitations } from '@/lib/citations';
import { buildAnnIndex, buildAnnIndexAsync, recommendedAnnParams, type AnnIndex } from '@/lib/ann';
import { parseDocIds, parsePositiveInt, parseTemperature } from '@/lib/validate';
import { createRateLimiter, clientIpKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/** 单条问题长度上限（防超长消息撑爆上下文/滥用） */
const MAX_MESSAGE_LEN = 4000;
/** ANN 加速的最小候选块数（低于此值用精确暴力检索）；0 表示禁用 */
function parseAnnMinChunks(): number {
  const raw = process.env.ANN_MIN_CHUNKS;
  if (raw === undefined || raw === '') return 2000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 2000;
  return Math.floor(n);
}
const ANN_MIN_CHUNKS = parseAnnMinChunks();
const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
/** 语料快照 → ANN 索引缓存（allChunks 引用稳定，变更后自然失效） */
const annCache = new WeakMap<object, AnnIndex>();

interface ChatBody {
  message?: string;
  sessionId?: number;
  docIds?: number[];
  /** 是否启用多查询检索（LLM 改写，失败时自动回退单查询） */
  expand?: boolean;
  /** 采样温度（可选，覆盖服务端默认） */
  temperature?: number;
  /** 最大生成 token 数（可选） */
  maxTokens?: number;
}

export async function POST(req: NextRequest) {
  if (!chatLimiter.tryAcquire(clientIpKey(req))) {
    return Response.json({ error: '提问过于频繁，请稍后再试' }, { status: 429 });
  }
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return Response.json({ error: '缺少 message' }, { status: 400 });
  if (message.length > MAX_MESSAGE_LEN) {
    return Response.json({ error: `问题过长（最多 ${MAX_MESSAGE_LEN} 字）` }, { status: 400 });
  }
  if (body.docIds !== undefined) {
    const parsed = parseDocIds(body.docIds);
    if (parsed === null) return Response.json({ error: 'docIds 参数无效' }, { status: 400 });
    body.docIds = parsed;
  }
  if (body.maxTokens !== undefined) {
    const v = parsePositiveInt(body.maxTokens, 100_000);
    if (v === null) return Response.json({ error: 'maxTokens 参数无效（1~100000）' }, { status: 400 });
    body.maxTokens = v;
  }
  if (body.temperature !== undefined) {
    if (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2) {
      return Response.json({ error: 'temperature 参数无效（0~2）' }, { status: 400 });
    }
  }
  if (body.expand !== undefined && typeof body.expand !== 'boolean') {
    return Response.json({ error: 'expand 必须为布尔值' }, { status: 400 });
  }

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

  // 配置解析：请求头优先（BYOK），环境变量兜底；baseURL 经 SSRF 校验
  let cfg: ResolvedLlmConfig;
  try {
    cfg = resolveLlmConfig(req);
  } catch (e) {
    return Response.json(
      { error: e instanceof UnsafeBaseUrlError ? e.message : '端点地址无效' },
      { status: 400 }
    );
  }

  if (!cfg.apiKey && !isLocalBaseURL(cfg.baseURL)) {
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
        // 多查询检索（可选）：LLM 把问题改写成多个检索查询，失败时回退单查询
        const queries = [message];
        if (body.expand) {
          try {
            const expanded = parseQueryLines(await chatOnce(cfg, buildQueryExpansionPrompt(message)));
            for (const q of expanded) if (!queries.includes(q)) queries.push(q);
          } catch {
            // 忽略：改写失败仍用原问题检索
          }
        }

        if (req.signal.aborted) throw new Error('请求已取消');
        const qvecFirst = await embedText(message);
        if (req.signal.aborted) throw new Error('请求已取消');
        const texts = candidates.map((c) => c.text);
        // BM25 索引只建一次，跨查询复用（多查询检索不再重复分词）
        const bm25 = buildBM25Index(texts);

        // 嵌入维度一致性：旧模型生成的块跳过向量检索（仅关键词召回）并提示
        const dimMask = candidates.map((c) => c.embedding.length === qvecFirst.length);
        const legacyCount = candidates.length - dimMask.filter(Boolean).length;
        if (legacyCount > 0) {
          send({
            type: 'warning',
            message: `文档库存在 ${legacyCount} 块由其他嵌入模型生成（向量维度不一致），已仅按关键词召回，建议对相关文档重新入库`,
          });
        }
        const embeddings = candidates.map((c, i) => (dimMask[i] ? c.embedding : null));

        // 大库 + 无范围过滤 + 维度一致时启用 ANN 加速（索引随语料快照缓存复用，异步构建避免阻塞）
        let ann: AnnIndex | undefined;
        if (scopeDocIds.length === 0 && legacyCount === 0 && ANN_MIN_CHUNKS > 0 && candidates.length >= ANN_MIN_CHUNKS) {
          ann = annCache.get(candidates);
          if (!ann) {
            const { nlist } = recommendedAnnParams(candidates.length);
            if (candidates.length >= 5000) {
              ann = await buildAnnIndexAsync(candidates.map((c) => c.embedding), { nlist });
            } else {
              ann = buildAnnIndex(candidates.map((c) => c.embedding), { nlist });
            }
            annCache.set(candidates, ann);
          }
        }
        const { nprobe } = recommendedAnnParams(candidates.length);

        const fusedByQuery: FusionHit[][] = [];
        const effectiveQueries = queries.slice(0, MAX_QUERIES + 1);
        // 并行嵌入所有查询向量（首条已嵌入）
        let qvecs: Float32Array[] = [qvecFirst];
        if (effectiveQueries.length > 1) {
          const rest = effectiveQueries.slice(1);
          const more = await Promise.all(rest.map((q) => embedText(q)));
          qvecs = [qvecFirst, ...more];
        }
        if (req.signal.aborted) throw new Error('请求已取消');
        for (let qi = 0; qi < effectiveQueries.length; qi++) {
          const qvec = qvecs[qi];
          const hits = hybridSearch({
            embeddings,
            texts,
            queryEmbedding: qvec,
            query: effectiveQueries[qi],
            k: RAG_TOP_K * 3,
            vectorMin: RAG_MIN_SCORE,
            bm25,
            ann,
            annProbe: nprobe,
          });
          if (hits.length > 0) fusedByQuery.push(hits);
        }

        // 合并各查询结果（全局 RRF）
        const fused = mergeMultiSearch(fusedByQuery, RAG_TOP_K * 3);
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
            vector: dimMask[h.index] ? candidates[h.index].embedding : null,
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

        // LLM 生成：温度/最大 token 可请求级覆盖；推理模型思考内容经 reasoning 事件透传
        const temperature = parseTemperature(body.temperature ?? undefined, cfg.temperature) ?? 0.3;
        const maxTokens =
          body.maxTokens !== undefined ? parsePositiveInt(body.maxTokens, 100_000) : cfg.maxTokens;
        const messages = buildRagMessages(message, sources, history);
        let reasoning = '';
        const answer = await streamChat(
          cfg,
          messages,
          (t) => send({ type: 'delta', text: t }),
          {
            signal: req.signal,
            timeoutMs: cfg.timeoutMs,
            temperature,
            maxTokens: maxTokens ?? undefined,
            onReasoning: (t) => {
              reasoning += t;
              send({ type: 'reasoning', text: t });
            },
          }
        );
        answered = true;
        const refs = extractRefs(answer);
        // 引用可信度：越界编号（模型编造的来源）单独回报，前端据此不渲染假引用
        const citation = checkCitations(answer, sources.length);
        send({
          type: 'sources',
          sources,
          refs,
          ...(citation.invalid.length > 0 ? { invalidRefs: citation.invalid } : {}),
        });
        // 存档回答（含引用来源 JSON；思考内容不落盘）
        void reasoning;
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