# Changelog

## [0.5.1] - 2026-08-19

### Security

- 修复密码门绕过：鉴权 cookie 由 `APP_PASSWORD` 单向 SHA-256 派生并恒定时间比较，不再是可伪造的固定值 `1`
- 修复 API 未受保护：设置 `APP_PASSWORD` 后，`proxy` 同时保护页面与全部 `/api/*`（登录页与 `/api/lock` 除外），未认证 API 请求返回 401
- 修复 SSRF：LLM `baseURL`（来自请求头 BYOK 透传）经 `validateBaseURL` 校验——仅允许 http/https，阻断云元数据 169.254.169.254 / 0.0.0.0 / `::` / 链路本地 fe80: 等保留地址
- 登录接口新增滑动窗口限流（默认 60s 内 10 次），防暴力枚举
- 单条问题长度上限（4000 字）、批量删除上限（500 份）、HTTPS 下登录 cookie 自动加 `secure`
- 新增 `lib/auth.ts` / `lib/ssrf.ts` / `lib/rateLimit.ts`；单测新增 12 项（鉴权派生与校验、端点白名单校验、限流窗口），共 103 项全绿

## [0.5.0] - 2026-08-19

### Added

- 上下文检索（Contextual Retrieval）：嵌入前为每个分块拼接「文档名 · 章节 · 位置」上下文头，向量携带结构信息，语义召回更准（chunks 表新增 context 列，幂等迁移）
- 结构感知分块：识别 Markdown 标题层级并按章节切分 + 记录标题路径（`chunkStructured`）
- 多查询检索（Multi-Query RAG）：可选开启「查询增强」，先把问题改写成多条检索查询再合并（跨查询全局 RRF + MMR 去冗余），失败自动回退单查询
- LLM 非流式调用 `chatOnce`（查询改写/辅助调用用，独立 30s 超时）
- 检索评估：Recall@k / Precision@k / MRR 指标（`lib/eval.ts`）+ 离线评估脚本 `scripts/eval-retrieval.ts`
- 单测新增 23 项（结构分块/上下文检索/多查询解析与合并/评估指标/chunk context 存取），共 91 项全绿

### 已知限制

- PDF 仅文本层解析；扫描件需先 OCR
- 检索为全量暴力计算（向量余弦 + BM25），超大库（万级块）需引入 ANN
- 查询增强依赖 LLM 可用，离线/未配 Key 时自动回退单查询检索
- 嵌入模型首次使用需联网下载（约 112MB），国内网络依赖 hf-mirror 镜像
- Dockerfile 因本机未装 Docker 未做镜像级验证（Node 环境已验证）

## [0.4.0] - 2026-08-19

### Added

- 检索质量：MMR（Maximal Marginal Relevance）多样性重排，融合结果去冗余；邻块上下文扩展，命中块自动并入同文档相邻块，答案更完整
- 内容哈希去重：上传与 CLI 导入均对重复文档（同名同内容）自动跳过，避免向量库膨胀
- 文档库管理：全文搜索（命中段落切片高亮）、批量删除、查看原文内容（`/api/documents/content`、`/api/search`）
- 会话增强：前端重命名 + Markdown 导出（单个或全部会话，`/api/sessions/export`）
- REST 完整性：健康检查 `/api/health`（供探活/容器 healthcheck）、OpenAPI 3.1 文档 `/api/openapi`
- 上传防护：单文件大小上限（`MAX_UPLOAD_MB`，默认 50MB）与单次文件数上限（`MAX_FILES`，默认 20）
- LLM 调用超时保护（默认 120s），超时给出明确错误而非无限挂起
- 数据层迁移：documents 表新增 `content_hash` / `updated_at` 列（幂等 ALTER，老库自动补齐）
- 工程健壮性：全局 error / not-found / loading 边界；middleware 迁移为 Next 16 `proxy.ts`；Docker healthcheck
- 单测新增 29 项（哈希/MMR/邻块上下文/Markdown 导出/迁移/去重/批量删除/全文搜索），共 68 项全绿

### 已知限制

