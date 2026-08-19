/**
 * 请求体校验小工具：路由层输入的解析与上限约束（防滥用 + 边界清晰）。
 */

/** 正整数解析（严格 number 类型，≤max），非法/越界返回 null */
export function parsePositiveInt(v: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max ? v : null;
}

/** 逗号分隔的 id 列表（去重、剔除非法、上限 max 个）；无有效项返回 null */
export function parseIdList(v: unknown, max = 500): number[] | null {
  if (typeof v !== 'string') return null;
  const ids: number[] = [];
  for (const part of v.split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
    if (ids.length > max) return null;
  }
  return ids.length > 0 ? ids : null;
}

/** 非空字符串（trim + 截断到 maxLen）；空白返回 null */
export function toBoundedString(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/** 0~2 区间的温度等浮点参数解析 */
export function parseTemperature(v: unknown, fallback: number | null): number | null {
  const n = typeof v === 'number' ? v : fallback;
  if (n === null || !Number.isFinite(n) || n < 0 || n > 2) return fallback;
  return n;
}