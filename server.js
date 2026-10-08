// server.js
// -----------------------------------------------------------------------------
// AI 游资群聊 —— 后端入口
// 启动 Express：托管前端静态资源 + 挂载角色管理 API + 聊天 SSE 流。
// 部署到 Railway / Render 时，平台会注入 PORT 环境变量。
// -----------------------------------------------------------------------------
const express = require('express');
const path = require('path');
const { ensureDb } = require('./src/db');
const rolesRoutes = require('./src/routes/roles');
const chatRoutes = require('./src/routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json()); // 解析 JSON 请求体（角色管理 API 需要）

// 启动即确保数据库与种子角色就绪
ensureDb();

// 静态前端（聊天页 / 管理页 / css / js）
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api/roles', rolesRoutes);
app.use('/api', chatRoutes); // chatRoutes 暴露 /api/environment、/api/chat/stream

app.listen(PORT, () => {
  console.log(`[AI游资群聊] running on http://localhost:${PORT}`);
});
