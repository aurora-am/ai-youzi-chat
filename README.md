# AI 游资群聊

模拟 8 大固定 AI 游资角色（章盟主、炒股养家、赵老哥、作手新一、陈小群、方新侠、乔帮主、瑞鹤仙）实时群聊。
核心是一个**市场环境下调度中枢**：接入行情（当前 mock，预留东财/通达信真实接口）判断环境为
强 / 弱 / 震荡 / 情绪冰点 / 情绪回暖，据此动态点将——选主持人、排发言顺序、决定谁@谁、谁闭嘴。

> ⚠️ 本项目所有对话均由 AI 模拟生成，仅供娱乐与复盘交流，**不构成任何投资建议**。

## 特性
- 8 个可配置游资角色（头像/人设/持仓偏好/性格/说话风格/免责话术），数据落 SQLite
- 浏览器内「管理页」支持角色的编辑、新增、删除、启停
- 调度中枢按行情环境动态编排（强市偏激进、弱市偏稳健、冰点/回暖换情绪系）
- 科技蓝聊天界面：头像、昵称、时间、气泡、@高亮、主持人标记，桌面/手机自适应
- SSE 实时串行滚动，如真实群聊讨论
- 行情 mock 优先跑通全套；真实接口占位已标注（`src/marketHub.js` 底部 TODO）

## 本地运行
```bash
npm install
npm start
# 打开 http://localhost:3000        群聊
# 打开 http://localhost:3000/admin.html  角色管理
```
> 强制指定环境演示：`http://localhost:3000/?env=freeze` 无效（环境在选择框选），或直接在聊天页顶部下拉选择。

## 接入真实大模型（可选，更真实对话）
在 `src/generator.js` 底部已实现 `llmGenerate` 槽位说明。设置环境变量后于 `src/routes/chat.js` 切换：
```
LLM_API_KEY=xxx
LLM_BASE_URL=https://api.xxx/v1/chat/completions
LLM_MODEL=deepseek-chat
```
未设置则使用内置免 key 模拟生成器。

## 接入真实行情（可选）
见 `src/marketHub.js` 底部 TODO：实现 `fetchRealEastMoney()` / `fetchRealTongHuXin()`，
返回与 mock 同结构对象，并在 `getEnvironment()` 按 `MARKET_SOURCE` 切换。

## 部署到 Railway（推荐，免费起步 → 低成本）
1. 将本目录推到 GitHub 仓库（本项目已推送至 `git@github.com:aurora-am/ai-youzi-chat.git`）
2. 登录 https://railway.app → **New Project** → **Deploy from GitHub repo** → 选 `ai-youzi-chat`
3. 无需额外配置（已含 Dockerfile，且已内置 `build-base + python3` 以编译 `better-sqlite3`）
4. **挂持久卷（重要）**：进入项目 → **Settings / Volumes** → 新增 Volume，挂载路径填 `/app/data`。
   不挂卷时，Railway 每次部署/重启会重置容器文件系统，角色增删改（admin 页操作）会丢失；
   挂卷后 SQLite 持久化，改动长期保留（即使重置也会从 `roles.json` 种子重建 8 个初始角色）。
5. 部署完成后 Railway 给出 `https://xxx.up.railway.app` 永久可用网址
6. （可选）**Variables** 中添加 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` 启用真实大模型；
   添加 `PORT` 一般不需要（Railway 自动注入）。

> 国内访问 Railway 偶有波动，可后续绑定自定义域名 + CDN 提速。

### 本地 Docker 预览（可选）
```bash
docker build -t ai-youzi-chat .
docker run -p 3000:3000 -v ai-youzi-data:/app/data ai-youzi-chat
```

## 目录结构
```
ai-youzi-chat/
├── server.js              # 后端入口（Express + 静态托管 + SSE）
├── src/
│   ├── config/roles.json  # 8 角色种子
│   ├── db.js              # SQLite 持久化
│   ├── marketHub.js       # 行情环境中枢（mock + 真实接口占位）
│   ├── scheduler.js       # 调度中枢（核心：点将/顺序/@/闭嘴）
│   ├── generator.js       # 消息生成器（免key模拟 + LLM槽位）
│   └── routes/{roles,chat}.js
├── public/                # 前端（index.html 聊天 / admin.html 管理 / css / js）
├── Dockerfile / Procfile / package.json
└── data/                  # SQLite 数据库（运行时生成）
```
