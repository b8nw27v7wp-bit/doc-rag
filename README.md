# DocRAG · 本地优先的 AI 文档问答

上传文档即可提问。文档解析、文本嵌入、向量检索**全部在你的电脑本地完成** —— 文档内容与向量数据不出设备一步，零嵌入 API 成本。回答支持任意 OpenAI 兼容模型：DeepSeek / GLM / Kimi 云端，或 Ollama 本地模型实现全离线。

## 为什么做这个

市面上文档问答工具（如 NotebookLM、Dify）都要把文档上传到云端。敏感资料（合同、论文、内部手册）越少离开本机越好。DocRAG 做一件事：**文档不离机**。

- 嵌入模型本地推理（transformers.js + 多语言 MiniLM，约 112MB，支持中英 50+ 语言）
- 向量与原文一张 SQLite 文件（Node 内置 `node:sqlite`，零原生依赖）
- BYOK：自己的 API Key 自己管，只存在浏览器 localStorage，随请求头发给所选服务商
- 可选 Ollama 接入：嵌入 + 回答全离线，断网可用

## 功能

- 拖拽上传 txt / md / pdf / docx，多文件批量入库（带内容哈希去重、单文件大小/数量限制）
- **结构感知分块**：Markdown 标题层级切分并记录章节路径（600 字/块、120 字重叠，超长段落硬切兜底）
- **上下文检索（Contextual Retrieval）**：嵌入前为每块拼接「文档名 · 章节 · 位置」上下文头，向量携带结构信息，语义召回更准
- **混合检索**：向量语义 + BM25 关键词（中文 bigram 分词）RRF 融合 —— 专有名词/精确术语不再漏检，前端标注双分数
- **多查询检索（Multi-Query）**：可选，先把问题改写成多条检索查询并合并召回，复杂问题命中率更高（失败自动回退单查询）
- **MMR 多样性重排**：融合结果去冗余（同段落近似块只留信息量最大者），检索更全面
- **邻块上下文扩展**：命中块自动并入同文档相邻块，回答更完整、少断章取义
- 流式回答（NDJSON over fetch stream，带超时保护），回答标注 [n] 引用，点击查看原文出处段落
- **多轮对话会话**：上下文随问答自动保存（SQLite），可随时回来继续；会话标题从首问自动生成（≤24 字）；**支持重命名与 Markdown 导出**
- **按文档筛选检索范围**：每个会话可限定仅在指定文档内问答，多主题资料互不干扰
- **文档库管理**：全文搜索（命中段落高亮切片）、批量删除、观察原文内容
- **CLI 批量导入**：`npm run import -- 目录/` 递归扫描本地文档入库，不经 HTTP，自动跳过重复文档
- **REST API + 健康检查 + OpenAPI 文档**：`/api/openapi` 机器可读，`/api/health` 供探活/容器健康检查
- 模型预设：DeepSeek / GLM / Kimi / Ollama / 自定义 OpenAI 兼容端点
- 可选访问密码（`APP_PASSWORD` 环境变量，适合部署到局域网）
- **Docker 一键部署**（多阶段构建 + 数据卷持久化 + 构建期预下载嵌入模型 + 健康检查）

## 快速开始

要求：Node.js ≥ 22.5（使用内置 `node:sqlite`）

```bash
npm install
cp .env.example .env.local   # 国内网络必须设置 HF_ENDPOINT=https://hf-mirror.com
npm run dev                  # http://localhost:3000
```

1. 打开首页，拖入文档（首次上传会自动下载嵌入模型，约 30 秒~2 分钟）
2. 打开「问答」页，点「模型设置」，选服务商并填入 API Key（Ollama 本地模型可留空）
3. 输入问题，回答会标注 [n] 引用，点击可查看文档原文段落

验证安装：

```bash
npm test                     # 103 项单元测试
npm run build && npm start   # 生产构建
node scripts/verify-embed.mjs        # 验证本地嵌入模型
node scripts/verify-api.mjs          # 端到端验收（需服务已启动）
npx tsx scripts/eval-retrieval.ts    # 检索质量离线评估（Recall/Precision/MRR）
```

