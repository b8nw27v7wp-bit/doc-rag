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
  // 去掉 IPv6 方括号（URL.hostname 会带 [ ]）便于比对
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(host) || host.startsWith('169.254.') || host.startsWith('fe80:')) {
    throw new UnsafeBaseUrlError('拒绝访问保留/元数据地址');
  }
  return u.toString().replace(/\/+$/, '');
}