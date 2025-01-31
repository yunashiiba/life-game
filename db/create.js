const pool = require('./pool');

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    game integer NOT NULL,
    turn integer NOT NULL,
    location integer,
    money integer,
    family integer,
    work integer,
    treasure integer,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const createGamesTable = `
  CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    users json,
    map integer,
    turn integer,
    condition integer,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const createMapsTable = `
  CREATE TABLE IF NOT EXISTS maps (
    id SERIAL PRIMARY KEY,
    password VARCHAR(100),
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const createDatasTable = `
  CREATE TABLE IF NOT EXISTS datas (
    id SERIAL PRIMARY KEY,
    map integer,
    position double precision,
    title VARCHAR(5),
    content VARCHAR(100),
    option integer,
    option1 integer,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

// テーブル作成処理
async function createTables() {
  try {
    const client = await pool.connect();
    console.log('PostgreSQLに接続成功: テーブル作成中...');

    // usersテーブル作成
    await client.query(createUsersTable);
    console.log('usersテーブルが作成されました');
    
    await client.query(createGamesTable);
    console.log('gamesテーブルが作成されました');
    
    await client.query(createMapsTable);
    console.log('mapsテーブルが作成されました');
    
    await client.query(createDatasTable);
    console.log('datasテーブルが作成されました');

    client.release();
  } catch (err) {
    console.error('テーブル作成エラー:', err);
  }
}

module.exports = {
  createTables,
};


//-3：給料日
//-2：結婚
//-1：就職
//0：ノーマル
//1：自己完結お金
//2：右隣とお金
//3：宝
//4：子供
//5：子供がいたらお金