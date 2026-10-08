# 运行环境（Railway / Render 自动读取）
FROM node:22-alpine

WORKDIR /app

# 先装依赖（利用层缓存）
COPY package*.json ./
RUN npm install --omit=dev

# 拷贝源码
COPY . .

# 确保数据目录存在（SQLite 落盘）
RUN mkdir -p data

EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
