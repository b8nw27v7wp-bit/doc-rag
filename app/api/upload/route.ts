/** 上传解析：multipart → 解析 → 分块 → 本地嵌入 → 入库（支持多文件） */
import { NextRequest } from 'next/server';
import { parseDocument } from '@/lib/parse';
import { chunkText } from '@/lib/chunk';
import { embedTexts } from '@/lib/embed';
import { insertDocument } from '@/lib/db';

export const runtime = 'nodejs';

interface UploadResult {
  ok: boolean;
  name: string;
  id?: number;
  chars?: number;
  chunks?: number;
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
  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const parsed = await parseDocument(file.name, buf);
      const chunks = chunkText(parsed.text);
      if (chunks.length === 0) throw new Error('未能切分文本');
      // 本地嵌入（首次调用会加载模型，约 30 秒，之后常驻内存）
      const vecs = await embedTexts(chunks);
      const id = insertDocument(
        parsed.name,
        parsed.ext,
        buf.length,
        chunks.map((text, i) => ({ text, vec: vecs[i] }))
      );
      results.push({ ok: true, id, name: parsed.name, chars: parsed.charCount, chunks: chunks.length });
    } catch (e) {
      results.push({ ok: false, name: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return Response.json({ results, failed }, { status: failed === results.length ? 422 : 200 });
}