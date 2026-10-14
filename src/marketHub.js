// src/marketHub.js
// -----------------------------------------------------------------------------
// 行情环境中枢：判断当前市场处于 强 / 弱 / 震荡 / 情绪冰点 / 情绪回暖 五态之一。
//
// 【真实行情接入】默认尝试调用东方财富公开行情接口（push2，免账号/免 token），
//   获取：上证涨跌幅、涨跌家数、涨停/跌停数、行业板块领涨、板块领涨股。
//   接口不可达（本机无外网 / 非交易时段接口变更 / 网络拦截）时，
//   自动降级为 mock 并在 env 上打 dataMissing 标记 + 缺失原因 + 刷新命令，
//   前端据此展示「数据缺失」提示（严格遵守数据真实性原则，绝不伪造）。
//
// 对外统一入口 getEnvironment(forced?) 返回结构固定（契约），
//   调度层 / 生成器只依赖该结构，切换数据源无需改其它模块。
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

// 不同环境侧重的不同题材/行业池（仅 mock 兜底用；真实模式下用东财实时板块）
const SECTORS = {
  strong: ['大金融', 'AI算力', '半导体', '中字头', '券商'],
  weak: ['高股息', '公用事业', '医药防御', '黄金'],
  shock: ['轮动题材', '低位补涨', '业绩线'],
  freeze: ['超跌核心', '错杀白马', '次新'],
  recover: ['新题材龙头', '共振板块', '超跌反弹'],
};

// 东财公开接口请求头（带 UA/Referer，避免被拒）
const EM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  Referer: 'https://quote.eastmoney.com/',
};

// 通用抓取（带 8s 超时 + 基础校验）
async function emGet(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: EM_HEADERS, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || j.rc !== 0) throw new Error('接口返回异常 rc=' + (j && j.rc));
    return j;
  } finally {
    clearTimeout(timer);
  }
}

// 板级涨停阈值：主板 10% / 创业板·科创板 20% / 其它 10%（北交已排除）
function limitThreshold(code) {
  const c = String(code);
  if (/^(30|688)/.test(c)) return 20;
  return 10;
}

// 是否交易时段（本机本地时间近似，未做时区换算，适用于中国时区机器）
function isTradingNow() {
  const d = new Date();
  const day = d.getDay();
  if (day === 0 || day === 6) return false; // 周末
  const m = d.getHours() * 60 + d.getMinutes();
  return (m >= 570 && m <= 690) || (m >= 780 && m <= 900); // 9:30-11:30 / 13:00-15:00
}

// 由真实指标推导五态
function deriveState(indexPct, breadth, limitUp, limitDown, emotion) {
  if (emotion <= 22 && limitUp <= 20) return 'freeze';          // 情绪冰点
  if (emotion >= 55 && limitUp >= 45 && indexPct > 0.4) return 'recover'; // 情绪回暖
  if (indexPct >= 0.8 && breadth > 0.25) return 'strong';       // 强势
  if (indexPct <= -0.8 && breadth < -0.25) return 'weak';       // 弱势
  return 'shock';                                               // 震荡
}

