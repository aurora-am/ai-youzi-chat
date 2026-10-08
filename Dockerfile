# AI 游资群聊 —— 运行环境（Railway / Render 自动读取本 Dockerfile）
FROM node:22-alpine

WORKDIR /app

# ⚠️ better-sqlite3 是原生编译模块，Alpine 必须预装 C/C++ 工具链与 python3，
# 否则 `npm install` 在编译阶段会失败导致部署起不来。
RUN apk add --no-cache build-base python3

# 先装依赖（利用 Docker 层缓存：仅 package*.json 变动时才重装）
COPY package*.json ./
RUN npm install --omit=dev

# 拷贝源码
COPY . .

# 确保 SQLite 落盘目录存在
RUN mkdir -p data

# Railway / Render 会注入 PORT 环境变量；本地默认 3000
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
