# 测试说明

DocRAG 的测试分层：单元测试（`npm test`）+ 专项验证脚本（`scripts/verify-*`）。改动功能必须保持两者全绿。

## 单元测试

```bash
npm test
```

运行 `node --test`（168 项，含路由层集成测试），覆盖：

| 文件 | 覆盖点 |
|---|---|
| `tests/chunk.test.ts` | 空文本、短文本、段落聚合、超长段落硬切、overlap 一致性、默认参数在真实文档规模下的表现 |
| `tests/chunk-structure.test.ts` | 结构感知分块：标题层级路径、纯文本退化等价、跳级标题、超长正文继承路径 |
| `tests/contextualize.test.ts` | 上下文头拼接（文档名/章节/位置）、contextualize 前置注入 |
| `tests/vector.test.ts` | 点积正确性、top-k 排序与截断、低分过滤、BLOB 往返一致性 |
| `tests/bm25.test.ts` | tokenizer（英文词/中文 bigram/单字兜底）、BM25 排序与 tf 权重、专有名词精确匹配、RRF 融合带出关键词命中、k 截断、全不相关返回空、**预建索引复用一致性** |
| `tests/search-merge.test.ts` | 多查询结果跨查询 RRF 合并、分数字段取最大、k 截断、空输入 |
| `tests/rerank.test.ts` | MMR 相关性优先、相似冗余多样性惩罚、lambda 倾向、边界（k 超候选/空/自定义相似度） |
| `tests/context.test.ts` | 邻块上下文扩展（首块/中间块/跨文档隔离/半径 0/多中心顺序） |
| `tests/multiQuery.test.ts` | 查询改写提示组装、改写结果解析（编号/项目符号/回退/去重） |
| `tests/eval.test.ts` | Recall@k / Precision@k / MRR 边界 |
| `tests/auth.test.ts` | 密码派生 cookie、正确/错误/缺失校验、未启用放行 |
| `tests/ssrf.test.ts` | 端点校验：放行 http/https/localhost/内网，阻断非 http 协议、元数据与保留地址、非法 URL |
| `tests/rateLimit.test.ts` | 滑动窗口限流：超限拒绝、key 隔离、窗口过期恢复 |
| `tests/ann.test.ts` | IVF 索引：确定性、簇分离覆盖、nprobe=nlist 全量、空输入、参数推荐 |
| `tests/semaphore.test.ts` | 并发闸：上限放行、排队唤醒、释放幂等 |
| `tests/citations.test.ts` | 有效/越界引用区分、去重、空输入 |
| `tests/validate.test.ts` | 正整数/id 列表/有界字符串/温度解析边界 |
| `tests/llm.test.ts` | SSE 载荷解析（delta / reasoning_content / 非法帧） |
| `tests/routes.test.ts` | **路由层集成**：health、会话 CRUD+置顶、文档内容/搜索/批量删除、上传去重跳过、备份下载与恢复、非法恢复拒绝、chat 空库与超长分支（直接调用 handler，免起服务免模型） |
| `tests/hash.test.ts` | SHA-256 一致性、16 进制格式、文本/字节/Uint8Array 一致性 |
| `tests/keywords.test.ts` | 关键词提取：高频优先、去重、词频排序、n 限制、空文本 |
| `tests/summarize.test.ts` | 摘要 prompt 组装、超长截断 |
| `tests/parse.test.ts` | HTML 去标签/实体解析、CSV/TSV 分隔解析（引号/转义）、格式识别 |
| `tests/export.test.ts` | refs 归一化（数组/JSON/非法/空）、Markdown 渲染、单会话/多会话打包 |
| `tests/rag.test.ts` | 引用编号提取、prompt 组装、**多轮历史注入与截断**、system prompt 规则 |
| `tests/db.test.ts` | 会话 CRUD、docIds 范围存取、置顶排序、消息追加/级联删除、自动标题生成、**内容哈希去重、批量删除、原文重组、全文搜索与 LIKE 转义、迁移、上下文头/关键词/摘要/嵌入元信息存取、重建块、备份一致性快照与整体恢复、恢复校验、内存缓存失效**（隔离临时数据目录） |
| `tests/bm25.test.ts` | tokenizer、BM25 排序与 tf 权重、专有名词、RRF 融合、k 截断、全不相关、**预建索引复用一致性、null 向量混合检索** |

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

### eval-retrieval.ts —— 检索质量评估

```bash
DATA_DIR=$(mktemp -d) npx tsx scripts/eval-retrieval.ts
```

构建已知主题的小型语料库（含标题结构），入库后对多组查询评测 Retrieval 的 **Recall@k / Precision@k / MRR**。需要本地嵌入模型（首次运行自动下载约 112MB）。全部用例 Recall@3 = 1 输出 `EVAL_OK`。

## 复现问题

本地监控：

```bash
npm run dev
# 上传 → 提问 → 检查服务端日志
```

数据库文件在 `data/app.db`（WAL 模式）。删除即重置全部数据。

## CI

推送到 `main` 或提交 PR 时，GitHub Actions（`.github/workflows/ci.yml`）自动执行：`npm ci` → audit（critical 门槛）→ lint → test → build。全部通过才可合并。

## 已知限制

- 上传接口为同步处理，大文件（>10MB PDF）嵌入会阻塞单请求较久（已加 `EMBED_CONCURRENCY` 并发闸缓解多请求互挤）
- 检索默认全量精确计算（向量 + BM25 倒排）；块数 ≥ `ANN_MIN_CHUNKS`（默认 2000）自动切换 IVF 近似向量检索
- PDF 仅支持文本层，扫描件/图片型 PDF 需先 OCR
- `@huggingface/transformers` 传递依赖存在 high 级公告（adm-zip/sharp），上游暂无修复