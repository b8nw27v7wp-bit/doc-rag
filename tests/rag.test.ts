import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRefs, buildRagMessages, buildSystemPrompt, HISTORY_LIMIT, RAG_TOP_K } from '../lib/rag';

const HITS = [
  { n: 1, docName: '信号处理.md', idx: 0, text: 'FFT 是快速傅里叶变换。', score: 0.9 },
  { n: 2, docName: '信号处理.md', idx: 3, text: '维基百科说 FFT 用于频谱分析。', score: 0.8 },
];

test('提取引用编号：去重 + 升序', () => {
  const refs = extractRefs('见 [3] 与 [1]，再次引用 [3] 和 [2]');
  assert.deepEqual(refs, [1, 2, 3]);
});

test('无引用返回空数组', () => {
  assert.deepEqual(extractRefs('这里没有引用标记'), []);
});

test('越界编号也会被提取（由调用方与 sources 比对过滤）', () => {
  const refs = extractRefs('引用 [9]');
  assert.deepEqual(refs, [9]);
});

test('buildRagMessages 组装资料与提问，编号从 1 开始', () => {
  const msgs = buildRagMessages('什么是 FFT？', [
    { n: 1, docName: '信号处理.md', idx: 0, text: 'FFT 是快速傅里叶变换。', score: 0.9 },
    { n: 2, docName: '信号处理.md', idx: 3, text: '维基百科说 FFT 用于频谱分析。', score: 0.8 },
  ]);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('[1]'), '资料应带编号');
  assert.ok(msgs[1].content.includes('【信号处理.md】') || msgs[1].content.includes('《信号处理.md》'));
  assert.ok(msgs[1].content.endsWith('什么是 FFT？'));
});

test('RAG 常量合理', () => {
  assert.ok(RAG_TOP_K >= 4 && RAG_TOP_K <= 8, 'top-k 取 4~8 之间');
});

test('buildRagMessages 支持多轮历史注入（system → 历史 → 当前）', () => {
  const history = [
    { role: 'user' as const, content: '第一问' },
    { role: 'assistant' as const, content: '第一答' },
  ];
  const msgs = buildRagMessages('追问', HITS, history);
  assert.equal(msgs.length, 4);
  assert.deepEqual(msgs.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(msgs[1].content, '第一问');
  assert.equal(msgs[2].content, '第一答');
  assert.ok(msgs[3].content.includes('[1]'), '当前回合带资料编号');
  assert.ok(msgs[3].content.endsWith('追问'));
});

test('buildRagMessages 历史超过上限时只注入最近 N 条', () => {
  const history = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => ({
    role: 'user' as const,
    content: `第${i}条`,
  }));
  const msgs = buildRagMessages('新问题', [], history);
  const injectedUsers = msgs.slice(1, -1).filter((m) => m.role === 'user').length;
  assert.equal(injectedUsers, HISTORY_LIMIT, `应只注入最近 ${HISTORY_LIMIT} 条历史`);
  // 最旧的一条不应出现
  assert.ok(!msgs.some((m) => m.content === '第0条'));
});

test('buildSystemPrompt 包含引用标注与反幻觉规则', () => {
  const p = buildSystemPrompt();
  assert.ok(p.includes('[n]'));
  assert.ok(p.includes('不要编造'));
});