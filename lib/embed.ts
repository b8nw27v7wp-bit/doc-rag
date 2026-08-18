/**
 * 本地嵌入：transformers.js 加载多语言 MiniLM 模型，完全本地推理，无 API 费用。
 * 模型默认 Xenova/paraphrase-multilingual-MiniLM-L12-v2（q8 量化，约 112MB，支持中英等 50+ 语言）。
 * 首次加载自动从 HF 下载（国内网络需配置 HF_ENDPOINT=https://hf-mirror.com）。
 */
import { pipeline, env } from '@huggingface/transformers';

// 注意：必须在模块加载期设置，之后模型 URL 才指向镜像
env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com';

const EMBED_MODEL = process.env.EMBED_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const EMBED_DTYPE = (process.env.EMBED_DTYPE || 'q8') as 'q8' | 'auto';
const EMBED_DIM = 384;

// v4 不再导出 Pipeline 类型，用结构类型描述所需最小表面
interface EmbedOutput {
  dims: number[];
  data: Float32Array;
}
interface Extractor {
  (texts: string[], options: { pooling: 'mean'; normalize: boolean }): Promise<EmbedOutput>;
}

let pipePromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!pipePromise) {
    pipePromise = pipeline('feature-extraction', EMBED_MODEL, { dtype: EMBED_DTYPE }) as unknown as Promise<Extractor>;
  }
  return pipePromise;
}

/**
 * 批量嵌入文本，返回归一化向量（可直接做点积相似度）。
 * 输出与输入顺序一一对应。
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  const dims = out.dims as number[]; // [n, 384]
  const n = dims[0];
  const d = dims.length > 1 ? dims[1] : EMBED_DIM;
  const data = out.data as Float32Array;
  const result: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Float32Array(d);
    row.set(data.subarray(i * d, (i + 1) * d));
    result.push(row);
  }
  return result;
}

/** 单条文本嵌入（便捷方法） */
export async function embedText(text: string): Promise<Float32Array> {
  const [vec] = await embedTexts([text]);
  return vec;
}