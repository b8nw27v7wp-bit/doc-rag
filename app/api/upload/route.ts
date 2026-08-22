/** 上传解析：multipart → 解析 → 分块 → 本地嵌入（信号量并发控制）→ 入库（支持多文件） */
import { NextRequest } from 'next/server';
import { parseDocument } from '@/lib/parse';
import { chunkStructured } from '@/lib/chunk';
import { embedTexts, embedInfo } from '@/lib/embed';
import { insertDocument, findDocumentByHash } from '@/lib/db';
import { contentHash } from '@/lib/hash';
import { buildContext, contextualize } from '@/lib/contextualize';
import { topKeywords } from '@/lib/keywords';
import { embedSemaphore } from '@/lib/semaphore';
import { createRateLimiter, clientIpKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';

function parseEnvInt(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.floor(n));
}
const MAX_FILES = parseEnvInt(process.env.MAX_FILES, 20, 1);
const MAX_UPLOAD_MB = parseEnvInt(process.env.MAX_UPLOAD_MB, 50, 1);
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const _rawTotal = process.env.MAX_TOTAL_MB;
const MAX_TOTAL_MB = _rawTotal !== undefined && _rawTotal !== ''
  ? parseEnvInt(_rawTotal, Math.min(MAX_FILES * MAX_UPLOAD_MB, 200), 1)
  : Math.min(MAX_FILES * MAX_UPLOAD_MB, 200);
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024;
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

interface UploadResult {
  ok: boolean;
  name: string;
  id?: number;
  chars?: number;
  chunks?: number;
  /** 重复文档跳过（不算失败） */
  skipped?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  if (!uploadLimiter.tryAcquire(clientIpKey(req))) {
    return Response.json({ error: '上传过于频繁，请稍后再试' }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const files = form
    .getAll('files')
    .filter((f): f is File => typeof f === 'object' && f !== null && 'name' in f && 'arrayBuffer' in f);

  if (files.length === 0) {
    return Response.json({ error: '未选择文件' }, { status: 400 });
  }
  // 总量保护：避免 20*50MB 瞬间打爆容器内存
  const totalBytes = files.reduce((s, f) => s + (typeof f.size === 'number' ? f.size : 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json({ error: `本次上传总量 ${Math.round(totalBytes / 1024 / 1024)}MB 超过上限 ${MAX_TOTAL_MB}MB，请分批上传` }, { status: 413 });
  }

  const results: UploadResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (i >= MAX_FILES) {
      results.push({ ok: false, name: file.name, error: `超出单次上传文件数上限（${MAX_FILES} 个），已忽略` });
      continue;
    }
    if (file.size > MAX_BYTES) {
      results.push({ ok: false, name: file.name, error: `文件超过大小上限 ${MAX_UPLOAD_MB}MB` });
      continue;
    }
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const hash = contentHash(buf);
      // 重复检测：同名同内容不重复入库
      const dupId = findDocumentByHash(file.name, hash);
      if (dupId !== null) {
        results.push({ ok: false, skipped: true, name: file.name, error: `重复文档，已存在（id=${dupId}）` });
        continue;
      }
      const parsed = await parseDocument(file.name, buf);
      const structured = chunkStructured(parsed.text);
      if (structured.length === 0) throw new Error('未能切分文本');
      const total = structured.length;
      // 上下文检索：embedding 文本 = 上下文头（文档名·章节·位置）+ 原文
      const contexts = structured.map((s, i) => buildContext(parsed.name, s.path, i, total));
      // 嵌入并发闸：避免多个上传/重嵌入任务同时压满资源，带超时避免永久挂起
      const release = await embedSemaphore.acquire({ timeoutMs: 120_000, signal: req.signal });
      try {
        if (req.signal.aborted) throw new Error('请求已取消');
        const vecs = await embedTexts(structured.map((s, i) => contextualize(parsed.name, s.path, i, total, s.text)));
        const meta = embedInfo();
        const id = insertDocument(
          parsed.name,
          parsed.ext,
          buf.length,
          structured.map((s, i) => ({ text: s.text, vec: vecs[i], context: contexts[i] })),
          hash,
          topKeywords(parsed.text),
          { model: meta.model, dtype: meta.dtype, dim: vecs[0]?.length ?? meta.dim }
        );
        results.push({ ok: true, id, name: parsed.name, chars: parsed.charCount, chunks: total });
      } finally {
        release();
      }
    } catch (e) {
      results.push({ ok: false, name: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  // 全部失败且有真实错误 → 422；全部跳过（重复）或部分成功 → 200
  return Response.json({ results, failed, skipped }, { status: okCount === 0 && failed > 0 ? 422 : 200 });
}