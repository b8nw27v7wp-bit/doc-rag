/**
 * 文档解析层：支持 txt / md / pdf / docx。
 * PDF 用 pdf-parse（纯 JS），DOCX 用 mammoth（纯 JS），全部本地解析。
 */
import path from 'node:path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

export interface ParsedDoc {
  name: string;
  ext: string;
  text: string;
  charCount: number;
}

const SUPPORTED = ['txt', 'md', 'markdown', 'pdf', 'docx'];

export function isSupported(name: string): boolean {
  const ext = path.extname(name).toLowerCase().replace('.', '');
  return SUPPORTED.includes(ext);
}

export function supportedExts(): string {
  return SUPPORTED.map((e) => `.${e}`).join(' / ');
}

/** 解析文件内容为纯文本（清理空白与多余空行） */
export async function parseDocument(fileName: string, buf: Buffer): Promise<ParsedDoc> {
  const ext = path.extname(fileName).toLowerCase().replace('.', '');
  let raw = '';

  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    raw = buf.toString('utf8');
  } else if (ext === 'pdf') {
    const pdf = await pdfParse(buf);
    raw = pdf.text;
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer: buf });
    raw = result.value;
  } else {
    throw new Error(`不支持的文件类型 .${ext}，支持 ${supportedExts()}`);
  }

  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new Error(`${fileName} 未能提取到文本内容（可能是扫描件/图片型 PDF）`);

  return { name: fileName, ext, text, charCount: text.length };
}