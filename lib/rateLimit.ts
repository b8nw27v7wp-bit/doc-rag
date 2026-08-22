/**
 * 简单内存滑动窗口限流器：用于登录接口防暴力枚举等场景。
 * 单进程内存存储（不跨实例），对本应用的单节点部署场景足够。
 */
export interface RateLimiter {
  /** 尝试占用一个额度；窗口内超限返回 false */
  tryAcquire(key: string): boolean;
}

export function createRateLimiter(opts: { windowMs: number; max: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  function gc(now: number) {
    for (const [k, arr] of hits) {
      const filtered = arr.filter((t) => now - t < opts.windowMs);
      if (filtered.length === 0) hits.delete(k);
      else if (filtered.length !== arr.length) hits.set(k, filtered);
    }
  }
  return {
    tryAcquire(key: string): boolean {
      const now = Date.now();
      if (hits.size > 5000 && Math.random() < 0.1) gc(now);
      const arr = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (arr.length >= opts.max) {
        hits.set(key, arr);
        return false;
      }
      arr.push(now);
      hits.set(key, arr);
      return true;
    },
  };
}

/** 从 NextRequest 提取可信客户端 key（取最右 XFF，兼容代理） */
export function clientIpKey(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1].slice(0, 64);
  }
  return (req.headers.get('x-real-ip')?.trim() || req.headers.get('cf-connecting-ip')?.trim() || 'local').slice(0, 64);
}

/** 判断请求是否 HTTPS（用于 secure cookie） */
export function isSecureRequest(req: { headers: { get(name: string): string | null }; url: string }): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}