# ============================================
# 多阶段构建 - 第一阶段：构建应用
# ============================================
FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json ./

# 安装依赖（包括 devDependencies 用于构建）
RUN npm ci

# 复制源代码
COPY . .

# 构建应用（环境变量可在运行时通过 --build-arg 传入）
ARG VITE_API_BASE_URL=
ARG VITE_R2_BASE_URL=https://r2.narratoai.cn
ARG VITE_TOS_UPLOAD_API_BASE_URL=

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_R2_BASE_URL=${VITE_R2_BASE_URL}
ENV VITE_TOS_UPLOAD_API_BASE_URL=${VITE_TOS_UPLOAD_API_BASE_URL}

# 执行构建
RUN npm run build

# ============================================
# 多阶段构建 - 第二阶段：生产镜像
# ============================================
FROM nginx:1.27-alpine AS production

# 安装 tzdata 用于时区设置
RUN apk add --no-cache tzdata

# 设置时区为中国时区
ENV TZ=Asia/Shanghai

# 复制自定义 Nginx 配置
COPY nginx.conf /etc/nginx/nginx.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 设置文件权限
RUN chmod -R 755 /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
LABEL org.opencontainers.image.title="Avatar Agent Web" com.aicat.project="avatar-agent"
