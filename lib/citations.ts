/**
 * 引用可信度校验：回答中出现 [n] 标记时，校验 n 是否落在本轮 sources 编号范围内。
 * 越界引用说明模型「编出」了不存在的来源，前端据此隐藏假引用并提示。
 */
import { extractRefs } from './rag';

export interface CitationCheck {
  /** 范围内（有效）的引用编号（去重升序） */
  valid: number[];
  /** 越界（无效）的引用编号（去重升序） */
  invalid: number[];
}

export function checkCitations(answer: string, sourceCount: number): CitationCheck {
  const refs = extractRefs(answer);
  const valid: number[] = [];
  const invalid: number[] = [];
  for (const n of refs) {
    if (n >= 1 && n <= sourceCount) {
      if (!valid.includes(n)) valid.push(n);
    } else if (!invalid.includes(n)) {
      invalid.push(n);
    }
  }
  return { valid, invalid };
}