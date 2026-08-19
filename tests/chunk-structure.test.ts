import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkStructured, chunkText } from '../lib/chunk';

test('chunkStructured：识别 Markdown 标题层级并记录路径', () => {
  const md = [
    '# 第一章',
    '第一段内容。',
    '',
    '## 第一节',
    '第一节点内容。',
    '',
    '# 第二章',
    '第二段内容。',
  ].join('\n');
  const chunks = chunkStructured(md);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0].path, ['第一章']);
  assert.deepEqual(chunks[1].path, ['第一章', '第一节']);
  assert.deepEqual(chunks[2].path, ['第二章']);
});

test('chunkStructured：无标题纯文本退化，path 全空', () => {
  const text = '第一段\n\n第二段\n\n第三段';
  const chunks = chunkStructured(text);
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.every((c) => c.path.length === 0));
  assert.deepEqual(chunks.map((c) => c.text), chunkText(text), '应等价于段落分块');
});

test('chunkStructured：空文本返回空数组', () => {
  assert.deepEqual(chunkStructured('  \n\n '), []);
});

test('chunkStructured：标题降级/升级路径正确截断重建', () => {
  const md = ['# H1', 'a', '### H3', 'b', '# H1b', 'c'].join('\n');
  const chunks = chunkStructured(md);
  assert.deepEqual(chunks[0].path, ['H1']);
  assert.deepEqual(chunks[1].path, ['H1', 'H3']);
  assert.deepEqual(chunks[2].path, ['H1b']);
});

test('chunkStructured：超长正文在标题下仍硬切但继承路径', () => {
  const md = `# 长章节\n${'体'.repeat(1500)}`;
  const chunks = chunkStructured(md, 300, 50);
  assert.ok(chunks.length >= 5, '1500 字正文应切成多块');
  assert.ok(chunks.every((c) => c.path.length === 1 && c.path[0] === '长章节'));
});