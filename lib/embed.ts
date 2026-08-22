/**
 * 本地嵌入：transformers.js 加载多语言 MiniLM 模型，完全本地推理，无 API 费用。
 * 模型默认 Xenova/paraphrase-multilingual-MiniLM-L12-v2（q8 量化，约 112MB，支持中英等 50+ 语言）。
 * 首次加载自动从 HF 下载（国内网络需配置 HF_ENDPOINT=https://hf-mirror.com）。
 */
import { pipeline, env } from '@huggingface/transformers';

// 注意：必须在模块加载期设置，之后模型 URL 才指向镜像
env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com';
// 缓存目录可通过 TRANSFORMERS_CACHE / HF_HOME 覆盖；Docker 构建期预下载的模型需与运行时路径一致
if (process.env.TRANSFORMERS_CACHE) {
  env.cacheDir = process.env.TRANSFORMERS_CACHE;
} else if (process.env.HF_HOME) {
  env.cacheDir = process.env.HF_HOME;
}

export const EMBED_MODEL = process.env.EMBED_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const EMBED_DTYPE = (process.env.EMBED_DTYPE || 'q8') as 'q8' | 'auto';
export const EMBED_DIM = 384;

/** 当前嵌入配置元信息（写入文档记录，供模型版本校验/升级） */
export function embedInfo(): { model: string; dtype: string; dim: number } {
  return { model: EMBED_MODEL, dtype: EMBED_DTYPE, dim: EMBED_DIM };
}

// v4 不再导出 Pipeline 类型，用结构类型描述所需最小表面
interface EmbedOutput {
  dims: number[];
  data: Float32Array;
}
interface Extractor {
  (texts: string[], options: { pooling: 'mean'; normalize: boolean }): Promise<EmbedOutput>;
}

let pipePromise: Promise<Extractor> | null = null;
let resolvedDim: number | null = null;

function getExtractor(): Promise<Extractor> {
  if (!pipePromise) {
    pipePromise = (pipeline('feature-extraction', EMBED_MODEL, { dtype: EMBED_DTYPE }) as unknown as Promise<Extractor>).catch(
      (e) => {
        pipePromise = null;
        throw e;
      }
    );
  }
  return pipePromise;
}

/** 若已加载过模型，返回真实维度，否则返回配置默认值 */
export function resolvedEmbedDim(): number {
  return resolvedDim ?? EMBED_DIM;
}

/** 嵌入模型有效上下文窗口（字符近似）：paraphrase-multilingual-MiniLM-L12-v2 仅 128 token，
 *  600 字块远超窗口，尾部语义会被截断。按 220 字符滑窗切分后均值池化可保留全文信号。 */
export const EMBED_WINDOW_CHARS = 220;
export const EMBED_WINDOW_OVERLAP = 40;

function splitForEmbed(text: string): string[] {
  if (text.length <= EMBED_WINDOW_CHARS) return [text];
  const windows: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + EMBED_WINDOW_CHARS, text.length);
    windows.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - EMBED_WINDOW_OVERLAP;
    if (start < 0) start = 0;
  }
  return windows;
}

function normalizeVec(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/**
 * 批量嵌入文本，返回归一化向量（可直接做点积相似度）。
 * 长文本按滑窗切分后均值池化，避免 128 token 截断导致块尾语义丢失。
 * 输出与输入顺序一一对应。
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  // 构建滑窗展开的批量请求
  const flat: string[] = [];
  const mapping: number[] = []; // flat index -> original index
  const counts: number[] = new Array(texts.length).fill(0);
  for (let i = 0; i < texts.length; i++) {
    const wins = splitForEmbed(texts[i]);
    counts[i] = wins.length;
    for (const w of wins) {
      flat.push(w);
      mapping.push(i);
    }
  }
  if (flat.length === 0) return [];
  const out = await extractor(flat, { pooling: 'mean', normalize: true });
  const dims = out.dims as number[]; // [n, dim]
  const n = dims[0];
  const d = dims.length > 1 ? dims[1] : EMBED_DIM;
  resolvedDim = d;
  const data = out.data as Float32Array;
  const windowVecs: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const row = new Float32Array(d);
    row.set(data.subarray(i * d, (i + 1) * d));
    windowVecs.push(row);
  }
  // 单窗直接返回，多窗均值池化并重新归一化
  const result: Float32Array[] = [];
  let cursor = 0;
  for (let i = 0; i < texts.length; i++) {
    const cnt = counts[i];
    if (cnt === 1) {
      result.push(windowVecs[cursor]);
    } else {
      const acc = new Float32Array(d);
      for (let k = 0; k < cnt; k++) {
        const v = windowVecs[cursor + k];
        for (let j = 0; j < d; j++) acc[j] += v[j];
      }
      for (let j = 0; j < d; j++) acc[j] /= cnt;
      result.push(normalizeVec(acc));
    }
    cursor += cnt;
  }
  return result;
}

/** 单条文本嵌入（便捷方法） */
export async function embedText(text: string): Promise<Float32Array> {
  const [vec] = await embedTexts([text]);
  return vec;
}