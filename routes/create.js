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

    res.render('create', { maps: result });
  } catch (err) {
    console.error('データ取得エラー:', err);
    res.status(500).send('Failed to fetch maps');
  }
});


router.post('/new', async (req, res) => {
  const { name, password } = req.body;
  try {
    const client = await pool.connect();
    const insertQuery = `
      INSERT INTO maps (name, password)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [name, password]);
    const map = result.rows[0].id;
    
    const title = ["大学", "就職する", "飲み会", "結婚する", "子供", "糞", "宝くじ", "子供", "結婚？"];
    const content = ["大学に進学する　5000円失う", "就職する", "飲み会で奢る　3000円右隣の人にあげる", "結婚する", "子供が生まれる", "犬の糞を踏む　3000円もらう", "宝くじに当たった　お宝「ロケット」をもらう", "双子が生まれる", "子供が結婚する　10000円子供がいたら失う"];
    const option = [1, -1, 2, -2, 4, 1, 3, 4, 5];
    const option1 = [-5000, 0, -3000, 0, 1, 3000, 2, 2, -10000];
    
    const datas = Array.from({ length: 9 }, (_, i) => [
      map, i + 1, title[i], content[i], option[i], option1[i]
    ]);
    
    const insertDataQuery = `
      INSERT INTO datas (map, position, title, content, option, option1)
      VALUES
      ${datas.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')}
      RETURNING *;
    `;
    const flattenedValues = datas.flat();
    await client.query(insertDataQuery, flattenedValues);
    client.release();
    
    res.redirect(`/create/main/${map}`);
  } catch (err) {
    console.error('ユーザー保存エラー:', err);
    res.status(500).send('Failed to save user');
  }
});


router.post('/mine', async (req, res) => {
  const { name , password } = req.body;
  try {
    const client = await pool.connect();
    const query = `
      SELECT id FROM maps
      WHERE name = $1 AND password = $2;
    `;
    const result = await client.query(query, [name, password]);
    client.release();
    if (result.rows.length > 0) {
      const mapId = result.rows[0].id;
      res.redirect(`/create/main/${mapId}`);
    } else {
      res.redirect('/create');
    }
  } catch (err) {
    console.error('データ検索エラー:', err);
    res.status(500).send('Failed to find the map');
  }
});


router.get('/main/:id', async (req, res) => {
  const { id } = req.params; // URLからidを取得
  
  try {
    const client = await pool.connect();
    
    const mapQuery = `
      SELECT * FROM maps
      WHERE id = $1;
    `;
    const mapResult = await client.query(mapQuery, [id]);

    if (mapResult.rows.length === 0) {
      client.release();
      return res.status(404).send('Map not found');
    }

    const map = mapResult.rows[0];
    
    const datas = await fetchMapData(client, id);
    client.release();
    
    res.render("create/main.ejs", { map: map, datas: datas });
  } catch (err) {
    console.error('Error retrieving map and datas:', err);
    res.status(500).send('Failed to retrieve map and datas');
  }
});


router.post('/update-map', async (req, res) => {
  const { mapId, newPosition, title, content ,option ,option1 } = req.body;
  try {
    const client = await pool.connect();
    
    const countQuery = `
      SELECT COUNT(*) FROM datas WHERE map = $1;
    `;
    const countResult = await client.query(countQuery, [mapId]);
    const tileCount = parseInt(countResult.rows[0].count, 10);

    if (tileCount >= 100) {
      return res.status(400).json({
        success: false,
        message: '1マップにつき最大100件のタイルが作成できます。',
      });
    }

    const insertQuery = `
      INSERT INTO datas (map, position, title, content, option, option1)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    await client.query(insertQuery, [mapId, newPosition, title, content, option, option1]);
    
    const datas = await fetchMapData(client, mapId);
    client.release();
    
    res.status(200).json({
      success: true,
      datas: datas,
    });
  } catch (err) {
    console.error('マップ更新エラー:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update map',
    });
  }
});


router.post('/update-map-delete', async (req, res) => {
  const { mapId, position } = req.body;
  try {
    const client = await pool.connect();
    
    if(position != 10){
      const deleteQuery = `
        DELETE FROM datas
        WHERE map = $1 AND position = $2;
      `;
      await client.query(deleteQuery, [mapId, position]);
    }
    
    const datas = await fetchMapData(client, mapId);
    client.release();
    
    res.status(200).json({
      success: true,
      datas: datas,
    });
  } catch (err) {
    console.error('マップ更新エラー:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update map',
    });
  }
});


module.exports = router;