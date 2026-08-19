/**
 * OpenAPI 3.1 描述：GET /api/openapi 返回机器可读的 REST API 文档，供第三方集成。
 * 静态内联描述，无额外依赖；与代码变更同步维护。
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'DocRAG API',
    version: '0.5.0',
    description:
      '本地优先的 RAG 文档问答 API：上传文档、混合检索问答、会话管理、全文搜索与导出。',
  },
  servers: [{ url: '/' }],
  paths: {
    '/api/upload': {
      post: {
        summary: '上传文档并入库',
        description: 'multipart 上传 txt/md/pdf/docx，本地解析、分块、嵌入后写入向量库。空闲时返回 {results,failed,skipped}。',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } } },
        },
        responses: {
          '200': { description: '至少一个文件成功入库' },
          '422': { description: '全部文件失败' },
        },
      },
    },
    '/api/documents': {
      get: { summary: '文档列表与统计', responses: { '200': { description: '文档数组与 stats' } } },
      delete: {
        summary: '删除文档（单个 / 批量）',
        parameters: [
          { name: 'id', in: 'query', schema: { type: 'integer' } },
          { name: 'ids', in: 'query', schema: { type: 'string' }, description: '逗号分隔的 id 列表' },
        ],
        responses: { '200': { description: '删除结果' } },
      },
    },
    '/api/documents/content': {
      get: {
        summary: '文档原文内容',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '文档元信息与原文 text' }, '404': { description: '文档不存在' } },
      },
    },
    '/api/search': {
      get: {
        summary: '全文搜索',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: '命中块数组（docId/docName/idx/snippet）' } },
      },
    },
    '/api/chat': {
      post: {
        summary: 'RAG 流式问答（NDJSON）',
        description: '体含 message（必填）、sessionId（可选）、docIds（可选，限定检索范围）、expand（可选，多查询检索）。响应为 NDJSON 事件流。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  sessionId: { type: 'integer' },
                  docIds: { type: 'array', items: { type: 'integer' } },
                  expand: { type: 'boolean', description: '是否启用查询改写+多查询检索' },
                },
                required: ['message'],
              },
            },
          },
        },
        responses: { '200': { description: 'NDJSON 事件流（delta/sources/session/error）' } },
      },
    },
    '/api/sessions': {
      get: { summary: '会话列表', responses: { '200': { description: '会话数组与 count' } } },
      post: { summary: '新建会话', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, docIds: { type: 'array', items: { type: 'integer' } } } } } } }, responses: { '200': { description: '新建会话 id' } } },
      patch: { summary: '更新会话标题 / 检索范围', parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'integer' } }], responses: { '200': { description: '更新结果' } } },
      delete: { summary: '删除会话', parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'integer' } }], responses: { '200': { description: '删除结果' } } },
    },
    '/api/messages': {
      get: {
        summary: '会话消息恢复',
        parameters: [{ name: 'session', in: 'query', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: '会话信息与消息（含引用 refs）' } },
      },
    },
    '/api/sessions/export': {
      get: {
        summary: '导出会话为 Markdown',
        parameters: [{ name: 'id', in: 'query', schema: { type: 'integer' }, description: '缺省导出全部会话' }],
        responses: { '200': { description: 'text/markdown 下载' } },
      },
    },
    '/api/health': { get: { summary: '健康检查', responses: { '200': { description: '服务状态与统计' } } } },
  },
};

export async function GET() {
  return NextResponse.json(spec);
}