### 命令行批量导入

无需打开网页，把本地目录整个倒入：

```bash
npm run import -- ./docs/ 论文.pdf 随手记.md    # 目录 + 文件混用，递归扫描
DATA_DIR=/path/to/data npm run import -- ./docs/   # 指定数据目录
```

### Docker 部署

```bash
docker compose up -d --build
# 打开 http://localhost:3000
```

- 构建期自动预下载嵌入模型（约 112MB），运行时零等待
- 数据卷 `./data` 持久化文档与向量库，重建容器数据不丢
- 环境变量在 `docker-compose.yml` 中配置（服务端兜底 Key / 访问密码）

> 注：本机未安装 Docker 时无法在仓库内直接验证，构建命令已验证至 Node 环境，镜像需在安装 Docker 的机器上构建。

## 架构

```
┌────────┐  解析     ┌──────┐  分块   ┌──────┐  本地嵌入   ┌────────┐  入库   ┌──────────┐
│ 拖拽上传 ├─────────►│ txt  ├────────►│ 600字 ├───────────►│ MiniLM ├────────►│ SQLite   │
└────────┘  pdf/docx └──────┘ 重叠120 └──────┘ 384 维归一化 └────────┘  BLOB   │  + WAL   │
   CLI 导入 ────────────────────────────────► 同一管道 ────────────────────────► │ sessions │
                                                                              │ messages │
                                                                              └──────────┘
  提问 ──► 本地嵌入 ──► 余弦 top-k 检索（按会话范围过滤）──► 历史注入 ──► 流式 LLM ──► 回答 [n] + 原文出处
                                                                  ▲                    │
                                                                  └──── 问答自动存档 ────┘
```

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Next.js 16 (App Router) + Tailwind 4 | 浅色极简，无组件库，会话侧栏双栏布局 |
| 解析 | pdf-parse / mammoth | 纯 JS 本地解析，支持 txt/md/pdf/docx |
| 嵌入 | @huggingface/transformers | 本地 ONNX 推理，q8 量化 |
| 存储 | node:sqlite (内置) | 零原生依赖，单文件数据库，WAL 模式；文档/分块/会话/消息四表，分块带上下文头 |
| 检索 | 混合检索 + 上下文检索 + 多查询 + MMR | 余弦 + BM25 经 RRF 融合，块嵌入带章节上下文；可选多查询改写增强召回，MMR 去冗余 |
| LLM | OpenAI 兼容 chat/completions | BYOK 透传（x-api-key 请求头），多轮上下文注入 |
| 部署 | Docker 多阶段 / CLI 批量导入 | 构建期预下载模型，数据卷持久化 |

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `HF_ENDPOINT` | `https://hf-mirror.com` | 嵌入模型下载镜像（国内网络必需） |
| `LLM_API_KEY` | - | 服务端兜底 Key（前端填写的 Key 优先） |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | 服务端兜底端点 |
| `LLM_MODEL` | `deepseek-chat` | 服务端兜底模型 |
| `EMBED_MODEL` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 可换其他 transformers.js 兼容模型 |
| `EMBED_DTYPE` | `q8` | 量化精度 |
| `DATA_DIR` | `./data` | SQLite 数据目录 |
| `MAX_UPLOAD_MB` | `50` | 单文件上传大小上限 |
| `MAX_FILES` | `20` | 单次上传文件数上限 |
| `APP_PASSWORD` | - | 设置后启用访问密码门 |

## 隐私与安全

- 文档解析、分块、嵌入、检索全部在服务端进程本地完成，不经过任何第三方
- API Key 仅存于浏览器 localStorage，通过 HTTPS 请求头直达所选服务商，服务端不落盘（`.env.local` 兜底 Key 可选配）
- 数据库为单文件 `data/app.db`，删除即彻底清除
- 部署到局域网/公网时设置 `APP_PASSWORD` 即可设访问门槛：cookie 由密码单向派生、不可伪造，且**页面与全部 API 同步受保护**（未认证 API 返回 401）
- 防 SSRF：LLM 端点地址经校验，仅允许 http/https，阻断云元数据/保留地址
- 登录接口限流（默认 60s 内 10 次），防暴力枚举

