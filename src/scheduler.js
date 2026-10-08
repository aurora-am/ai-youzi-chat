// src/scheduler.js
// -----------------------------------------------------------------------------
// 调度中枢（本项目核心）：根据行情环境，动态“点将”安排一场群聊。
// 负责：① 选主持人（开场定调 + 收尾给可执行结论并说明分歧）
//       ② 排发言顺序
//       ③ 决定谁 @ 谁
//       ④ 决定谁“闭嘴”（该环境下不安排发言）
//
// 调度原则（用户给定）：
//   强市偏激进系、弱市偏稳健系、情绪冰点/回暖换情绪系。
// -----------------------------------------------------------------------------
const { ENV_LABEL } = require('./marketHub');

// 角色阵营判定：情绪锚点 > 激进 > 谨慎 > 稳健
function camp(r) {
  if (r.is_emotion_anchor) return 'emotion';
  if (r.personality === 'aggressive') return 'aggressive';
  if (r.personality === 'cautious') return 'cautious';
  return 'steady';
}

// 环境 → 调度策略表（核心映射，改这里即可调整所有点将逻辑）
//   hostCamp : 该环境由哪一阵营主持（开场 + 收尾）
//   order    : 主体发言阵营顺序（数组越靠前越先说）
//   mute     : 被“闭嘴”的阵营（本环境不安排其发言）
//   atMode   : @ 模式，决定谁 @ 谁（见 buildSession 中的解释）
const STRATEGY = {
  strong: { hostCamp: 'aggressive', order: ['aggressive', 'steady', 'cautious'], mute: [], atMode: 'aggressive-huddle' },
  weak: { hostCamp: 'steady', order: ['cautious', 'steady', 'aggressive'], mute: ['aggressive'], atMode: 'steady-confirm' },
  shock: { hostCamp: 'steady', order: ['steady', 'aggressive', 'cautious'], mute: [], atMode: 'host-call' },
  freeze: { hostCamp: 'emotion', order: ['emotion', 'cautious'], mute: ['aggressive'], atMode: 'emotion-ask' },
  recover: { hostCamp: 'emotion', order: ['emotion', 'aggressive', 'steady'], mute: [], atMode: 'emotion-ignite' },
};

// 选主持人：优先取该阵营的情绪锚点，否则取阵营内第一个启用角色
function pickHost(roles, env) {
  const strategy = STRATEGY[env];
  const pool = roles.filter((r) => camp(r) === strategy.hostCamp && r.active);
  const host = pool.find((r) => r.is_emotion_anchor) || pool[0] || roles.find((r) => r.active);
  return host;
}

// 排发言顺序：过滤掉被闭嘴阵营，再按策略 order 排序
// 注意：未出现在 order 数组中的阵营，视为“末尾”，用大数 999 占位，避免 -1 排到最前
function orderSpeakers(roles, env) {
  const strategy = STRATEGY[env];
  const active = roles.filter((r) => r.active && !strategy.mute.includes(camp(r)));
  const rank = (c) => {
    const i = strategy.order.indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...active].sort((a, b) => rank(camp(a)) - rank(camp(b)));
}

// 构建一轮对话脚本（turn 列表，不含具体文本，文本由 generator 在流中生成）
// 返回：{ hostId, env, envLabel, turns: [{roleId, type, isHost, atTarget?}] }
function buildSession(roles, envObj) {
  const env = envObj.state;
  const strategy = STRATEGY[env];
  const host = pickHost(roles, env);
  const speakers = orderSpeakers(roles, env);

  const turns = [];

  // 1) 主持人开场定调
  turns.push({ roleId: host.id, type: 'open', isHost: true });

  // 1.5) 情绪冰点/回暖：情绪系主持人开场后即“点将”@ 一下关键阵营，
  //      落实“情绪系@谨慎研判 / 情绪系@激进点燃”的调度意图
  if (strategy.atMode === 'emotion-ask' || strategy.atMode === 'emotion-ignite') {
    const targetCamp = strategy.atMode === 'emotion-ask' ? 'cautious' : 'aggressive';
    const tgt = speakers.find((x) => camp(x) === targetCamp);
    if (tgt) turns.push({ roleId: host.id, type: 'speak', atTarget: tgt.id, isHost: true });
  }

  // 2) 主体发言：按 order 顺序，每人 1~2 条；按 atMode 决定 @ 对象
  speakers.forEach((sp, i) => {
    if (sp.id === host.id) return; // 主持人已在首尾，主体不再重复
    const msgCount = 1 + (Math.random() < 0.4 ? 1 : 0); // 40% 概率说两条
    for (let k = 0; k < msgCount; k++) {
      let atTarget = null;
      if (k === 0) {
        // 仅首条按环境策略决定 @；第二条视作自由补充
        if (strategy.atMode === 'aggressive-huddle' && camp(sp) === 'aggressive' && i > 0) {
          // 激进互@抱团：@ 前面最近的激进系（非主持）
          const prev = speakers.slice(0, i).reverse().find((x) => camp(x) === 'aggressive' && x.id !== host.id);
          if (prev) atTarget = prev.id;
        } else if (strategy.atMode === 'steady-confirm' && camp(sp) === 'steady') {
          // 稳健 @ 谨慎，确认风险
          const c = speakers.find((x) => camp(x) === 'cautious');
          if (c) atTarget = c.id;
        } else if (strategy.atMode === 'emotion-ask' && camp(sp) === 'emotion') {
          // 情绪系 @ 谨慎，研判冰点
          const c = speakers.find((x) => camp(x) === 'cautious');
          if (c) atTarget = c.id;
        } else if (strategy.atMode === 'emotion-ignite' && camp(sp) === 'aggressive') {
          // 情绪回暖：激进 @ 情绪系，点燃主线
          const e = speakers.find((x) => camp(x) === 'emotion');
          if (e) atTarget = e.id;
        } else if (strategy.atMode === 'host-call') {
          // 震荡：主持人点将，偶数位 @ 前一位
          if (i > 0) atTarget = speakers[i - 1].id;
        }
      }
      turns.push({ roleId: sp.id, type: 'speak', atTarget, isHost: false });
    }
  });

  // 3) 主持人收尾：可执行结论 + 说明分歧
  turns.push({ roleId: host.id, type: 'close', isHost: true });

  return { hostId: host.id, env, envLabel: ENV_LABEL[env], turns };
}

module.exports = { buildSession, camp, STRATEGY };
