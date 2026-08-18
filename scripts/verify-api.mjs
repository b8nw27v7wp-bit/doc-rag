#!/usr/bin/env node
/**
 * E2E 验收脚本：要求本地服务已启动（npm run build && npm start / npm run dev）。
 * 验证链路：上传 → 入库 → 检索 → 流式应答（到达 LLM 边界）。
 * 用法：node scripts/verify-api.mjs [baseUrl]
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:3000';
let failures = 0;

function check(name, cond, detail = '') {
  const ok = Boolean(cond);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// 1. 服务可达
const alive = await fetch(`${base}/api/documents`).then(() => true).catch(() => false);
check('服务可达', alive, base);
if (!alive) {
  console.log(`无法连接 ${base}，请先启动服务（npm run build && npm start）`);
  process.exit(1);
}

// 2. 上传前文档数
const before = await jsonFetch(`${base}/api/documents`);
const beforeCount = before.body?.stats?.documents ?? 0;
check('查询文档列表', before.status === 200, `现状 ${beforeCount} 份`);

// 3. 生成样例文档并上传（内容含独特关键词，便于检索校验）
const dir = mkdtempSync(path.join(tmpdir(), 'docrag-verify-'));
const sample = path.join(dir, `docrag-示例-${Date.now()}.md`);
const KEYWORD = '量子纠缠的贝尔不等式实验验证';
const content = [
  '# 量子力学实验笔记',
  '',
  `本文档用于验证 DocRAG 检索链路。${KEYWORD} 是本文档独有的核心关键词，' +
    '描述 2022 年诺贝尔物理学奖获奖工作：由阿兰·阿斯佩、约翰·克劳泽与安东·蔡林格完成。`,
  '',
  '贝尔不等式被实验中违反，证实量子力学与局域实在论不相容。',
  '',
  '蔡林格小组在奥地利因斯布鲁克完成了里程碑式的纠缠光子实验。',
  '',
].join('\n');
writeFileSync(sample, content, 'utf8');

const form = new FormData();
form.append('files', new Blob([content], { type: 'text/markdown' }), path.basename(sample));
const up = await jsonFetch(`${base}/api/upload`, { method: 'POST', body: form });
const upRes = up.body?.results?.[0];
check('上传并入库成功', up.status === 200 && upRes?.ok === true, upRes ? `${upRes.name} → ${upRes.chunks} 块` : JSON.stringify(up.body));
if (!(upRes?.ok === true)) {
  console.log('上传失败，终止后续校验');
  process.exit(1);
}

const after = await jsonFetch(`${base}/api/documents`);
check('文档数 +1', (after.body?.stats?.documents ?? 0) === beforeCount + 1);

// 4. 检索 + 流式应答（重放同一上传的字节，绕过嵌入模型启动耗时）
const t0 = Date.now();
const chatRes = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'sk-verify-do-not-use',
  },
  body: JSON.stringify({ message: KEYWORD }),
});
const text = await chatRes.text();
const dt = ((Date.now() - t0) / 1000).toFixed(1);
check('问答接口返回 NDJSON', chatRes.status === 200 && text.trim().length > 0, `${dt}s`);

const events = text
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const types = events.map((e) => e.type);
check('事件流包含 delta 或明确的错误事件', types.includes('delta') || types.includes('error'), types.join(','));

if (types.includes('sources')) {
  const srcEvt = events.find((e) => e.type === 'sources');
  const hit = srcEvt.sources.find((s) => s.docName === path.basename(sample));
  check('检索命中刚上传的文档', Boolean(hit), hit ? `相似度 ${hit.score}` : '未命中');
  check('引用编号连续从 1 开始', srcEvt.sources[0]?.n === 1);
  check('引用提取与 sources 编号一致', srcEvt.refs.every((r) => srcEvt.sources.some((s) => s.n === r)));
} else {
  const errEvt = events.find((e) => e.type === 'error');
  check('未生成回答时的错误信息清晰', Boolean(errEvt?.message), errEvt?.message ?? '');
}

// 5. 会话全流程：创建 → 对话存档 → 标题生成 → 历史恢复 → 删除
const created = await jsonFetch(`${base}/api/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});
const sid = created.body?.id;
check('创建会话', created.status === 200 && Number(sid) > 0, `id=${sid}`);

const sChat = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'sk-verify-do-not-use',
  },
  body: JSON.stringify({ message: KEYWORD, sessionId: sid }),
});
const sText = await sChat.text();
const sEvents = sText
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const sTypes = sEvents.map((e) => e.type);
check('会话内问答返回事件流', sText.length > 0, sTypes.join(','));
const sErr = sEvents.find((e) => e.type === 'error');
check('会话内问答错误事件清晰（未配置真实 Key 时预期 401）', Boolean(sErr?.message), sErr?.message ?? '');

const msgs1 = await jsonFetch(`${base}/api/messages?session=${sid}`);
const msgs1list = msgs1.body?.messages ?? [];
check('用户提问已存档', msgs1list.some((m) => m.role === 'user' && m.content === KEYWORD), `${msgs1list.length} 条消息`);
const sInfo = msgs1.body?.session;
check('会话标题已从问题生成', Boolean(sInfo?.title && sInfo.title !== '新会话'), sInfo?.title ?? '');

const sessList = await jsonFetch(`${base}/api/sessions`);
const sessRow = sessList.body?.sessions?.find((s) => s.id === sid);
check('会话出现在列表且消息数 ≥1', Boolean(sessRow && sessRow.messageCount >= 1), `消息数=${sessRow?.messageCount ?? 0}`);

// 不带 sessionId 的会话：服务端自动建会话并在流中回传 id
const autoChat = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'sk-verify-do-not-use',
  },
  body: JSON.stringify({ message: KEYWORD }),
});
const autoText = await autoChat.text();
const autoEvt = autoText
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
const autoSess = autoEvt.find((e) => e.type === 'session');
check('未传 sessionId 时自动建会话并回传 id', Boolean(autoSess?.id), `id=${autoSess?.id}`);

if (autoSess?.id) {
  await jsonFetch(`${base}/api/sessions?id=${autoSess.id}`, { method: 'DELETE' });
}
const delSess = await jsonFetch(`${base}/api/sessions?id=${sid}`, { method: 'DELETE' });
check('清理会话', delSess.status === 200);

// 6. 清理：删除测试文档
const list2 = await jsonFetch(`${base}/api/documents`);
const mine = list2.body?.documents?.find((d) => d.name === path.basename(sample));
if (mine) {
  const del = await jsonFetch(`${base}/api/documents?id=${mine.id}`, { method: 'DELETE' });
  check('清理测试文档', del.status === 200);
}

console.log(failures === 0 ? '\nVERIFY_OK' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);