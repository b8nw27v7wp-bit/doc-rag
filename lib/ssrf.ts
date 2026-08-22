/**
 * 出站端点校验（防 SSRF）：LLM 服务的 baseURL 来自请求头（BYOK 透传），
 * 必须校验协议并阻断云元数据/保留地址，避免被用作内网探测跳板。
 * 允许 localhost / 局域网 IP（Ollama 与自建网关的合法场景）。
 */
export class UnsafeBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeBaseUrlError';
  }
}

const METADATA_HOSTS = new Set(['169.254.169.254', '0.0.0.0', '::', 'metadata.google.internal']);

function parseIPv4Part(part: string): number | null {
  const p = part.trim();
  if (!p) return null;
  if (/^0x[0-9a-fA-F]+$/.test(p)) {
    const v = parseInt(p, 16);
    return Number.isNaN(v) ? null : v;
  }
  if (/^0[0-7]+$/.test(p) && p.length > 1) {
    const v = parseInt(p, 8);
    return Number.isNaN(v) ? null : v;
  }
  if (/^\d+$/.test(p)) {
    const v = parseInt(p, 10);
    return Number.isNaN(v) ? null : v;
  }
  return null;
}

function decodeIPv4(host: string): string | null {
  const h = host.trim().toLowerCase();
  // 单整数形式: 十进制 / 十六进制 / 八进制
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
    return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }
  if (/^0x[0-9a-f]+$/.test(h)) {
    const n = parseInt(h, 16);
    if (n < 0 || n > 0xffffffff) return null;
    return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }
  if (/^0[0-7]+$/.test(h) && h.length > 1) {
    const n = parseInt(h, 8);
    if (n < 0 || n > 0xffffffff) return null;
    return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }
  if (!h.includes('.')) return null;
  const parts = h.split('.');
  if (parts.length < 2 || parts.length > 4) return null;
  const vals: number[] = [];
  for (const part of parts) {
    const v = parseIPv4Part(part);
    if (v === null || v < 0) return null;
    vals.push(v);
  }
  // 按 IPv4 紧凑表示法展开
  if (vals.length === 4) {
    if (vals.some((v) => v > 255)) return null;
    return vals.join('.');
  }
  if (vals.length === 3) {
    if (vals[0] > 255 || vals[1] > 255 || vals[2] > 65535) return null;
    return `${vals[0]}.${vals[1]}.${(vals[2] >> 8) & 0xff}.${vals[2] & 0xff}`;
  }
  if (vals.length === 2) {
    if (vals[0] > 255 || vals[1] > 16777215) return null;
    return `${vals[0]}.${(vals[1] >> 16) & 0xff}.${(vals[1] >> 8) & 0xff}.${vals[1] & 0xff}`;
  }
  return null;
}

function normalizeHost(rawHost: string): string {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv6 包含冒号，尝试提取嵌入的 IPv4 进行归一化检查
  if (host.includes(':')) {
    // 处理 ::ffff:10.0.0.1 或 ::ffff:0x7f.0.0.1 等
    const lastColon = host.lastIndexOf(':');
    const tail = host.slice(lastColon + 1);
    if (tail.includes('.')) {
      const decoded = decodeIPv4(tail);
      if (decoded) {
        // 返回嵌入 IPv4 的规范形式用于后续联动检查，同时保留 IPv6 前缀判断
        return host.slice(0, lastColon + 1) + decoded;
      }
    }
    return host;
  }
  const decoded = decodeIPv4(host);
  return decoded ?? host;
}

function isBlockedHost(host: string): boolean {
  const h = normalizeHost(host);
  if (METADATA_HOSTS.has(h)) return true;
  if (h.startsWith('169.254.')) return true;
  if (h.startsWith('fe80:')) return true;
  if (h === '0.0.0.0') return true;
  // 十进制/十六进制单整数已在 normalizeHost 中展开为点分十进制，可被上面规则命中
  // 额外检查 ::ffff: 包装的私有地址
  if (h.startsWith('::ffff:')) {
    const tail = h.slice('::ffff:'.length);
    if (tail.startsWith('169.254.') || tail === '0.0.0.0') return true;
  }
  // 形如 [0:0:0:0:0:ffff:127.0.0.1] 已被 normalize
  return false;
}

/** 校验并规范化 baseURL（去尾部斜杠）；不安全时抛 UnsafeBaseUrlError */
export function validateBaseURL(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeBaseUrlError('Base URL 格式无效');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new UnsafeBaseUrlError('仅支持 http / https 协议端点');
  }
  // 阻断带用户名/密码的 URL（防 userinfo SSRF 混淆）
  if (u.username || u.password) throw new UnsafeBaseUrlError('Base URL 不能包含用户名或密码');
  // 去掉 IPv6 方括号（URL.hostname 会带 [ ]）便于比对
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new UnsafeBaseUrlError('Base URL 缺少主机名');
  if (isBlockedHost(host)) {
    throw new UnsafeBaseUrlError('拒绝访问保留/元数据地址');
  }
  if (host.length > 253) throw new UnsafeBaseUrlError('主机名过长');
  return u.toString().replace(/\/+$/, '');
}

/** 是否本地端点（Ollama 等本地模型，可免 Key）— 兼容编码 IP */
export function isLocalBaseURL(baseURL: string): boolean {
  try {
    const raw = new URL(baseURL).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const host = normalizeHost(raw);
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '::ffff:127.0.0.1' ||
      host === '0:0:0:0:0:ffff:127.0.0.1'
    );
  } catch {
    return false;
  }
}