## 目录结构

```
app/
  page.tsx            # 首页：上传 + 文档库（搜索 / 批量删除 / 查看原文）
  chat/page.tsx       # 问答页：会话侧栏 + 流式对话 + 引用 + 设置 + 导出
  lock/page.tsx       # 可选密码门
  error.tsx / not-found.tsx / loading.tsx  # 全局错误与加载边界
  api/upload/         # 上传解析入库（限制 + 去重）
  api/documents/      # 文档列表 / 单个或批量删除
  api/documents/content/  # 文档原文内容
  api/search/         # 全文搜索
  api/chat/           # RAG 流式问答（多轮历史 + 自动存档, NDJSON）
  api/sessions/       # 会话管理（列表/新建/重命名/删除）
  api/sessions/export/   # 会话导出 Markdown
  api/messages/       # 会话消息恢复（含引用重放）
  api/lock/           # 密码校验
  api/health/         # 健康检查
  api/openapi/        # OpenAPI 3.1 文档
components/
  session-sidebar.tsx # 会话列表 + 重命名 + 文档范围筛选
  doc-browser.tsx     # 文档浏览器（搜索/批量删除/原文查看）
  upload.tsx          # 拖拽上传（去重/跳过展示）
  nav.tsx             # 顶部导航
proxy.ts              # 可选密码门（Next 16 proxy 约定）
lib/
  parse.ts            # txt/md/pdf/docx 解析
  chunk.ts            # 段落感知分块 + 结构感知分块（标题层级）
  embed.ts            # 本地嵌入（transformers.js 单例）
  vector.ts           # 余弦检索 + BLOB 转换
  bm25.ts             # BM25 关键词检索（中文 bigram）
  search.ts           # 混合检索（RRF 融合）+ 多查询合并
  rerank.ts           # MMR 多样性重排
  context.ts          # 邻块上下文扩展
  contextualize.ts    # 上下文检索（context head 拼接）
  multiQuery.ts       # 查询改写提示 + 结果解析
  eval.ts             # 检索评估指标（Recall/Precision/MRR）
  hash.ts             # 内容哈希（重复检测）
  auth.ts             # 密码门鉴权（cookie 密码派生 + 恒定时间比较）
  ssrf.ts             # LLM 端点校验（防 SSRF）
  rateLimit.ts        # 内存滑动窗口限流
  export.ts           # 会话 Markdown 导出
  db.ts               # node:sqlite 惰性初始化（WAL + 迁移，文档/块/会话/消息四表）
  llm.ts              # OpenAI 兼容流式 + 非流式调用（超时保护）
  rag.ts              # prompt 组装（历史注入）+ 引用提取
tests/                # node --test 单元测试（91 项）
scripts/
  import-cli.ts       # CLI 批量导入（目录递归 + 去重）
  verify-embed.mjs    # 嵌入模型验证
  verify-api.mjs      # 端到端验收（上传→检索→会话全流程）
  eval-retrieval.ts   # 检索质量离线评估（Recall/Precision/MRR）
Dockerfile            # 多阶段构建（构建期预下载模型）
docker-compose.yml    # 一键部署 + 数据卷 + 健康检查
```

## 路线图

- [x] 全文搜索、批量删除与文档原文查看
- [x] 会话重命名与 Markdown 导出
- [x] MMR 多样性重排与邻块上下文（检索质量）
- [x] 上下文检索 + 结构感知分块 + 多查询检索 + 检索评估
- [x] REST API 文档（OpenAPI）与健康检查接口
- [ ] 扫描件 PDF 的 OCR 支持
- [ ] ANN 向量索引（万级块规模提速）
- [ ] 重排序模型（cross-encoder）接入
- [ ] PDF 导出分享

## License

MIT