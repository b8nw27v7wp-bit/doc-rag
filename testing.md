# 测试说明

DocRAG 的测试分层：单元测试（`npm test`）+ 专项验证脚本（`scripts/verify-*`）。改动功能必须保持两者全绿。

## 单元测试

```bash
npm test
```

运行 `node --test`（20 项），覆盖：

| 文件 | 覆盖点 |
|---|---|
| `tests/chunk.test.ts` | 空文本、短文本、段落聚合、超长段落硬切、overlap 一致性、默认参数在真实文档规模下的表现 |
| `tests/vector.test.ts` | 点积正确性、top-k 排序与截断、低分过滤、BLOB 往返一致性 |
| `tests/rag.test.ts` | 引用编号提取（去重/升序）、prompt 组装、RAG 常量合理性 |

## 专项验收脚本

### verify-embed.mjs —— 本地嵌入模型

```bash
node scripts/verify-embed.mjs
```

首次运行会从 HF 镜像下载模型（约 112MB），成功输出 `EMBED_OK`。验证：模型加载、维度 384、推理出向量。

### verify-api.mjs —— 端到端链路

```bash
npm run build && npm start   # 另开终端
node scripts/verify-api.mjs
```

验证：服务可达 → 文档列表 → 上传样例文档（含独特关键词）→ 入库 → 文档数 +1 → 问答接口返回 NDJSON 事件流 → 检索命中刚上传的文档 → 引用编号连续且与 sources 一致 → 清理测试文档。全部 PASS 输出 `VERIFY_OK`。

注意：问答环节到 LLM 调用边界为止 —— 未配置真实 Key 时校验错误事件清晰（不要求 200）；配置了 `LLM_API_KEY` 或前端填入 Key 后，会校验完整的 delta 流。

## 复现问题

本地监控：

```bash
npm run dev
# 上传 → 提问 → 检查服务端日志
```

数据库文件在 `data/app.db`（WAL 模式）。删除即重置全部数据。

## 已知限制

- 上传接口为同步处理，大文件（>10MB PDF）嵌入会阻塞单请求较久；后续可改任务队列
- 检索为全量暴力余弦（无 ANN 索引），文档块数过万后应考虑 sqlite-vec 或 HNSW
- PDF 仅支持文本层，扫描件/图片型 PDF 需先 OCR