# DocRAG 多阶段构建：deps → build（含模型预下载）→ runner
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV HF_ENDPOINT=https://hf-mirror.com
# 预下载嵌入模型（约 112MB）进构建缓存层，运行时零等待
RUN node scripts/verify-embed.mjs > /dev/null 2>&1 || echo "模型预下载失败，将在首次上传时下载"
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HF_ENDPOINT=https://hf-mirror.com
ENV DATA_DIR=/app/data
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/public ./public
# 数据卷：文档与向量库持久化
VOLUME /app/data
EXPOSE 3000
CMD ["npm", "start"]