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

/** 校验 docIds 数组（number[]，正整数，去重，上限 max） */
export function parseDocIds(v: unknown, max = 200): number[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > max) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x) || x <= 0) return null;
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/** 校验分页参数 */
export function parsePagination(searchParams: URLSearchParams): { limit: number; offset: number } | null {
  const limitRaw = searchParams.get('limit');
  const offsetRaw = searchParams.get('offset');
  const pageRaw = searchParams.get('page');
  const pageSizeRaw = searchParams.get('pageSize');
  let limit = 0;
  let offset = 0;
  if (limitRaw !== null) {
    const v = Number(limitRaw);
    if (!Number.isInteger(v) || v <= 0 || v > 500) return null;
    limit = v;
  }
  if (offsetRaw !== null) {
    const v = Number(offsetRaw);
    if (!Number.isInteger(v) || v < 0 || v > 100000) return null;
    offset = v;
  }
  if (pageRaw !== null || pageSizeRaw !== null) {
    const page = pageRaw ? Number(pageRaw) : 1;
    const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 20;
    if (!Number.isInteger(page) || page < 1 || page > 10000) return null;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
    limit = pageSize;
    offset = (page - 1) * pageSize;
  }
  return { limit, offset };
}