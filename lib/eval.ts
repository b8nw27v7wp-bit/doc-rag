/**
 * 检索评估指标（RAG eval）：召回率 / 逆序平均排名 / 精度，供离线评估检索链路质量。
 * 输入均为下标集合：predicted 为检索返回的排名列表，relevant 为真正的相关下标。
 */

export function recallAtK(predicted: number[], relevant: number[], k: number): number {
  // 约定：无相关项时召回为 1（vacuous truth），与 precision 对称区分
  if (relevant.length === 0) return 1;
  const set = new Set(predicted.slice(0, k));
  let hit = 0;
  for (const r of relevant) if (set.has(r)) hit++;
  return hit / relevant.length;
}

export function precisionAtK(predicted: number[], relevant: number[], k: number): number {
  const top = predicted.slice(0, k);
  if (top.length === 0) return 0;
  const set = new Set(relevant);
  let hit = 0;
  for (const p of top) if (set.has(p)) hit++;
  return hit / top.length;
}

/** Mean Reciprocal Rank：首个相关结果排名的倒数；无命中返回 0 */
export function mrr(predicted: number[], relevant: number[]): number {
  const set = new Set(relevant);
  for (let i = 0; i < predicted.length; i++) {
    if (set.has(predicted[i])) return 1 / (i + 1);
  }
  return 0;
}