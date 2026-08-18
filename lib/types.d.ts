// 第三方无类型包的模块声明
// 注意：pdf-parse 的 UMD 入口在 ESM/打包环境下会误入调试模式去读测试文件（ENOENT），
// 必须从 lib/pdf-parse.js 引入真实实现。
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }
  function pdfParse(buffer: Buffer, options?: Record<string, unknown>): Promise<PdfData>;
  export default pdfParse;
}

declare module 'mammoth' {
  interface Result {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: { buffer: Buffer }): Promise<Result>;
}