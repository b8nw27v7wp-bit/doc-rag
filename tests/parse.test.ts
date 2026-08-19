import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, parseDelimited, rowsToText, isSupported, parseDocument } from '../lib/parse';

test('stripHtml：去标签、去脚本、块级转行、解码实体', () => {
  const out = stripHtml('<h1>标题</h1><p>正文 &amp; 更多</p><script>alert(1)</script><br>结束');
  assert.ok(out.includes('标题'));
  assert.ok(out.includes('正文 & 更多'));
  assert.ok(out.includes('结束'));
  assert.ok(!out.includes('<h1>'));
  assert.ok(!out.includes('alert'));
  assert.ok(!out.includes('&amp;'));
});

test('parseDelimited：逗号分隔 + 引号包裹与转义', () => {
  const rows = parseDelimited('姓名,城市\n"张三","北京"\n"a,b","c""d"', ',');
  assert.deepEqual(rows, [
    ['姓名', '城市'],
    ['张三', '北京'],
    ['a,b', 'c"d'],
  ]);
});

test('parseDelimited：制表符分隔', () => {
  const rows = parseDelimited('a\tb\n1\t2', '\t');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('rowsToText 保留表格结构（制表符分隔）', () => {
  const text = rowsToText([['姓名', '城市'], ['张三', '北京']]);
  assert.equal(text, '姓名\t城市\n张三\t北京');
});

test('parseDocument：HTML 提取纯文本', async () => {
  const doc = await parseDocument('a.html', Buffer.from('<h1>标题</h1><p>正文内容</p>'));
  assert.equal(doc.ext, 'html');
  assert.ok(doc.text.includes('标题'));
  assert.ok(doc.text.includes('正文内容'));
});

test('parseDocument：CSV 转制表符文本', async () => {
  const doc = await parseDocument('a.csv', Buffer.from('姓名,城市\n张三,北京\n李四,上海'));
  assert.ok(doc.text.includes('张三\t北京'));
  assert.ok(doc.text.includes('李四\t上海'));
});

test('parseDocument：TSV 转制表符文本', async () => {
  const doc = await parseDocument('a.tsv', Buffer.from('a\tb\n1\t2'));
  assert.ok(doc.text.includes('1\t2'));
});

test('isSupported：支持新格式，忽略大小写', () => {
  assert.equal(isSupported('a.HTML'), true);
  assert.equal(isSupported('b.htm'), true);
  assert.equal(isSupported('c.csv'), true);
  assert.equal(isSupported('d.tsv'), true);
  assert.equal(isSupported('e.pdf'), true);
  assert.equal(isSupported('f.exe'), false);
});