// public/js/chat.js
// -----------------------------------------------------------------------------
// 聊天页前端逻辑：通过 EventSource 订阅 /api/chat/stream（SSE），
// 实时渲染群聊消息（头像 / 昵称 / 时间 / 气泡 / @高亮 / 主持人标记）。
// 支持：强制指定环境、新开一局、自动滚动到底。
// -----------------------------------------------------------------------------
(function () {
  const chatEl = document.getElementById('chat');
  const envBanner = document.getElementById('envBanner');
  const envMetrics = document.getElementById('envMetrics');
  const envSelect = document.getElementById('envSelect');
  const newRoundBtn = document.getElementById('newRound');

  let es = null;        // 当前 EventSource
  let hostId = null;    // 本局主持人 id
  let typingEl = null;  // “对方正在输入”提示

  // 渲染环境横幅
  function renderEnv(env, label) {
    const cls = env.state;
    envBanner.innerHTML =
      `<span class="env-state ${cls}">${label || env.label}</span>` +
      `<div class="env-metrics">
        <span>上证 <b class="${env.indexChangePct >= 0 ? 'up' : 'down'}">${env.indexChangePct >= 0 ? '+' : ''}${env.indexChangePct}%</b></span>
        <span>涨跌 <b class="up">${env.upCount}</b> : <b class="down">${env.downCount}</b></span>
        <span>涨停 <b class="up">${env.limitUp}</b> 跌停 <b class="down">${env.limitDown}</b></span>
        <span>情绪分 <b>${env.emotionScore}</b></span>
        <span>数据源 <b>${env.source}</b></span>
      </div>`;
  }

  // 把消息文本拆分为“正文 + 免责话术（『…』）”，并对 @对象 高亮
  function renderText(text, atTarget) {
    const idx = text.lastIndexOf('『');
    let main = text, disc = '';
    if (idx >= 0) { main = text.slice(0, idx); disc = text.slice(idx); }
    // @高亮：用 atTarget 字段包裹
    if (atTarget) {
      const safe = atTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      main = main.replace(new RegExp('@' + safe, 'g'), `<span class="at">@${atTarget}</span>`);
    }
    return main + (disc ? `<span class="disc">${disc}</span>` : '');
  }

  // 渲染一条消息
  function renderMsg(d) {
    const isHost = d.isHost || d.role.id === hostId;
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (isHost ? ' host' : '');
    wrap.innerHTML =
      `<div class="avatar">${d.role.avatar || '🤖'}</div>
       <div class="bubble-wrap">
         <div class="meta">
           <span class="name">${d.role.name}</span>
           ${isHost ? '<span class="host-badge">主持人</span>' : ''}
           <span class="time">${d.time}</span>
         </div>
         <div class="bubble">${renderText(d.text, d.atTarget)}</div>
       </div>`;
    chatEl.appendChild(wrap);
    scrollBottom();
  }

  function scrollBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function showTyping(name) {
    clearTyping();
    typingEl = document.createElement('div');
    typingEl.className = 'typing';
    typingEl.textContent = `${name} 正在输入…`;
    chatEl.appendChild(typingEl);
    scrollBottom();
  }
  function clearTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  // 开启一局（订阅 SSE）
  function start() {
    if (es) es.close();
    chatEl.innerHTML = '';
    hostId = null;
    const env = envSelect.value;
    const url = '/api/chat/stream' + (env ? '?env=' + env : '');
    es = new EventSource(url);

    es.onmessage = (ev) => {
      let d;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d.type === 'meta') {
        hostId = d.hostId;
        renderEnv(d.env, d.envLabel);
      } else if (d.type === 'msg') {
        clearTyping();
        renderMsg(d);
        showTyping('下一位游资'); // 为下一条制造“实时”感
      } else if (d.type === 'done') {
        clearTyping();
        es.close();
      } else if (d.type === 'error') {
        clearTyping();
        const e = document.createElement('div');
        e.className = 'typing';
        e.textContent = '出错了：' + d.message;
        chatEl.appendChild(e);
        es.close();
      }
    };
    es.onerror = () => { /* 连接关闭由 done 触发，忽略 */ };
  }

  newRoundBtn.addEventListener('click', start);
  envSelect.addEventListener('change', start);

  // 进入即开一局
  start();
})();
