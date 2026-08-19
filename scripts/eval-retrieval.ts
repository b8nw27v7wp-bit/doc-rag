#!/usr/bin/env node
/**
 * 检索质量离线评估：构建一个已知主题的小型语料库，评测混合检索 / 上下文检索的
 * Recall@k / Precision@k / MRR。需要本地嵌入模型（首次运行自动下载）。
 *
 * 用法：
 *   DATA_DIR=$(mktemp -d) npx tsx scripts/eval-retrieval.ts
 *
 * 输出各项指标；全部用例 Recall@3 = 1 视为 EVAL_OK。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = process.env.DATA_DIR || mkdtempSync(path.join(tmpdir(), 'docrag-eval-'));

const { insertDocument, allChunks } = await import('../lib/db');
const { chunkStructured } = await import('../lib/chunk');
const { embedTexts, embedText } = await import('../lib/embed');
const { hybridSearch } = await import('../lib/search');
const { buildContext } = await import('../lib/contextualize');
const { recallAtK, precisionAtK, mrr } = await import('../lib/eval');

const DOCS = [
  {
    name: '量子力学实验笔记.md',
    text: '# 贝尔不等式\n\n贝尔不等式实验由阿兰·阿斯佩等人完成，证实量子纠缠与局域实在论不相容。\n\n# 应用\n\n量子纠缠协议是量子密钥分发的基础。',
  },
  {
    name: '机器学习入门.md',
    text: '# 优化算法\n\n梯度下降通过沿负梯度方向更新参数，学习率影响收敛速度，需要调参平衡。\n\n# 正则化\n\nL2 正则化抑制过拟合。',
  },
  {
    name: '家常菜谱.md',
    text: '# 红烧肉\n\n红烧肉先焯水去腥，再小火慢炖收汁，糖色用冰糖炒出枣红色。\n\n# 清蒸鱼\n\n清蒸鱼大火八分钟。',
  },
];

const CASES = [
  { q: '贝尔不等式与量子纠缠', doc: '量子力学实验笔记.md' },
  { q: '学习率怎么调', doc: '机器学习入门.md' },
  { q: '红烧肉如何收汁', doc: '家常菜谱.md' },
];

async function main() {
  console.log('准备语料库并入库（含上下文检索）…\n');
  for (const d of DOCS) {
    const structured = chunkStructured(d.text);
    const total = structured.length;
    const contexts = structured.map((s, i) => buildContext(d.name, s.path, i, total));
    const vecs = await embedTexts(structured.map((s, i) => `${contexts[i]}\n\n${s.text}`));
    insertDocument(d.name, 'md', d.text.length, structured.map((s, i) => ({ text: s.text, vec: vecs[i], context: contexts[i] })));
    console.log(`  ok  ${d.name} → ${total} 块`);
  }

  const chunks = allChunks();
  console.log(`\n库内共 ${chunks.length} 块，开始评测：\n`);

  let allOk = true;
  for (const c of CASES) {
    const qvec = await embedText(c.q);
    const hits = hybridSearch({
      embeddings: chunks.map((x) => x.embedding),
      texts: chunks.map((x) => x.text),
      queryEmbedding: qvec,
      query: c.q,
      k: 5,
      vectorMin: 0.1,
    });
    const predicted = hits.map((h) => h.index);
    const relevant = chunks.map((x, i) => (x.docName === c.doc ? i : -1)).filter((i) => i >= 0);
    const r3 = recallAtK(predicted, relevant, 3);
    const r1 = recallAtK(predicted, relevant, 1);
    const p = precisionAtK(predicted, relevant, 3);
    const m = mrr(predicted, relevant);
    const topDoc = hits.length > 0 ? chunks[hits[0].index].docName : '（无）';
    const ok = r3 === 1;
    allOk = allOk && ok;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.q}\n       Recall@1=${r1.toFixed(2)} Recall@3=${r3.toFixed(2)} P@3=${p.toFixed(2)} MRR=${m.toFixed(2)} 首命中=${topDoc}`
    );
  }

  console.log(allOk ? '\nEVAL_OK' : '\n有用例未达标');
  process.exit(allOk ? 0 : 1);
}

void main();