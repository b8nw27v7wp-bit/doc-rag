#!/usr/bin/env node
/**
 * CLI 数据备份：生成一致性快照到 DATA_DIR/backups，自动轮转保留最近 N 份。
 *
 * 用法：
 *   npm run backup -- [输出目录] [--keep 7]
 *   DATA_DIR=/path/to/data npm run backup
 *
 * 默认输出 DATA_DIR/backups/docrag-YYYYMMDD-HHmmss.db，保留最近 7 份。
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { backupDatabase, DATA_DIR } from '../lib/db';

function parseArgs(argv: string[]): { outDir: string; keep: number } {
  let outDir = path.join(DATA_DIR, 'backups');
  let keep = 7;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep') {
      const n = Number(argv[i + 1]);
      if (Number.isInteger(n) && n >= 1 && n <= 100) keep = n;
      i++;
    } else if (!a.startsWith('-')) {
      outDir = path.resolve(a);
    }
  }
  return { outDir, keep };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const { outDir, keep } = parseArgs(process.argv.slice(2));
  mkdirSync(outDir, { recursive: true });
  const buf = backupDatabase();
  const file = path.join(outDir, `docrag-${stamp()}.db`);
  writeFileSync(file, buf);
  console.log(`备份完成：${file}（${(buf.length / 1048576).toFixed(2)} MB）`);

  // 轮转：按文件名排序（时间戳前缀），只保留最近 keep 份
  const files = readdirSync(outDir)
    .filter((f) => f.startsWith('docrag-') && f.endsWith('.db'))
    .sort();
  while (files.length > keep) {
    const old = files.shift()!;
    try {
      rmSync(path.join(outDir, old), { force: true });
      console.log(`清理旧备份：${old}`);
    } catch {
      break;
    }
  }
}

void main();
