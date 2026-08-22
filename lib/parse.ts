/**
 * 文档解析层：支持 txt / md / pdf / docx / html / csv / tsv。
 * PDF 用 pdf-parse（纯 JS），DOCX 用 mammoth（纯 JS），HTML/CSV/TSV 零依赖本地解析。
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

const SUPPORTED = ['txt', 'md', 'markdown', 'pdf', 'docx', 'html', 'htm', 'csv', 'tsv'];

export function isSupported(name: string): boolean {
  const ext = path.extname(name).toLowerCase().replace('.', '');
  return SUPPORTED.includes(ext);
}

export function supportedExts(): string {
  return SUPPORTED.map((e) => `.${e}`).join(' / ');
}

/** 去除 HTML 标签、脚本与样式，块级标签转行、解码常见实体 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|blockquote)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * 解析分隔符文本（CSV/TSV）：支持双引号包裹、引号内转义（""）与换行。
 * @param text      原始文本
 * @param delimiter 列分隔符（',' 或 '\t'）
 */
export function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 表格行 → 文本（制表符分隔，保留表格结构） */
export function rowsToText(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n');
}

/** 解析文件内容为纯文本（清理空白与多余空行） */
export async function parseDocument(fileName: string, buf: Buffer): Promise<ParsedDoc> {
  // 文件名净化：仅保留基名，去除路径与控制字符，防止 XSS/路径穿越显示问题
  const safeName = path.basename(fileName).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 255) || 'unnamed';
  const ext = path.extname(safeName).toLowerCase().replace('.', '');
  let raw = '';

  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    raw = buf.toString('utf8');
  } else if (ext === 'pdf') {
    // 魔数校验：PDF 应以 %PDF- 开头（防止伪装扩展名）
    if (buf.length >= 4 && buf.subarray(0, 5).toString('utf8') !== '%PDF-') {
      // 宽松：仍尝试解析，但后续空文本会抛错；此处不硬性拒绝以免误伤
    }
    const pdf = await pdfParse(buf);
    raw = pdf.text;
  } else if (ext === 'docx') {
    // docx 实为 zip：魔数 PK
    if (buf.length >= 2 && buf[0] !== 0x50 && buf[1] !== 0x4b) {
      throw new Error('docx 文件头无效（不是合法的 Office 文档）');
    }
    const result = await mammoth.extractRawText({ buffer: buf });
    raw = result.value;
  } else if (ext === 'html' || ext === 'htm') {
    raw = stripHtml(buf.toString('utf8'));
  } else if (ext === 'csv' || ext === 'tsv') {
    raw = rowsToText(parseDelimited(buf.toString('utf8'), ext === 'tsv' ? '\t' : ','));
  } else {
    throw new Error(`不支持的文件类型 .${ext}，支持 ${supportedExts()}`);
  }

  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new Error(`${safeName} 未能提取到文本内容（可能是扫描件/图片型 PDF）`);

  return { name: safeName, ext, text, charCount: text.length };
}