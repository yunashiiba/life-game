const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const fetchMapData = async (client, mapId) => {
  const dataQuery = `
    SELECT id, title, content, option, position
    FROM datas
    WHERE map = $1
    ORDER BY position ASC;
  `;
  const dataResult = await client.query(dataQuery, [mapId]);
  return dataResult.rows.map(row => ({
    id: row.id,
    title: row.title,
    content: row.content,
    option: row.option,
    position: row.position
  }));
};


router.get('/', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM maps ORDER BY created_at DESC');
    client.release();

    res.render('game', { maps: result.rows });
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to fetch maps');
  }
});

router.post('/start', async (req, res) => {
  const { maps } = req.body;
  
  try {
    const client = await pool.connect();
    const insertQuery = `
      INSERT INTO games (map, condition, turn)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [parseInt(maps), 0, 1]);
    const game = result.rows[0].id;
    
    client.release();
    res.redirect(`/game/start/${game}`);
  } catch (err) {
    console.error('ユーザー保存エラー:', err);
    res.status(500).send('Failed to save user');
  }
});

router.get('/start/:id', async (req, res) => {
  const gameId = req.params.id;
  try {
    const client = await pool.connect();
    const userQuery = `SELECT id, name FROM users WHERE game = $1;`;
    const userResult = await client.query(userQuery, [gameId]);

    let usernames = [];
    if (userResult.rows.length > 0) {
      usernames = userResult.rows.map(row => row.name);
    }
    
    client.release();
    res.render('game/start', { mapid: gameId, users: usernames });
  } catch (err) {
    console.error('エラー:', err);
    res.status(500).send('Failed to save user');
  }
});

router.post('/starting/:id', async (req, res) => {
  const gameId = req.params.id;

  try {
    const client = await pool.connect();
    const userQuery = `SELECT id FROM users WHERE game = $1;`;
    const userResult = await client.query(userQuery, [gameId]);

    if (userResult.rows.length > 0) {
      const userIds = userResult.rows.map(row => row.id);
      
      const shuffledIds = userIds.sort(() => Math.random() - 0.5);

      // 各ユーザーの turn を設定
      for (let i = 0; i < shuffledIds.length; i++) {
        const updateTurnQuery = `
          UPDATE users SET turn = $1 WHERE id = $2;
        `;
        await client.query(updateTurnQuery, [i + 1, shuffledIds[i]]);
      }
      
      const updateQuery = `
        UPDATE games SET users = $1, condition = 1 WHERE id = $2;
      `;
      await client.query(updateQuery, [JSON.stringify(userIds), gameId]);
      client.release();

      // WebSocketを使って全クライアントに通知
      req.app.get('io').emit('game_start', { game: gameId, message: "ゲームがスタートしました！" });

      res.redirect(`/game/main/${gameId}`);
    } else {
      client.release();
      res.status(404).send('No users found for this game ID');
    }
  } catch (err) {
    console.error('ゲーム状態更新エラー:', err);
    res.status(500).send('Failed to update game condition');
  }
});

router.post('/in', async (req, res) => {
  const { id , name } = req.body;
  
  try {
    const client = await pool.connect();
    const checkQuery = `
      SELECT id FROM games WHERE id = ${id} AND condition = 0;
    `;
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      const newQuery = `
        INSERT INTO users (name, game, turn, money, location, family, treasure, work)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *;
      `;
      const result = await client.query(newQuery, [name, id, 0, 5000, 0, 1, 0, 0]);
      
      req.app.get('io').emit('game_in', { game: id, message: name + "が入室しました！" });
      
      client.release();
      res.redirect(`/game/user/${result.rows[0].id}`);
    }else{
      client.release();
      res.redirect(`/game`);
    }
  } catch (err) {
    console.error('エラー:', err);
    res.status(500).send('Failed to save user or check id');
  }
});

router.post('/user_cancel/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const client = await pool.connect();
    const checkQuery = `
      SELECT game FROM users WHERE id = $1;
    `;
    const { rows } = await client.query(checkQuery, [userId]);
    req.app.get('io').emit('game_in', { game: rows[0], message: "一人退室しました！" });
    
    const deleteQuery = `
      DELETE FROM users WHERE id = $1;
    `;
    await client.query(deleteQuery, [userId]);
    
    client.release();
    res.redirect("/game");
  } catch (err) {
    console.error('ユーザー削除エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

router.get('/main/:id', async (req, res) => {
  const { id } = req.params; // URLからidを取得
  
  try {
    const client = await pool.connect();
    
    const gameQuery = `SELECT * FROM games WHERE id = $1;`;
    const gameResult = await client.query(gameQuery, [id]);
    
    const userQuery = `SELECT * FROM users WHERE game = $1 ORDER BY turn ASC;`;
    const userResult = await client.query(userQuery, [id]);
    
    if (gameResult.rows.length === 0) {
      client.release();
      return res.status(404).send('Game not found');
    }
    
    let mapId = gameResult.rows[0].map;
    const mapQuery = `SELECT * FROM maps WHERE id = $1;`;
    const mapResult = await client.query(mapQuery, [mapId]);

    if (mapResult.rows.length === 0) {
      client.release();
      return res.status(404).send('Map not found');
    }

    const game = gameResult.rows[0];
    
    const datas = await fetchMapData(client, mapId);
    client.release();
    res.render("game/main.ejs", { game: game, datas: datas, users: userResult.rows });
  } catch (err) {
    console.error('エラー:', err);
    res.status(500).send('Failed to retrieve map and datas');
  }
});

router.get('/user/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const client = await pool.connect();
    const userResult = await client.query(
      `SELECT * FROM users WHERE id = $1;`, 
      [userId]
    );
    if (userResult.rows.length === 0) {
      client.release();
      return res.status(404).send('User not found');
    }
    const user = userResult.rows[0];
    const gameResult = await client.query(
      `SELECT * FROM games WHERE id = $1;`, [user.game]
    );
    client.release();
    if (gameResult.rows.length === 0) {
      return res.status(404).send('Game not found');
    }
    const game = gameResult.rows[0];
    res.render('game/user', { user: user, game: game });
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to fetch user or game data');
  }
});

router.post('/user-location', async (req, res) => {
  const { game, userId, location, roll, work } = req.body;
  try {
    const client = await pool.connect();
    req.app.get('io').emit('game_roll', { game: game, userId: userId, location: location, roll: roll, work: work });
    
    client.release();
    
    res.redirect(`/game/user/${userId}`);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

router.post('/user-move', async (req, res) => {
  const { userId, location, tile ,game, map, money } = req.body;
  try {
    const client = await pool.connect();
    await client.query('UPDATE users SET location = $1 , money = money + $2 WHERE id = $3', [location, money, userId]);
    
    const tileResult = await client.query(`SELECT * FROM datas WHERE map = $1 AND position = $2;`, [map, tile]);
    
    // Emit updated user location via socket
    req.app.get('io').emit('game_move', { game: game, tile: tileResult.rows[0], user: userId });

    client.release();
    
    res.redirect(`/game/main/${game}`);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

router.post('/user-action', async (req, res) => {
  const { game, user ,tile } = req.body;
  try {
    const client = await pool.connect();
    
    const { rows: users } = await client.query(
      'SELECT * FROM users WHERE game = $1 AND location != -1 ORDER BY turn ASC',[user.game]
    );
    const currentIndex = users.findIndex(u => u.id === user.id);
    let nextUser = users[currentIndex + 1] || users[0];
    
    if(tile.option == 1){
      await client.query('UPDATE users SET money = money + $1 WHERE id = $2', [tile.option1, user.id]);
    }else if(tile.option == 2){
      await client.query('UPDATE users SET money = money + $1 WHERE id = $2', [tile.option1, user.id]);
      await client.query('UPDATE users SET money = money - $1 WHERE id = $2', [tile.option1, nextUser.id]);
    }else if(tile.option == 3){
      await client.query(`UPDATE users SET treasure = treasure + $1 WHERE id = $2`,[tile.option1, user.id]);
    }else if(tile.option == 4){
      await client.query('UPDATE users SET family = family + $1 WHERE id = $2', [tile.option1, user.id]);
    }else if(tile.option == 5){
      if(user.family > 2){
        await client.query('UPDATE users SET money = money + $1 WHERE id = $2', [tile.option1, user.id]);
      }
    }
    
    await client.query('UPDATE games SET turn = $1 WHERE id = $2', [nextUser.turn, user.game]);
    req.app.get('io').emit('game_actioned', {game: game});
    client.release();
    
    res.redirect(`/game/user/${user.id}`);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

router.post('/user-action1', async (req, res) => {
  const { game, user ,job } = req.body;
  try {
    const client = await pool.connect();
    
    const { rows: users } = await client.query(
      'SELECT * FROM users WHERE game = $1 AND location != -1 ORDER BY turn ASC',[user.game]
    );
    const currentIndex = users.findIndex(u => u.id === user.id);
    let nextUser = users[currentIndex + 1] || users[0];
    
    await client.query('UPDATE users SET work = $1 WHERE id = $2', [job, user.id]);
    
    await client.query('UPDATE games SET turn = $1 WHERE id = $2', [nextUser.turn, user.game]);
    req.app.get('io').emit('game_actioned', {game: game});
    client.release();
    
    res.redirect(`/game/user/${user.id}`);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

router.post('/user-action2', async (req, res) => {
  const { game, user ,money } = req.body;
  try {
    const client = await pool.connect();
    
    const { rows: users } = await client.query(
      'SELECT * FROM users WHERE game = $1 AND location != -1 ORDER BY turn ASC',[user.game]
    );
    const currentIndex = users.findIndex(u => u.id === user.id);
    let nextUser = users[currentIndex + 1] || users[0];
    
    await client.query('UPDATE users SET money = money - $1 WHERE game = $2 AND location != -1', [money, user.game]);
    
    await client.query('UPDATE users SET money = money + $1 , family = 2 WHERE id = $2', [money * users.length, user.id]);
    
    await client.query('UPDATE games SET turn = $1 WHERE id = $2', [nextUser.turn, user.game]);
    req.app.get('io').emit('game_actioned', {game: game});
    client.release();
    
    res.redirect(`/game/user/${user.id}`);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

router.post('/user-goal', async (req, res) => {
  const { userId ,game } = req.body;
  try {
    const client = await pool.connect();
    const { rows: user } = await client.query('SELECT treasure FROM users WHERE id = $1',[userId]);
    let treasuremoney = user[0].treasure * 5000;
    await client.query('UPDATE users SET location = $1, money = money + $2 WHERE id = $3', [-1, 20000 + treasuremoney, userId]);
    
    const { rows: users } = await client.query(
      'SELECT * FROM users WHERE game = $1 AND location != -1 ORDER BY turn ASC',[game]
    );
    if(users.length == 0){
      await client.query('UPDATE games SET turn = $1, condition = $2 WHERE id = $3', [0, 2, game]);
    }else{
      const currentIndex = users.findIndex(u => u.id === userId);
      let nextUser = users[currentIndex + 1] || users[0];
      await client.query('UPDATE games SET turn = $1 WHERE id = $2', [nextUser.turn, game]);
    }
    
    req.app.get('io').emit('game_goal', {game: game, user: userId});

    client.release();
    
    res.redirect(`/game/main/${game}`);
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to delete user');
  }
});

module.exports = router;