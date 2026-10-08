// src/db.js
// -----------------------------------------------------------------------------
// SQLite 封装：负责角色配置的持久化（增删改查的数据落盘）。
// 选用 better-sqlite3（同步 API，简单可靠），数据库文件位于 ./data/app.db。
// 首次启动时自动建表，并写入 roles.json 中的 8 个种子角色（仅当表为空）。
// -----------------------------------------------------------------------------
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 读取种子配置（roles.json 中真正使用的是 roles 数组）
const seed = require('./config/roles.json').roles;

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'app.db');

let db = null;

// 确保数据库与种子就绪（幂等，可重复调用）
function ensureDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // 写前日志，提升并发安全

  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      avatar            TEXT,
      persona           TEXT,
      holding_pref      TEXT,
      personality       TEXT,
      is_emotion_anchor INTEGER DEFAULT 0,
      style             TEXT,
      system_prompt     TEXT,
      disclaimer        TEXT,
      active            INTEGER DEFAULT 1
    )
  `);

  // 仅当表为空时灌入种子，避免覆盖用户后续编辑
  const count = db.prepare('SELECT COUNT(*) AS c FROM roles').get().c;
  if (count === 0) {
    const ins = db.prepare(`
      INSERT INTO roles
        (id,name,avatar,persona,holding_pref,personality,is_emotion_anchor,style,system_prompt,disclaimer,active)
      VALUES
        (@id,@name,@avatar,@persona,@holding_pref,@personality,@is_emotion_anchor,@style,@system_prompt,@disclaimer,@active)
    `);
    const tx = db.transaction(() => {
      seed.forEach((r) => ins.run(normalizeIn(r)));
    });
    tx();
  }
  return db;
}

function getDb() {
  if (!db) ensureDb();
  return db;
}

// 数据库行（INTEGER 0/1）→ JS 布尔，统一对外结构
function normalize(r) {
  if (!r) return r;
  return { ...r, is_emotion_anchor: !!r.is_emotion_anchor, active: !!r.active };
}

// JS 入参（布尔）→ 数据库 INTEGER
function normalizeIn(r) {
  return {
    ...r,
    is_emotion_anchor: r.is_emotion_anchor ? 1 : 0,
    active: r.active === false ? 0 : 1,
  };
}

module.exports = { ensureDb, getDb, normalize, normalizeIn };
