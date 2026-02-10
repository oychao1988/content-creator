# ============================================
# 多阶段构建 Dockerfile
# ============================================

# 阶段 1: 依赖安装
FROM node:18-alpine AS deps

# 安装构建依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++

# 设置工作目录
WORKDIR /app

# 复制包管理文件
COPY package.json pnpm-lock.yaml* ./

# 安装 pnpm
RUN npm install -g pnpm@8

# 安装依赖
RUN pnpm install --frozen-lockfile

# ============================================
# 阶段 2: 构建应用
FROM node:18-alpine AS builder

WORKDIR /app

# 从 deps 阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 安装 pnpm
RUN npm install -g pnpm@8

# 构建 TypeScript
RUN pnpm run build

# ============================================
# 阶段 3: 生产运行时
FROM node:18-alpine AS runner

WORKDIR /app

# 安装运行时依赖（better-sqlite3 需要）
RUN apk add --no-cache \
    sqlite \
    python3 \
    make \
    g++ \
    sqlite-libs

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=18100

# 复制必要文件
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prompts ./prompts

# 创建数据目录
RUN mkdir -p /app/data /app/logs && \
    chown -R nextjs:nodejs /app

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 18100

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:18100/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动命令
CMD ["node", "dist/presentation/api/server.js"]
