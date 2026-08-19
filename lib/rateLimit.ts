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
  return {
    tryAcquire(key: string): boolean {
      const now = Date.now();
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