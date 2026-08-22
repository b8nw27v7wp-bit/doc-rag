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
ENV TRANSFORMERS_CACHE=/app/.cache
ENV HF_HOME=/app/.cache
# 预下载嵌入模型（约 112MB）进构建缓存层，运行时零等待
RUN node scripts/verify-embed.mjs > /dev/null 2>&1 || echo "模型预下载失败，将在首次上传时下载"
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HF_ENDPOINT=https://hf-mirror.com
ENV TRANSFORMERS_CACHE=/app/.cache
ENV HF_HOME=/app/.cache
ENV DATA_DIR=/app/data
# 创建非 root 用户，降低容器逃逸风险
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir -p /app/data /app/.next \
 && chown -R nextjs:nodejs /app
# Next standalone 输出：减小镜像体积
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# 预下载的嵌入模型缓存（与 TRANSFORMERS_CACHE 路径一致，运行时零等待）
COPY --from=build --chown=nextjs:nodejs /app/.cache /app/.cache
USER nextjs
VOLUME /app/data
EXPOSE 3000
# 健康检查：依赖 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; else npm start; fi"]