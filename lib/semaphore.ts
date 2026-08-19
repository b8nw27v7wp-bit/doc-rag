/**
 * 简单信号量（Promise 队列）：限制并发执行的耗时任务（如模型嵌入），
 * 避免多个上传请求同时压满 CPU/内存、相互阻塞。
 */
export interface Semaphore {
  /** 获取许可；返回释放函数 */
  acquire: () => Promise<() => void>;
  /** 当前占用数 */
  active: () => number;
  /** 等待中的任务数 */
  pending: () => number;
}

export function createSemaphore(limit: number): Semaphore {
  let active = 0;
  const queue: (() => void)[] = [];

  return {
    acquire(): Promise<() => void> {
      if (active < limit) {
        active++;
        return Promise.resolve(makeRelease());
      }
      return new Promise((resolve) => {
        queue.push(() => resolve(makeRelease()));
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
      const next = queue.shift();
      if (next) {
        active++;
        next();
      }
    };
  }
}

/** 全局嵌入并发闸（上传/重新嵌入共享），上限可用 EMBED_CONCURRENCY 调整 */
export const embedSemaphore = createSemaphore(Number(process.env.EMBED_CONCURRENCY) || 2);