// 计算情绪分（0-100）：涨跌家数比 + 涨停数 + 跌停数 + 指数
function computeEmotion(up, down, limitUp, limitDown, indexPct) {
  const total = up + down || 1;
  const breadth = (up - down) / total; // -1..1
  let score = 50 + breadth * 35;
  score += Math.min(limitUp, 120) / 120 * 15;
  score -= Math.min(limitDown, 80) / 80 * 10;
  score += Math.max(-2, Math.min(2, indexPct)) / 2 * 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ===================== 真实行情：东方财富 =====================
async function fetchEastMoney() {
  // 1) 上证指数（secid: 1.000001）
  const idxUrl =
    'https://push2.eastmoney.com/api/qt/stock/get?secid=1.000001&fields=f43,f57,f58,f169,f170';
  // 2) 全量 A 股快照（沪深主板 + 创业 + 科创，不含北交），用于涨跌家数 / 涨停跌停
  const snapUrl =
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=8000&fid=f3' +
    '&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3';
  // 3) 行业板块（取涨幅榜），用于真实热点板块
  const sectorUrl =
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&fid=f3' +
    '&fs=m:90+t:2&fields=f12,f14,f3,f62';

  const [idxRes, snapRes, secRes] = await Promise.all([
    emGet(idxUrl), emGet(snapUrl), emGet(sectorUrl),
  ]);

  // —— 指数 ——
  const idx = idxRes.data || {};
  const indexChangePct = idx.f170 != null ? Number(idx.f170) : 0;

  // —— 涨跌家数 / 涨停跌停（板级阈值）——
  const list = (snapRes.data && snapRes.data.diff) || [];
  let up = 0, down = 0, limitUp = 0, limitDown = 0;
  for (const s of list) {
    const chg = Number(s.f3);
    if (isNaN(chg)) continue;
    if (chg > 0) up++;
    else if (chg < 0) down++;
    const th = limitThreshold(s.f12) - 0.15; // 容差
    if (chg >= th) limitUp++;
    else if (chg <= -th) limitDown++;
  }

  // —— 热点板块（按涨幅排序取前 8）——
  const secList = (secRes.data && secRes.data.diff) || [];
  const hot = secList
    .map((s) => ({
      bk: s.f12,                       // 板块代码（如 BK0735）
      name: s.f14,                     // 板块名称
      changePct: Number(s.f3),         // 板块涨跌幅%
      leader: null,                    // 领涨股（稍后并发补全）
    }))
    .filter((s) => !isNaN(s.changePct))
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 8);

  // —— 并发补全各热点板块的领涨股（取板块内涨幅第 1 的个股）——
  await Promise.all(
    hot.map(async (sec) => {
      try {
        if (!sec.bk) return;
        const u =
          'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=3&fid=f3' +
          `&fs=b:${sec.bk}+f:!50&fields=f12,f14,f3`;
        const r = await emGet(u);
        const cons = (r.data && r.data.diff) || [];
        if (cons.length) {
          cons.sort((a, b) => Number(b.f3) - Number(a.f3));
          sec.leader = { name: cons[0].f14, code: String(cons[0].f12) };
        }
      } catch (_) {
        /* 单板块领涨股失败不影响整体，leader 留 null 走 mock 回退 */
      }
    })
  );

  // —— 情绪分 & 状态推导 ——
  const breadth = up + down ? (up - down) / (up + down) : 0;
  const emotionScore = computeEmotion(up, down, limitUp, limitDown, indexChangePct);
  const state = deriveState(indexChangePct, breadth, limitUp, limitDown, emotionScore);

  // —— 组装（契约结构，与 mock 一致）——
  const sectorDetails = {};
  hot.forEach((s) => (sectorDetails[s.name] = { changePct: s.changePct, leader: s.leader }));
  return {
    state,
    label: ENV_LABEL[state],
    indexChangePct: Number(indexChangePct.toFixed(2)),
    upCount: up,
    downCount: down,
    limitUp,
    limitDown,
    emotionScore,
    source: 'eastmoney',
    sectors: hot.map((s) => s.name), // 真实热点板块名（供生成器取用）
    sectorDetails,                   // 板块 → {changePct, leader}
    tradingSession: isTradingNow(),
    fetchedAt: new Date().toISOString(),
  };
}

// ===================== mock 兜底 =====================
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

function buildMock(state) {
  const st = state || ENV_STATES[Math.floor(Math.random() * ENV_STATES.length)];
  const m = metricsOf(st);
  return {
    state: st,
    label: ENV_LABEL[st],
    indexChangePct: m.indexChangePct,
    upCount: m.up,
    downCount: m.down,
    limitUp: m.limitUp,
    limitDown: m.limitDown,
    emotionScore: m.emotion,
    source: 'mock',
    sectors: SECTORS[st],
    sectorDetails: {}, // mock 无板块明细，生成器走 STOCK_POOL 回退
  };
}

// 降级为 mock，并标注数据缺失（前端展示警告）
function mockWithMissing(reason) {
  const e = buildMock(null);
  e.source = 'mock(degraded)';
  e.dataMissing = true;
  e.missingReason = reason;
  e.refreshCmd = '确认本机可访问 https://push2.eastmoney.com 后，重启 node server.js 并刷新页面。';
  return e;
}

// ===================== 对外统一入口 =====================
//   forced: 强制指定环境（'strong'|'weak'|'shock'|'freeze'|'recover'）→ 返回 mock（演示用）
//   无 forced: 默认尝试真实东财行情；可用环境变量 MARKET_SOURCE=mock 强制纯模拟
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30 * 1000; // 30s 内复用，减少接口调用

async function getEnvironment(forced) {
  // 演示强制环境：始终返回对应 mock
  if (forced && ENV_STATES.includes(forced)) return buildMock(forced);

  // 环境变量可强制纯模拟（便于无网环境演示）
  const source = (process.env.MARKET_SOURCE || 'eastmoney').toLowerCase();
  if (source === 'mock') return buildMock(null);

  // 真实行情：带 30s 缓存
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;
  try {
    const env = await fetchEastMoney();
    _cache = env;
    _cacheAt = now;
    return env;
  } catch (err) {
    // 绝不伪造：接口不可达 → 降级 mock + 数据缺失标记
    const reason = '东财实时接口不可达：' + (err && err.message ? err.message : String(err));
    return mockWithMissing(reason);
  }
}

module.exports = { getEnvironment, ENV_LABEL, ENV_STATES, SECTORS };
