# Changelog

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