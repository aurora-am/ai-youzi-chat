// src/marketHub.js
// -----------------------------------------------------------------------------
// 行情环境中枢：判断当前市场处于 强 / 弱 / 震荡 / 情绪冰点 / 情绪回暖 五态之一。
//
// 当前为【mock 实现】（按用户要求先用模拟数据跑通全套调度与界面）。
// 真实接口（东方财富 / 通达信）的接入位置已在文件底部 TODO 标注，并列出待接字段。
// 对外统一入口 getEnvironment(forced?) 返回结构固定，切换真实源时无需改调度层。
// -----------------------------------------------------------------------------

// 五种环境状态
const ENV_STATES = ['strong', 'weak', 'shock', 'freeze', 'recover'];

// 环境中文标签
const ENV_LABEL = {
  strong: '强势',
  weak: '弱势',
  shock: '震荡',
  freeze: '情绪冰点',
  recover: '情绪回暖',
};

// 不同环境侧重的不同题材/行业池（供生成器取用，使对话贴合环境）
const SECTORS = {
  strong: ['大金融', 'AI算力', '半导体', '中字头', '券商'],
  weak: ['高股息', '公用事业', '医药防御', '黄金'],
  shock: ['轮动题材', '低位补涨', '业绩线'],
  freeze: ['超跌核心', '错杀白马', '次新'],
  recover: ['新题材龙头', '共振板块', '超跌反弹'],
};

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 由状态推导一组“拟真”的行情指标（仅 mock 用）
function metricsOf(state) {
  return {
    strong: { indexChangePct: 1.8, up: 3800, down: 1200, limitUp: 85, limitDown: 3, emotion: 78 },
    weak: { indexChangePct: -1.6, up: 900, down: 4100, limitUp: 18, limitDown: 42, emotion: 28 },
    shock: { indexChangePct: 0.1, up: 2400, down: 2600, limitUp: 45, limitDown: 12, emotion: 50 },
    freeze: { indexChangePct: -0.4, up: 1100, down: 3900, limitUp: 9, limitDown: 35, emotion: 15 },
    recover: { indexChangePct: 0.9, up: 3200, down: 1500, limitUp: 60, limitDown: 8, emotion: 62 },
  }[state];
}

// 生成一份 mock 行情环境对象（结构即“契约”，真实源需对齐）
function getMockEnvironment() {
  const state = rand(ENV_STATES);
  const m = metricsOf(state);
  return {
    state, // 五态枚举
    label: ENV_LABEL[state], // 中文标签
    indexChangePct: m.indexChangePct, // 上证涨跌幅(%)
    upCount: m.up, // 上涨家数
    downCount: m.down, // 下跌家数
    limitUp: m.limitUp, // 涨停家数
    limitDown: m.limitDown, // 跌停家数
    emotionScore: m.emotion, // 情绪分(0-100)
    source: 'mock', // 数据来源：mock / eastmoney / tonghuaxin
    sectors: SECTORS[state], // 本环境侧重题材（供生成器）
    // ===== 真实接口待接字段占位（接入东财/通达信后填充）=====
    // realFields: {
    //   indexCode: 'sh000001',                 // 指数代码（如上证 sh000001）
    //   apiBase: '',                           // 行情基地址
    //   apiKey: process.env.MARKET_API_KEY,     // 如需鉴权
    //   snapshotUrl: '',                       // 实时快照接口
    // }
  };
}

// 对外统一入口
//   forced: 可强制指定环境（'strong'|'weak'|'shock'|'freeze'|'recover'），便于演示与测试
function getEnvironment(forced) {
  if (forced && ENV_STATES.includes(forced)) {
    const e = getMockEnvironment();
    const m = metricsOf(forced);
    e.state = forced;
    e.label = ENV_LABEL[forced];
    e.source = 'mock(forced)';
    e.indexChangePct = m.indexChangePct;
    e.upCount = m.up;
    e.downCount = m.down;
    e.limitUp = m.limitUp;
    e.limitDown = m.limitDown;
    e.emotionScore = m.emotion;
    e.sectors = SECTORS[forced];
    return e;
  }
  return getMockEnvironment();
}

/*
================================================================================
TODO —— 真实行情接入（东方财富 / 通达信）
--------------------------------------------------------------------------------
1) 东方财富：可用其公开行情接口（如 push2 行情、涨跌家数、涨跌停数据）获取
   indexChangePct / upCount / downCount / limitUp / limitDown。
2) 通达信：通常需行情网关或本地客户端，可能需账号；获取方式依其 API 而定。
3) 情绪分 emotionScore 建议由：涨停数、连板高度、昨日涨停今日表现、涨跌家数比
   等加权合成（0-100）。
4) 实现下方两个函数，返回与 getMockEnvironment() 完全同结构的对象，并在
   getEnvironment() 中按 process.env.MARKET_SOURCE 切换（'mock'|'eastmoney'|'tonghuaxin'）。

async function fetchRealEastMoney() {
  // const res = await fetch(`https://push2.eastmoney.com/...`);
  // return { state, label, indexChangePct, upCount, downCount, limitUp, limitDown, emotionScore, source:'eastmoney', sectors };
}

async function fetchRealTongHuXin() {
  // 通达信行情接口实现
}
================================================================================
*/

module.exports = { getEnvironment, ENV_LABEL, ENV_STATES, SECTORS };
