const express = require('express');
const app = express();
const dbCreate = require('./db/create'); // テーブル作成ロジックをインポート
const pool = require('./db/pool'); // PostgreSQL接続設定をインポート

const http = require('http'); // HTTPサーバーを作成
const { Server } = require('socket.io'); // socket.ioを追加

// サーバーとSocket.IOを関連付け
const server = http.createServer(app);
const io = new Server(server); // Socket.IOサーバー作成

// Cloud9ではポート8080を使用
const port = process.env.PORT || 8080;
const host = '0.0.0.0'; // Cloud9で正しいIPを指定

// EJSをテンプレートエンジンとして設定
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('assets'));

// データベース接続を確認
async function connectToDatabase() {
  try {
    const client = await pool.connect();
    console.log('PostgreSQLに接続成功');

    const res = await client.query('SELECT NOW()');
    console.log('現在の時刻:', res.rows[0]);

    client.release();
  } catch (err) {
    console.error('データベース接続エラー:', err);
    process.exit(1); // 致命的なエラー時にプロセスを終了
  }
}

// 初期化処理
async function init() {
  try {
    await connectToDatabase(); // データベース接続確認
    await dbCreate.createTables(); // テーブル作成
    console.log('初期化完了');
  } catch (err) {
    console.error('初期化エラー:', err);
    process.exit(1); // 致命的なエラー時にプロセスを終了
  }
}

// 初期化関数を呼び出す
init();

// ルート設定
const indexRoutes = require('./routes/index');
const createRoutes = require('./routes/create');
const gameRoutes = require('./routes/game');

app.use('/', indexRoutes); // メインルート
app.use('/create', createRoutes); // マップ作成
app.use('/game', gameRoutes); // ゲーム関連

// WebSocket接続処理
app.set('io', io);

io.on('connection', (socket) => {
  console.log('A user connected');

  // 切断時のログ
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// サーバー起動
server.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});
