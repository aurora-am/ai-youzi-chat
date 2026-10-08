// src/routes/chat.js
// -----------------------------------------------------------------------------
// 聊天相关 API：
//   GET /api/environment        —— 查询当前（或指定）行情环境
//   GET /api/chat/stream        —— SSE 实时群聊流（核心）
//
// SSE 流过程：
//   1) 下发 meta（环境 + 主持人 + 总条数）
//   2) 按调度脚本逐条生成消息并带延迟推送，模拟“实时串行讨论”
//   3) 下发 done 并关闭连接
// -----------------------------------------------------------------------------
const express = require('express');
const router = express.Router();
const { getDb, normalize } = require('../db');
const { getEnvironment } = require('../marketHub');
const { buildSession } = require('../scheduler');
const { generateMessage } = require('../generator');

// 当前环境（?env=strong|weak|shock|freeze|recover 可强制指定，便于演示）
router.get('/environment', (req, res) => {
  res.json(getEnvironment(req.query.env));
});

// SSE 实时群聊流
router.get('/chat/stream', async (req, res) => {
  // 设置 SSE 响应头
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // 关闭代理缓冲，保证实时
  });

  // 取环境（可强制）与角色
  const envObj = getEnvironment(req.query.env);
  const rows = getDb().prepare('SELECT * FROM roles').all();
  const roles = rows.map(normalize);
  const rolesById = Object.fromEntries(roles.map((r) => [r.id, r]));

  // 调度中枢生成本轮脚本
  const session = buildSession(roles, envObj);

  // 推送辅助
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1) meta：前端据此渲染环境横幅与主持人高亮
  send({
    type: 'meta',
    env: envObj,
    hostId: session.hostId,
    envLabel: session.envLabel,
    total: session.turns.length,
  });

  // 2) 逐条推送消息（带随机延迟，模拟真人打字节奏）
  try {
    for (const turn of session.turns) {
      const role = rolesById[turn.roleId];
      if (!role) continue;
      const text = generateMessage({ role, turn, envObj, rolesById });
      send({
        type: 'msg',
        role: { id: role.id, name: role.name, avatar: role.avatar },
        text,
        atTarget: turn.atTarget ? (rolesById[turn.atTarget] && rolesById[turn.atTarget].name) || null : null,
        isHost: !!turn.isHost,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      });
      await sleep(1600 + Math.random() * 1400);
    }
  } catch (e) {
    send({ type: 'error', message: String(e && e.message || e) });
  }

  // 3) 收尾
  send({ type: 'done' });
  res.end();
});

module.exports = router;
