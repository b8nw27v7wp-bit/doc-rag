import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authEnabled, authCookieValue, isAuthorized, AUTH_COOKIE } from '../lib/auth';

test('authCookieValue 由密码确定性派生（64 位 hex）', () => {
  process.env.APP_PASSWORD = 'secret123';
  const a = authCookieValue();
  const b = authCookieValue();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.equal(a, authCookieValue()); // 幂等
});

test('authCookieValue 不同密码得到不同值', () => {
  process.env.APP_PASSWORD = 'secret123';
  const a = authCookieValue();
  process.env.APP_PASSWORD = 'other456';
  const b = authCookieValue();
  assert.notEqual(a, b);
});

test('isAuthorized 校验正确/错误/缺失 cookie', () => {
  process.env.APP_PASSWORD = 'secret123';
  assert.equal(isAuthorized(authCookieValue()), true);
  assert.equal(isAuthorized('1'), false);
  assert.equal(isAuthorized(undefined), false);
  assert.equal(isAuthorized(''), false);
});

test('未启用密码时一律放行且 cookie 值为空', () => {
  delete process.env.APP_PASSWORD;
  assert.equal(authEnabled(), false);
  assert.equal(isAuthorized(undefined), true);
  assert.equal(isAuthorized('1'), true); // 未启用时忽略 cookie
  assert.equal(authCookieValue(), '');
  assert.equal(AUTH_COOKIE, 'docrag_auth');
});

test('authEnabled 反映环境变量', () => {
  delete process.env.APP_PASSWORD;
  assert.equal(authEnabled(), false);
  process.env.APP_PASSWORD = 'x';
  assert.equal(authEnabled(), true);
});