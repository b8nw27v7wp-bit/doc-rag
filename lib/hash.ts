/**
 * 内容哈希：基于 node:crypto 的 SHA-256，零第三方依赖。
 * 用于重复文档检测：同名同内容文档重复上传/导入时跳过，避免向量库膨胀。
 */
import { createHash } from 'node:crypto';

/** 对文件字节计算内容哈希（16 进制串） */
export function contentHash(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** 对文本计算内容哈希（16 进制串） */
export function contentHashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}