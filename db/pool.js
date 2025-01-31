require('dotenv').config();
const { Pool } = require('pg');

// PostgreSQL接続設定を.envファイルから取得
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// 接続時に検索パスを設定
pool.on('connect', (client) => {
  client.query('SET search_path TO dolphin_schema, public;')
    .then(() => console.log('スキーマ検索パスが設定されました'))
    .catch((err) => console.error('検索パス設定エラー:', err));
});

module.exports = pool;