- PDF 仅文本层解析；扫描件需先 OCR
- 检索为全量暴力计算（向量余弦 + BM25），超大库（万级块）需引入 ANN
- 嵌入模型首次使用需联网下载（约 112MB），国内网络依赖 hf-mirror 镜像
- Dockerfile 因本机未装 Docker 未做镜像级验证（Node 环境已验证）

## [0.3.0] - 2026-08-18

### Added

- 混合检索：BM25 关键词索引（零依赖，英文词 + 中文 bigram + 单字兜底）与向量余弦通过 RRF（Reciprocal Rank Fusion）融合
  - 专有名词/精确术语（如「贝尔不等式」）即使向量相似度低也能被关键词带出，显著降低漏检
  - 前端引用面板同时展示向量分与关键词分；检索候选数放大后融合，避免单侧截断丢失
- 单测新增 8 项（tokenizer / BM25 排序 / 专有名词 / RRF 融合），共 39 项全绿
- E2E 走混合检索路径验证通过（17 项 PASS）

### 已知限制

- PDF 仅文本层解析；扫描件需先 OCR
- 检索为全量暴力计算（向量余弦 + BM25），超大库（万级块）需引入 ANN 或倒排索引落库
- 嵌入模型首次使用需联网下载（约 112MB），国内网络依赖 hf-mirror 镜像
- Dockerfile 因本机未装 Docker 未做镜像级验证（Node 环境已验证）

## [0.2.0] - 2026-08-18

### Added

- 多轮对话会话：sessions/messages 表（node:sqlite），问答自动存档、历史上下文注入（最近 12 条）、切回会话恢复全文与引用（refs JSON 重放）、会话标题从首问自动生成（≤24 字）、无 sessionId 提问自动建会话并回传 id
- 按文档筛选检索范围：会话级 docIds 持久化，检索按范围过滤，多主题资料互不干扰
- 会话侧栏双栏 UI：列表/新建/切换/删除，文档范围勾选面板
- CLI 批量导入：`npm run import -- 目录/ 文件...`，目录递归、失败不中断、汇总统计
- Docker 部署：多阶段 Dockerfile + docker-compose（构建期预下载嵌入模型、数据卷持久化、环境变量配置兜底 Key/密码）
- 新增 /api/sessions、/api/messages 路由；chat 路由支持 sessionId/docIds 与会话自动清理（失败不残留空会话）
- 单测新增 11 项（会话/消息/db CRUD、多轮历史注入与截断、system prompt 规则），共 31 项全绿
- verify-api.mjs 扩展会话全流程 E2E 验收

### 已知限制

- PDF 仅文本层解析；扫描件需先 OCR
- 检索为全量暴力余弦，超大库（万级块）需引入 ANN
- 嵌入模型首次使用需联网下载（约 112MB），国内网络依赖 hf-mirror 镜像
- Dockerfile 因本机未装 Docker 未做镜像级验证（Node 环境已验证）

## [0.1.0] - 2026-08-18

### Added

- 完整 MVP：上传（txt/md/pdf/docx）→ 本地解析 → 段落感知分块 → 本地嵌入（transformers.js 多语言 MiniLM q8）→ SQLite 向量入库（node:sqlite，WAL 模式，零原生依赖）
- RAG 问答：余弦 top-k 检索 + 带编号引用 prompt + NDJSON 流式回答，回答标注 [n] 引用，可展开查看原文段落与相似度
- 模型接入：BYOK 透传（x-api-key 请求头优先，环境变量兜底），预设 DeepSeek/GLM/Kimi/Ollama/自定义 OpenAI 兼容端点；Ollama 本地端点免 Key
- 前端：浅色极简界面（首页上传/文档库，问答页流式对话），可选访问密码门（APP_PASSWORD + middleware）
- 工程质量：20 项单元测试（node --test + tsx），verify-embed / verify-api 专项验收脚本，README / testing.md 文档

### 已知限制

- PDF 仅文本层解析；扫描件需先 OCR
- 检索为全量暴力余弦，超大库（万级块）需引入 ANN
- 嵌入模型首次使用需联网下载（约 112MB），国内网络依赖 hf-mirror 镜像