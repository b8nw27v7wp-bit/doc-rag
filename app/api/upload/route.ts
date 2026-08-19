/** 上传解析：multipart → 解析 → 分块 → 本地嵌入 → 入库（支持多文件） */
import { NextRequest } from 'next/server';
import { parseDocument } from '@/lib/parse';
import { chunkStructured } from '@/lib/chunk';
import { embedTexts } from '@/lib/embed';
import { insertDocument, findDocumentByHash } from '@/lib/db';
import { contentHash } from '@/lib/hash';
import { buildContext } from '@/lib/contextualize';

export const runtime = 'nodejs';

const MAX_FILES = Number(process.env.MAX_FILES) || 20;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

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
      const vecs = await embedTexts(structured.map((s, i) => `${contexts[i]}\n\n${s.text}`));
      const id = insertDocument(
        parsed.name,
        parsed.ext,
        buf.length,
        structured.map((s, i) => ({ text: s.text, vec: vecs[i], context: contexts[i] })),
        hash
      );
      results.push({ ok: true, id, name: parsed.name, chars: parsed.charCount, chunks: total });
    } catch (e) {
      results.push({ ok: false, name: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  return Response.json({ results, failed, skipped }, { status: okCount === 0 ? 422 : 200 });
}