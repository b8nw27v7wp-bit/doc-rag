#!/usr/bin/env node
/**
 * CLI 批量导入：把本地文件/目录中的文档解析、分块、嵌入并入库，不经 HTTP。
 *
 * 用法（在项目根目录）：
 *   npm run import -- docs/ 论文.pdf 随手记.md
 *   DATA_DIR=/path/to/data npm run import -- 文档目录/
 *
 * 支持 txt / md / pdf / docx，目录递归扫描。
 * 耗时取决于文件量；首次运行会加载本地嵌入模型（约 30 秒~2 分钟）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, isSupported, supportedExts } from '../lib/parse';
import { chunkText } from '../lib/chunk';
import { embedTexts } from '../lib/embed';
import { insertDocument, documentCount, chunkCount } from '../lib/db';

/** 递归收集受支持的文件 */
function collectFiles(targets: string[]): string[] {
  const files: string[] = [];
  const walk = (p: string) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && isSupported(entry.name)) files.push(full);
    }
  };
  for (const t of targets) {
    const abs = path.resolve(t);
    try {
      if (statSync(abs).isDirectory()) walk(abs);
      else if (isSupported(path.basename(abs))) files.push(abs);
      else console.log(`跳过不支持的类型: ${abs}`);
    } catch {
      console.error(`路径不存在: ${abs}`);
      process.exitCode = 1;
    }
  }
  return files;
}

async function main() {
  const targets = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (targets.length === 0 || targets.includes('help') || targets.includes('--help')) {
    console.log(
      `DocRAG CLI 批量导入\n\n` +
        `用法: tsx scripts/import-cli.ts <文件或目录...>\n\n` +
        `支持格式: ${supportedExts()}\n` +
        `可用环境变量: DATA_DIR（数据目录，默认 ./data）\n`
    );
    return;
  }

  const files = collectFiles(targets);
  if (files.length === 0) {
    console.log('未找到可导入的文档');
    return;
  }
  console.log(`共发现 ${files.length} 个文档，开始处理…\n`);

  const t0 = Date.now();
  let ok = 0;
  let failed = 0;
  let totalChunks = 0;

  for (const file of files) {
    try {
      const buf = readFileSync(file);
      const parsed = await parseDocument(path.basename(file), buf);
      const chunks = chunkText(parsed.text);
      if (chunks.length === 0) throw new Error('未能切分文本');
      const vecs = await embedTexts(chunks);
      const id = insertDocument(
        parsed.name,
        parsed.ext,
        buf.length,
        chunks.map((text, i) => ({ text, vec: vecs[i] }))
      );
      ok++;
      totalChunks += chunks.length;
      console.log(`  ok    ${parsed.name}  → ${chunks.length} 块 / ${parsed.charCount.toLocaleString()} 字 (id=${id})`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${path.basename(file)}  ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    `\n完成：成功 ${ok} / 失败 ${failed}，新增 ${totalChunks} 向量块，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n` +
      `当前库：${documentCount()} 份文档 / ${chunkCount().toLocaleString()} 个向量块`
  );
  process.exit(failed > 0 && ok === 0 ? 1 : 0);
}

void main();