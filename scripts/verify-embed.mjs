import { pipeline, env } from '@huggingface/transformers';

env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com';
console.log('remoteHost:', env.remoteHost);

const embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { dtype: 'q8' });
const out = await embedder('你好世界 hello world', { pooling: 'mean', normalize: true });
console.log('dims:', out.dims, 'sample:', Array.from(out.data.slice(0, 5)));
if (out.dims[1] !== 384) throw new Error('unexpected dims');
console.log('EMBED_OK');