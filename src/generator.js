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

// ⚠️⚠️⚠️ 重要：以下 STOCK_POOL 为【模拟示例数据】，仅用于群聊演绎，
// 既非真实行情，也非真实推荐。严格只用主板标的（60xxxx / 00xxxx），
// 避开创业板 300xxx 与科创板 688xxx（符合 A股账户“只能买主板”的约束）。
const STOCK_POOL = {
  '大金融': [{ name: '中信证券', code: '600030' }, { name: '招商银行', code: '600036' }, { name: '平安银行', code: '000001' }],
  'AI算力': [{ name: '工业富联', code: '601138' }, { name: '中科曙光', code: '603019' }, { name: '沪电股份', code: '002463' }],
  '半导体': [{ name: '兆易创新', code: '603986' }, { name: '韦尔股份', code: '603501' }, { name: '北方华创', code: '002371' }],
  '中字头': [{ name: '中国平安', code: '601318' }, { name: '中国中车', code: '601766' }, { name: '中国建筑', code: '601668' }],
  '券商': [{ name: '中信证券', code: '600030' }, { name: '华泰证券', code: '601688' }, { name: '国泰君安', code: '601211' }],
  '高股息': [{ name: '中国神华', code: '601088' }, { name: '长江电力', code: '600900' }, { name: '大秦铁路', code: '601006' }],
  '公用事业': [{ name: '长江电力', code: '600900' }, { name: '华能水电', code: '600025' }, { name: '国电电力', code: '600795' }],
  '医药防御': [{ name: '恒瑞医药', code: '600276' }, { name: '云南白药', code: '000538' }, { name: '白云山', code: '600332' }],
  '黄金': [{ name: '山东黄金', code: '600547' }, { name: '中金黄金', code: '600489' }, { name: '紫金矿业', code: '601899' }],
  '轮动题材': [{ name: '长安汽车', code: '000625' }, { name: '赛力斯', code: '601127' }, { name: '上汽集团', code: '600104' }],
  '低位补涨': [{ name: '保利发展', code: '600048' }, { name: '万科A', code: '000002' }, { name: '金地集团', code: '600383' }],
  '业绩线': [{ name: '贵州茅台', code: '600519' }, { name: '五粮液', code: '000858' }, { name: '泸州老窖', code: '000568' }],
  '超跌核心': [{ name: '隆基绿能', code: '601012' }, { name: '通威股份', code: '600438' }, { name: '三一重工', code: '600031' }],
  '错杀白马': [{ name: '中国中免', code: '601888' }, { name: '海螺水泥', code: '600585' }, { name: '上海机场', code: '600009' }],
  '次新': [{ name: '沪农商行', code: '601825' }, { name: '兰州银行', code: '001227' }, { name: '中国移动', code: '600941' }],
  '新题材龙头': [{ name: '科大讯飞', code: '002230' }, { name: '三六零', code: '601360' }, { name: '浪潮信息', code: '000977' }],
  '共振板块': [{ name: '中信证券', code: '600030' }, { name: '东方证券', code: '600958' }, { name: '广发证券', code: '000776' }],
  '超跌反弹': [{ name: '三一重工', code: '600031' }, { name: '格力电器', code: '000651' }, { name: '美的集团', code: '000333' }],
};

// 板块 → 买入逻辑（模拟推演话术）
const LOGIC_POOL = {
  '大金融': '银行、券商、保险共振，指数冲关的核心引擎',
  'AI算力': '算力基建订单落地，业绩兑现最确定',
  '半导体': '国产替代加速，设备材料率先受益',
  '中字头': '估值低分红稳，避险与轮动双重属性',
  '券商': '行情风向标，量在价先',
  '高股息': '利率下行期，类债资产受追捧',
  '公用事业': '防御属性强，现金流稳',
  '医药防御': '刚需加防御，弱市避风港',
  '黄金': '避险情绪升温，金价有支撑',
  '轮动题材': '资金高低切换，低位轮动有补涨空间',
  '低位补涨': '高位拥挤，低位安全边际更高',
  '业绩线': '财报季业绩超预期是硬逻辑',
  '超跌核心': '错杀后的核心资产，反弹弹性大',
  '错杀白马': '基本面没坏只是被情绪错杀',
  '次新': '筹码干净，情绪好时弹性惊人',
  '新题材龙头': '新周期开启，龙头享受溢价',
  '共振板块': '多板块共振，持续性更强',
  '超跌反弹': '超跌到位，技术性反弹一触即发',
};
const FALLBACK_LOGIC = '主线逻辑没变，逢低仍是机会';

// 性格 → 模拟买点描述（技术位/节奏，不编具体成交价，避免冒充真实数据）
const ENTRY_POOL = {
  aggressive: ['放量突破前高直接干', '分时均价上方承接就上', '打板确认强度再加'],
  steady: ['等回踩5日线低吸更舒服', '分批建仓，不追单根大阳', '突破平台回踩不破再进'],
  cautious: ['只等缩量回踩支撑的低吸点', '不破前低才考虑，宁可错过', '等分歧转一致那一刻'],
  emotion: ['冰点后首根放量阳线就是信号', '情绪回暖确认时跟随', '拐点共振处轻仓试错'],
};

// 按板块取一只具体主板标的（mock）
function pickStock(sector) {
  const pool = STOCK_POOL[sector];
  if (pool && pool.length) return pick(pool);
  return { name: '核心标的', code: '------' };
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

// 生成单条消息文本（含“具体板块 + 具体标的 + 模拟买点”与尾部风格化免责话术）
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

  // ===== 新增：具体板块 + 具体标的（模拟示例，非真实推荐）=====
  const stock = pickStock(sector);
  const logic = LOGIC_POOL[sector] || FALLBACK_LOGIC;
  const entry = pick(ENTRY_POOL[c] || ENTRY_POOL.steady);
  let stockLine = '';
  if (turn.type === 'open') {
    // 开场定调：点一只代表标的作为方向锚（标注模拟）
    stockLine = `\n（模拟示例）方向上先看 ${stock.name}（${stock.code}）这类核心。`;
  } else if (turn.type === 'close') {
    // 收尾：给可执行结论——具体买什么
    stockLine = `\n可执行结论（模拟）：重点看 ${stock.name}（${stock.code}）——${logic}；${entry}。`;
  } else {
    // 主体发言：具体看哪只票、什么逻辑、什么买点
    const lead = { aggressive: '具体就干', steady: '重点看', cautious: '只等', emotion: '拐点看' }[c] || '看';
    stockLine = `\n具体看 ${stock.name}（${stock.code}）：${lead}——${logic}，${entry}。`;
  }

  // 免责话术强化：明确标的与价位均为模拟示例
  return text + stockLine + ' 『' + role.disclaimer + '（标的与价位均为模拟示例）』';
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
