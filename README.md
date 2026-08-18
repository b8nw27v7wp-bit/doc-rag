# DocRAG · 本地优先的 AI 文档问答

上传文档即可提问。文档解析、文本嵌入、向量检索**全部在你的电脑本地完成** —— 文档内容与向量数据不出设备一步，零嵌入 API 成本。回答支持任意 OpenAI 兼容模型：DeepSeek / GLM / Kimi 云端，或 Ollama 本地模型实现全离线。

## 为什么做这个

市面上文档问答工具（如 NotebookLM、Dify）都要把文档上传到云端。敏感资料（合同、论文、内部手册）越少离开本机越好。DocRAG 做一件事：**文档不离机**。

- 嵌入模型本地推理（transformers.js + 多语言 MiniLM，约 112MB，支持中英 50+ 语言）
- 向量与原文一张 SQLite 文件（Node 内置 `node:sqlite`，零原生依赖）
- BYOK：自己的 API Key 自己管，只存在浏览器 localStorage，随请求头发给所选服务商
- 可选 Ollama 接入：嵌入 + 回答全离线，断网可用

## 功能

- 拖拽上传 txt / md / pdf / docx，多文件批量入库
- 段落感知分块（600 字/块、120 字重叠，超长段落硬切兜底）
- 本地向量检索（余弦相似度 top-k，最低相似度过滤）
- 流式回答（NDJSON over fetch stream），回答标注 [n] 引用，点击查看原文出处段落
- 模型预设：DeepSeek / GLM / Kimi / Ollama / 自定义 OpenAI 兼容端点
- 可选访问密码（`APP_PASSWORD` 环境变量，适合部署到局域网）

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
npm test                     # 20 项单元测试
npm run build && npm start   # 生产构建
node scripts/verify-embed.mjs        # 验证本地嵌入模型
node scripts/verify-api.mjs          # 端到端验收（需服务已启动）
```

## 架构

```
┌────────┐  解析     ┌──────┐  分块   ┌──────┐  本地嵌入   ┌────────┐  入库   ┌──────────┐
│ 拖拽上传 ├─────────►│ txt  ├────────►│ 600字 ├───────────►│ MiniLM ├────────►│ SQLite   │
└────────┘  pdf/docx └──────┘ 重叠120 └──────┘ 384 维归一化 └────────┘  BLOB   │  + WAL   │
                                                                              └──────────┘
  提问 ──► 本地嵌入 ──► 余弦 top-k 检索 ──► 带编号引用组装 prompt ──► 流式 LLM ──► 回答 [n] + 原文出处
```

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Next.js 16 (App Router) + Tailwind 4 | 浅色极简，无组件库 |
| 解析 | pdf-parse / mammoth | 纯 JS 本地解析，支持 txt/md/pdf/docx |
| 嵌入 | @huggingface/transformers | 本地 ONNX 推理，q8 量化 |
| 存储 | node:sqlite (内置) | 零原生依赖，单文件数据库，WAL 模式 |
| 检索 | JS 余弦相似度 | 归一化向量点积，本地文档规模毫秒级 |
| LLM | OpenAI 兼容 chat/completions | BYOK 透传（x-api-key 请求头） |

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
| `APP_PASSWORD` | - | 设置后启用访问密码门 |

## 隐私与安全

- 文档解析、分块、嵌入、检索全部在服务端进程本地完成，不经过任何第三方
- API Key 仅存于浏览器 localStorage，通过 HTTPS 请求头直达所选服务商，服务端不落盘（`.env.local` 兜底 Key 可选配）
- 数据库为单文件 `data/app.db`，删除即彻底清除
- 部署到局域网时设置 `APP_PASSWORD` 即可设访问门槛

## 目录结构

```
app/
  page.tsx            # 首页：上传 + 文档库
  chat/page.tsx       # 问答页：流式对话 + 引用 + 设置
  lock/page.tsx       # 可选密码门
  api/upload/         # 上传解析入库
  api/documents/      # 文档列表 / 删除
  api/chat/           # RAG 流式问答 (NDJSON)
  api/lock/           # 密码校验
lib/
  parse.ts            # txt/md/pdf/docx 解析
  chunk.ts            # 段落感知分块
  embed.ts            # 本地嵌入（transformers.js 单例）
  vector.ts           # 余弦检索 + BLOB 转换
  db.ts               # node:sqlite 惰性初始化（WAL）
  llm.ts              # OpenAI 兼容流式调用
  rag.ts              # prompt 组装 + 引用提取
tests/                # node --test 单元测试
scripts/              # verify-embed / verify-api 验收脚本
```

## 路线图

- [ ] 对话历史入库（会话持久化）
- [ ] 按文档筛选检索范围
- [ ] 命令行批量导入（配合 repo-ai-cli 生态）
- [ ] Docker 一键部署（数据卷挂载）

## License

MIT