# Changelog

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