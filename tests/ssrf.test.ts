import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBaseURL, isLocalBaseURL, UnsafeBaseUrlError } from '../lib/ssrf';

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof UnsafeBaseUrlError;
  }
}

test('validateBaseURL：合法 http/https 通过并去尾部斜杠', () => {
  assert.equal(validateBaseURL('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1');
  assert.equal(validateBaseURL('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
  assert.equal(validateBaseURL('http://localhost:11434/v1'), 'http://localhost:11434/v1');
});

test('validateBaseURL：允许 localhost 与局域网 IP（Ollama/自建网关）', () => {
  assert.equal(validateBaseURL('http://localhost:11434'), 'http://localhost:11434');
  assert.equal(validateBaseURL('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
  assert.equal(validateBaseURL('http://192.168.1.50:8080/v1'), 'http://192.168.1.50:8080/v1');
});

test('validateBaseURL：拒绝非 http/https 协议', () => {
  assert.ok(throws(() => validateBaseURL('ftp://host/v1')));
  assert.ok(throws(() => validateBaseURL('file:///etc/passwd')));
  assert.ok(throws(() => validateBaseURL('gopher://host')));
});

test('validateBaseURL：拒绝云元数据与保留地址', () => {
  assert.ok(throws(() => validateBaseURL('http://169.254.169.254/latest')));
  assert.ok(throws(() => validateBaseURL('http://169.254.10.1/v1')));
  assert.ok(throws(() => validateBaseURL('http://0.0.0.0/v1')));
  assert.ok(throws(() => validateBaseURL('http://[::]/v1')));
});

test('validateBaseURL：拒绝非法 URL', () => {
  assert.ok(throws(() => validateBaseURL('不是 url')));
  assert.ok(throws(() => validateBaseURL('')));
});

test('isLocalBaseURL：仅本机回环为本地端点', () => {
  assert.equal(isLocalBaseURL('http://localhost:11434/v1'), true);
  assert.equal(isLocalBaseURL('http://127.0.0.1:8080'), true);
  assert.equal(isLocalBaseURL('http://[::1]:8080'), true);
  assert.equal(isLocalBaseURL('http://192.168.1.50:8080'), false);
  assert.equal(isLocalBaseURL('https://api.deepseek.com/v1'), false);
  assert.equal(isLocalBaseURL('not-a-url'), false);
});