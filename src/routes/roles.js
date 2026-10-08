// src/routes/roles.js
// -----------------------------------------------------------------------------
// 角色管理 API：支持查询 / 新增 / 修改 / 删除（对应管理页的编辑、增删）。
// 所有写操作均落 SQLite（见 src/db.js），重启后保留。
// -----------------------------------------------------------------------------
const express = require('express');
const router = express.Router();
const { getDb, normalize, normalizeIn } = require('../db');

// GET /api/roles —— 列出全部角色（含停用）
router.get('/', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM roles ORDER BY rowid').all();
  res.json(rows.map(normalize));
});

// POST /api/roles —— 新增或整体覆盖（按 id upsert）
router.post('/', (req, res) => {
  const r = req.body || {};
  if (!r.id || !r.name) return res.status(400).json({ error: 'id 与 name 为必填' });
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO roles
        (id,name,avatar,persona,holding_pref,personality,is_emotion_anchor,style,system_prompt,disclaimer,active)
       VALUES
        (@id,@name,@avatar,@persona,@holding_pref,@personality,@is_emotion_anchor,@style,@system_prompt,@disclaimer,@active)`
    )
    .run(normalizeIn(r));
  res.json(normalize(getDb().prepare('SELECT * FROM roles WHERE id=?').get(r.id)));
});

// PUT /api/roles/:id —— 修改指定角色
router.put('/:id', (req, res) => {
  const r = { ...req.body, id: req.params.id };
  const exist = getDb().prepare('SELECT id FROM roles WHERE id=?').get(req.params.id);
  if (!exist) return res.status(404).json({ error: '角色不存在' });
  getDb()
    .prepare(
      `UPDATE roles SET
        name=@name, avatar=@avatar, persona=@persona, holding_pref=@holding_pref,
        personality=@personality, is_emotion_anchor=@is_emotion_anchor, style=@style,
        system_prompt=@system_prompt, disclaimer=@disclaimer, active=@active
       WHERE id=@id`
    )
    .run(normalizeIn(r));
  res.json(normalize(getDb().prepare('SELECT * FROM roles WHERE id=?').get(req.params.id)));
});

// DELETE /api/roles/:id —— 删除角色
router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM roles WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
