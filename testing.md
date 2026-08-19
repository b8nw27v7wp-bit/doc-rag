# 测试说明

DocRAG 的测试分层：单元测试（`npm test`）+ 专项验证脚本（`scripts/verify-*`）。改动功能必须保持两者全绿。

## 单元测试

```bash
npm test
```

运行 `node --test`（68 项），覆盖：

| 文件 | 覆盖点 |
|---|---|
| `tests/chunk.test.ts` | 空文本、短文本、段落聚合、超长段落硬切、overlap 一致性、默认参数在真实文档规模下的表现 |
| `tests/vector.test.ts` | 点积正确性、top-k 排序与截断、低分过滤、BLOB 往返一致性 |
| `tests/bm25.test.ts` | tokenizer（英文词/中文 bigram/单字兜底）、BM25 排序与 tf 权重、专有名词精确匹配、RRF 融合带出关键词命中、k 截断、全不相关返回空 |
| `tests/rerank.test.ts` | MMR 相关性优先、相似冗余多样性惩罚、lambda 倾向、边界（k 超候选/空/自定义相似度） |
| `tests/context.test.ts` | 邻块上下文扩展（首块/中间块/跨文档隔离/半径 0/多中心顺序） |
| `tests/hash.test.ts` | SHA-256 一致性、16 进制格式、文本/字节/Uint8Array 一致性 |
| `tests/export.test.ts` | refs 归一化（数组/JSON/非法/空）、Markdown 渲染、单会话/多会话打包 |
| `tests/rag.test.ts` | 引用编号提取、prompt 组装、**多轮历史注入与截断**、system prompt 规则 |
| `tests/db.test.ts` | 会话 CRUD、docIds 范围存取、消息追加/级联删除、自动标题生成、**内容哈希去重、批量删除、原文重组、全文搜索与 LIKE 转义、迁移**（隔离临时数据目录） |

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

验证：服务可达 → 文档列表 → 上传样例文档（含独特关键词）→ 入库 → 文档数 +1 → 问答接口返回 NDJSON 事件流 → 检索命中刚上传的文档 → 引用编号连续且与 sources 一致 → **会话全流程（创建会话 → 会话内问答 → 用户提问存档 → 标题自动生成 → 会话列表统计 → 无 sessionId 自动建会话并回传 id → 清理）** → 清理测试文档。全部 PASS 输出 `VERIFY_OK`。

注意：问答环节到 LLM 调用边界为止 —— 未配置真实 Key 时校验错误事件清晰（不要求 200）；配置了 `LLM_API_KEY` 或前端填入 Key 后，会校验完整的 delta 流与 sources 引用。

### import-cli.ts —— 批量导入

```bash
DATA_DIR=$(mktemp -d) npx tsx scripts/import-cli.ts <文件或目录>
```

验证：目录递归收集、解析入库、汇总统计；失败文件不中断整体流程。输出「成功 x / 失败 y，新增 z 向量块」。

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