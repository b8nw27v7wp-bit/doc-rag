/**
 * 简单信号量（Promise 队列）：限制并发执行的耗时任务（如模型嵌入），
 * 避免多个上传请求同时压满 CPU/内存、相互阻塞。
 */
export interface Semaphore {
  /** 获取许可；返回释放函数；支持超时与取消信号 */
  acquire: (opts?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<() => void>;
  /** 当前占用数 */
  active: () => number;
  /** 等待中的任务数 */
  pending: () => number;
}

export function createSemaphore(limit: number): Semaphore {
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1;
  let active = 0;
  interface Waiter {
    resolve: (release: () => void) => void;
    reject: (e: Error) => void;
    timer?: NodeJS.Timeout;
    signal?: AbortSignal;
    onAbort?: () => void;
  }
  const queue: Waiter[] = [];

  function dequeueNext(): void {
    const next = queue.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      if (next.signal && next.onAbort) next.signal.removeEventListener('abort', next.onAbort);
      active++;
      next.resolve(makeRelease());
    }
  }

  return {
    acquire(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<() => void> {
      if (opts?.signal?.aborted) {
        return Promise.reject(new Error('已取消'));
      }
      if (active < safeLimit) {
        active++;
        return Promise.resolve(makeRelease());
      }
      return new Promise<() => void>((resolve, reject) => {
        const waiter: Waiter = { resolve, reject, signal: opts?.signal };
        if (opts?.timeoutMs && opts.timeoutMs > 0) {
          waiter.timer = setTimeout(() => {
            const idx = queue.indexOf(waiter);
            if (idx >= 0) queue.splice(idx, 1);
            if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener('abort', waiter.onAbort);
            reject(new Error(`等待嵌入资源超时（${opts.timeoutMs}ms）`));
          }, opts.timeoutMs);
        }
        if (opts?.signal) {
          const onAbort = () => {
            const idx = queue.indexOf(waiter);
            if (idx >= 0) queue.splice(idx, 1);
            if (waiter.timer) clearTimeout(waiter.timer);
            opts.signal!.removeEventListener('abort', onAbort);
            reject(new Error('已取消'));
          };
          waiter.onAbort = onAbort;
          opts.signal.addEventListener('abort', onAbort, { once: true });
        }
        queue.push(waiter);
      });
    },
    active: () => active,
    pending: () => queue.length,
  };

  function makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      dequeueNext();
    };
  }
}

/** 全局嵌入并发闸（上传/重新嵌入共享），上限可用 EMBED_CONCURRENCY 调整 */
function parseConcurrency(): number {
  const raw = process.env.EMBED_CONCURRENCY;
  if (raw === undefined || raw === '') return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.max(1, Math.floor(n));
}
export const embedSemaphore = createSemaphore(parseConcurrency());