/** 数据备份/恢复：GET = 下载一致快照（VACUUM INTO）；POST = 上传 .db 恢复 */
import { NextRequest } from 'next/server';
import { backupDatabase, restoreDatabase, documentCount, chunkCount } from '@/lib/db';
import { createRateLimiter, clientIpKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const MAX_RESTORE_BYTES = 500 * 1024 * 1024;
const restoreLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

export async function GET() {
  try {
    const buf = backupDatabase();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="docrag-backup-${date}.db"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '备份失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!restoreLimiter.tryAcquire(clientIpKey(req))) {
    return Response.json({ error: '恢复操作过于频繁，请稍后再试' }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: '缺少 file 上传字段' }, { status: 400 });
  }
  if (file.size > MAX_RESTORE_BYTES) {
    return Response.json({ error: '备份文件过大' }, { status: 400 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    restoreDatabase(buf);
    return Response.json({ ok: true, documents: documentCount(), chunks: chunkCount() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '恢复失败' }, { status: 400 });
  }
}