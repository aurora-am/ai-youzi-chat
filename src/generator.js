// src/generator.js
// -----------------------------------------------------------------------------
// 消息生成器（内置模拟，免 key，开箱即跑）。
// 依据【角色阵营 × 环境 × 话术类型】从模板库抽取话术并填充占位符，
// 产出贴合人设与行情的群聊内容。每条消息尾部附该角色的风格化免责话术。
//
// 预留真实 LLM 槽位：若设置 process.env.LLM_API_KEY，可在 chat 路由中切换为
// llmGenerate()（见文件底部 TODO），生成更真实的对话。
// -----------------------------------------------------------------------------
const { SECTORS } = require('./marketHub');
const { camp } = require('./scheduler');

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 模板库：按阵营分桶，每桶含 open(开场) / speak(普通发言) / respond(@回应) / close(收尾)
// 占位符：{e}=环境标签  {s}=题材  {t}=@对象昵称
const T = {
  aggressive: {
    open: [
      '今天这盘面{e}，{s}必须干！我直接上仓位，不怕。',
      '环境{e}，别怂。{s}才是主线，跟着资金走就完了。',
      '{e}行情还用犹豫？{s}我头铁先上，兄弟们跟上。',
    ],
    speak: [
      '我继续加{s}，这种环境就是拼头铁的时候。',
      '{s}今天异动明显，量能也跟上了，闭眼上车。',
      '别跟我扯风险，机会就在眼前，{s}我锁了。',
    ],
    respond: [
      '@{t} 说得对，咱们一起把{s}顶上去！',
      '@{t} 你那点担忧多余，主线就是{s}，干就完了。',
    ],
    close: [
      '总结：今日控仓进攻，主线盯{s}。分歧点在高位接力，敢上才有肉，怂就错过。',
    ],
  },
  steady: {
    open: [
      '盘面{e}，我不急着满仓，{s}可以小仓试错，子弹要留着。',
      '{e}环境下，节奏比方向重要，{s}先看承接再说。',
      '今天{e}，我的原则是不追高，{s}等回踩更舒服。',
    ],
    speak: [
      '{s}逻辑没问题，但要看承接，不追高。',
      '我偏向{s}里挑核心，趋势没坏就拿着。',
      '仓位别一把梭，{s}分批更稳。',
    ],
    respond: [
      '@{t} 我同意你的方向，不过节奏上再等等。',
      '@{t} 风险得防，{s}可以，但别上头。',
    ],
    close: [
      '结论：{e}下以稳为主，{s}可低吸核心，总仓不超五成。分歧在追高与否——我主张等确认。',
    ],
  },
  cautious: {
    open: [
      '{e}，我先观望，手里的{s}先减点，保住利润要紧。',
      '这环境{e}，宁可错过不想做错，{s}等回踩。',
      '今天{e}，我的策略是防守，{s}不急这一时。',
    ],
    speak: [
      '{s}现在位置不低，我选择等分歧低吸。',
      '风险第一位，{s}再看看，不急。',
      '追高容易被埋，{s}我宁可空着。',
    ],
    respond: [
      '@{t} 你激进了，{s}追高容易被埋，悠着点。',
      '@{t} 谨慎点没错，{s}别上头。',
    ],
    close: [
      '收尾：{e}防御优先，{s}只做低吸或空仓。分歧在于激进派要进攻、我主张控仓——保命要紧。',
    ],
  },
  emotion: {
    open: [
      '市场情绪处{e}，这是认知的兑现点。{s}要看情绪拐点，而非指数。',
      '{e}阶段，比涨跌更重要的是人心。{s}里找共振。',
      '情绪{e}，别人恐惧我贪婪，{s}是种子。',
    ],
    speak: [
      '情绪{e}，我的体系告诉我：冰点之后必有预期差，{s}是种子。',
      '{s}的拐点往往先于指数，重认知而非分时。',
    ],
    respond: [
      '@{t} 你看到的是风险，我看到的是冰点后的预期差，{s}。',
      '@{t} 别被短期波动吓退，{s}看长远。',
    ],
    close: [
      '定调：{e}，情绪拐点重于指数。可执行——{s}小仓试错、设好止损；分歧在何时加码，我倾向确认回暖后再上。',
    ],
  },
};

// 填充占位符（支持模板中多次出现同一占位符）
function fill(tpl, ctx) {
  return tpl
    .split('{e}').join(ctx.envLabel)
    .split('{s}').join(ctx.sector)
    .split('{t}').join(ctx.targetName || '');
}

// 生成单条消息文本（含尾部风格化免责话术）
//   role       : 角色对象（含 disclaimer / personality / is_emotion_anchor）
//   turn       : 调度脚本中的某一 turn（含 type / atTarget）
//   envObj     : 行情环境对象（含 label / sectors）
//   rolesById  : id → 角色 映射，用于解析 @对象昵称
function generateMessage({ role, turn, envObj, rolesById }) {
  const c = camp(role);
  const bucket = T[c] || T.steady;
  let tpl;
  if (turn.type === 'open') {
    tpl = pick(bucket.open);
  } else if (turn.type === 'close') {
    tpl = pick(bucket.close);
  } else {
    // speak：有 @对象用 respond 模板，否则用 speak 模板
    tpl = turn.atTarget ? pick(bucket.respond) : pick(bucket.speak);
  }
  const targetName = turn.atTarget ? (rolesById[turn.atTarget] && rolesById[turn.atTarget].name) || '' : '';
  const sector = pick(envObj.sectors);
  let text = fill(tpl, { envLabel: envObj.label, sector, targetName });
  // 每条消息尾部附该角色风格化免责话术（用 『』 包裹，前端会弱化显示）
  return text + ' 『' + role.disclaimer + '』';
}

/*
================================================================================
TODO —— 真实 LLM 槽位（预留，接入后对话更真实）
--------------------------------------------------------------------------------
若需更自然的对话，实现下方函数并在 chat 路由中切换：
async function llmGenerate({ role, turn, envObj, context }) {
  const userPrompt = buildUserPrompt({ role, turn, envObj, context });
  const resp = await fetch(process.env.LLM_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages: [
        { role: 'system', content: role.system_prompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const data = await resp.json();
  return data.choices[0].message.content + ' 『' + role.disclaimer + '』';
}
切换方式（在 routes/chat.js 中）：
  const text = process.env.LLM_API_KEY ? await llmGenerate(...) : generateMessage(...);
================================================================================
*/

module.exports = { generateMessage };
