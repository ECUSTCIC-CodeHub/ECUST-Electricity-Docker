# 阶段 1: 构建前端
FROM node:20-alpine AS builder
WORKDIR /app

# 复制依赖定义
COPY package.json package-lock.json* ./

# 安装所有依赖
RUN npm install

# 复制源码并构建前端
COPY . .
RUN npm run build

# ---------------------------------------------

# 阶段 2: 生产环境 (极致瘦身版)
FROM node:20-alpine
WORKDIR /app

# 复制 package.json
COPY package.json ./

# 【关键优化】
# 1. 安装编译工具 (.build-deps)
# 2. 安装生产依赖
# 3. 【新增】暴力清理 node_modules 中的垃圾文件
# 4. 删除编译工具和缓存
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install --omit=dev \
    # --- 开始清理 ---
    && find node_modules -name "*.d.ts" -delete \
    && find node_modules -name "*.map" -delete \
    && find node_modules -name "*.md" -delete \
    && find node_modules -name "LICENSE" -delete \
    && find node_modules -type d -name "test" -exec rm -rf {} + \
    && find node_modules -type d -name "docs" -exec rm -rf {} + \
    && find node_modules -type d -name "example" -exec rm -rf {} + \
    # 针对 sqlite3 的特殊清理 (只保留 .node 文件)
    && rm -rf node_modules/sqlite3/build/Release/obj \
    && rm -rf node_modules/sqlite3/deps \
    && rm -rf node_modules/sqlite3/src \
    # --- 清理结束 ---
    && apk del .build-deps \
    && rm -rf /root/.npm

# 从阶段 1 复制编译好的前端静态文件
COPY --from=builder /app/dist ./dist

# 复制后端业务代码
COPY server.js scraper.js database.js ./

# 创建数据目录
RUN mkdir -p data

# 环境变量默认值
ENV PORT=8080
ENV DB_PATH=./data/main.db
ENV ROOM_ID=""
# 核心配置：
ENV PART_ID="奉贤"
ENV BUILD_ID=""
# 可选配置 (如果不填，会自动根据以上三个生成)
ENV ROOM_URL=""

EXPOSE 8080

CMD ["node", "server.js"]