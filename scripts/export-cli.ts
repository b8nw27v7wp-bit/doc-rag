#!/usr/bin/env node
/**
 * CLI 会话导出：将会话导出为 Markdown 文件，不经 HTTP。
 *
 * 用法：
 *   npm run export -- [--id 3] [--out 会话.md]
 *   DATA_DIR=/path/to/data npm run export -- --id 3
 *
 * 缺省导出全部会话。
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { listSessions, getSession, listMessages } from '../lib/db';
import { sessionToMarkdown, sessionsToMarkdown } from '../lib/export';

function parseArgs(argv: string[]): { id: number; out: string } {
  let id = 0;
  let out = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') {
      id = Number(argv[i + 1]) || 0;
      i++;
    } else if (argv[i] === '--out') {
      out = argv[i + 1] ?? '';
      i++;
    }
  }
  return { id, out };
}

async function main() {
  const { id, out } = parseArgs(process.argv.slice(2));
  let content: string;
  let filename: string;
  if (id) {
    const s = getSession(id);
    if (!s) {
      console.error(`会话不存在：id=${id}`);
      process.exitCode = 1;
      return;
    }
    const messages = listMessages(id).map((m) => ({ role: m.role, content: m.content, refs: m.refs }));
    content = sessionToMarkdown(s.title, messages);
    filename = out || `${s.title.replace(/[\\/:*?"<>|\n\r\t]/g, '').slice(0, 64) || '会话'}.md`;
  } else {
    const sessions = listSessions().map((s) => ({
      title: s.title,
      messages: listMessages(s.id).map((m) => ({ role: m.role, content: m.content, refs: m.refs })),
    }));
    if (sessions.length === 0) {
      console.log('暂无会话可导出');
      return;
    }
    content = sessionsToMarkdown(sessions);
    filename = out || 'docrag-会话导出.md';
  }
  const file = path.resolve(filename);
  writeFileSync(file, content, 'utf8');
  console.log(`导出完成：${file}`);
}

void main();
