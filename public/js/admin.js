// public/js/admin.js
// -----------------------------------------------------------------------------
// 角色管理页：列出全部角色，支持新增 / 编辑 / 删除（调用 /api/roles）。
// 编辑时把角色数据回填到表单；保存时按是否有 id 区分新增(POST)/修改(PUT)。
// -----------------------------------------------------------------------------
(function () {
  const tbody = document.getElementById('tbody');
  const msg = document.getElementById('msg');
  const $ = (id) => document.getElementById(id);

  const fields = ['id','name','avatar','personality','holding_pref','style','anchor','active','persona','system_prompt','disclaimer'];

  function readForm() {
    return {
      id: $('f_id').value.trim(),
      name: $('f_name').value.trim(),
      avatar: $('f_avatar').value.trim(),
      personality: $('f_personality').value,
      holding_pref: $('f_holding_pref').value.trim(),
      style: $('f_style').value.trim(),
      is_emotion_anchor: $('f_anchor').checked,
      active: $('f_active').checked,
      persona: $('f_persona').value.trim(),
      system_prompt: $('f_system_prompt').value.trim(),
      disclaimer: $('f_disclaimer').value.trim(),
    };
  }

  function fillForm(r) {
    $('f_id').value = r.id || '';
    $('f_id').disabled = !!r.id; // 编辑时锁定 id
    $('f_name').value = r.name || '';
    $('f_avatar').value = r.avatar || '';
    $('f_personality').value = r.personality || 'steady';
    $('f_holding_pref').value = r.holding_pref || '';
    $('f_style').value = r.style || '';
    $('f_anchor').checked = !!r.is_emotion_anchor;
    $('f_active').checked = r.active !== false;
    $('f_persona').value = r.persona || '';
    $('f_system_prompt').value = r.system_prompt || '';
    $('f_disclaimer').value = r.disclaimer || '';
  }

  function resetForm() {
    fields.forEach((f) => { if ($(('f_' + f))) $(('f_' + f)).value = ''; });
    $('f_personality').value = 'steady';
    $('f_active').checked = true;
    $('f_anchor').checked = false;
    $('f_id').disabled = false;
    msg.textContent = '';
  }

  function tag(text, cls) { return `<span class="tag ${cls}">${text}</span>`; }

  async function load() {
    const res = await fetch('/api/roles');
    const list = await res.json();
    tbody.innerHTML = '';
    list.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td style="font-size:20px;">${r.avatar || '🤖'}</td>` +
        `<td><b>${r.name}</b><br><span class="muted">${r.id}</span></td>` +
        `<td>${tag(r.personality, r.personality)}</td>` +
        `<td>${r.is_emotion_anchor ? tag('情绪锚点','anchor') : '—'}</td>` +
        `<td>${r.holding_pref || ''}</td>` +
        `<td>${r.style || ''}</td>` +
        `<td>${r.active ? '✅' : '⛔'}</td>` +
        `<td>
           <button class="btn ghost" data-edit="${r.id}">编辑</button>
           <button class="btn ghost" data-del="${r.id}">删除</button>
         </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = list.find((x) => x.id === b.dataset.edit);
        fillForm(r);
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      })
    );
    tbody.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('确认删除该角色？')) return;
        await fetch('/api/roles/' + b.dataset.del, { method: 'DELETE' });
        load();
      })
    );
  }

  $('saveBtn').addEventListener('click', async () => {
    const r = readForm();
    if (!r.id || !r.name) { msg.textContent = '⚠️ id 与昵称为必填'; return; }
    const method = $('f_id').disabled ? 'PUT' : 'POST';
    const url = $('f_id').disabled ? '/api/roles/' + r.id : '/api/roles';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    if (res.ok) { msg.textContent = '✅ 已保存'; resetForm(); load(); }
    else { msg.textContent = '❌ ' + (await res.json()).error; }
  });

  $('resetBtn').addEventListener('click', resetForm);

  load();
})();
