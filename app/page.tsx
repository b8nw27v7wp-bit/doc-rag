import { listDocuments, documentCount, chunkCount, dbSizeBytes } from '@/lib/db';
import UploadDropzone from '@/components/upload';
import DocBrowser from '@/components/doc-browser';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const docs = listDocuments().map((d) => ({
    id: d.id,
    name: d.name,
    ext: d.ext,
    size: d.size,
    charCount: d.charCount,
    chunkCount: d.chunkCount,
    createdAt: d.createdAt,
  }));
  const stats = {
    documents: documentCount(),
    chunks: chunkCount().toLocaleString(),
    dbMB: (dbSizeBytes() / 1048576).toFixed(2),
  };

  return (
    <div className="flex flex-col gap-12 pt-14">
      <section className="flex flex-col gap-3">
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">
          让文档自己回答问题
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-[#6e6e73]">
          上传文档即可提问。文档解析、嵌入、向量检索全部在你的电脑本地完成 ——
          内容与向量数据不出设备一步，零 API 嵌入成本。
          回答可接入任意 OpenAI 兼容模型（DeepSeek / GLM / Kimi / Ollama 本地模型）。
        </p>
        <div className="mt-1 flex gap-6 text-[13px] text-[#86868b]">
          <span>{stats.documents} 份文档</span>
          <span>{stats.chunks} 个向量块</span>
          <span>本地库 {stats.dbMB} MB</span>
        </div>
      </section>

      <section>
        <UploadDropzone />
      </section>

      <section className="flex flex-col">
        <h2 className="mb-2 text-[15px] font-medium">文档库</h2>
        <DocBrowser docs={docs} />
      </section>
    </div>
  );
}