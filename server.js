import express from 'express';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase, getDb } from './database.js';
import { scrapeTargetRoom } from './scraper.js';

const app = express();
const port = process.env.PORT || 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 环境变量检查
if (!process.env.ROOM_ID) {
    console.warn("⚠️ WARNING: ROOM_ID is not set!");
}

app.use(express.json());
await initDatabase();

// --- 辅助函数：生成显示名称 ---
function getRoomDisplayName() {
    const roomId = process.env.ROOM_ID || 'Unset';
    const buildId = process.env.BUILD_ID;
    let partId = process.env.PART_ID; // 支持 "0", "1", "奉贤", "徐汇"

    if (!buildId || !partId) {
        return `Room ${roomId}`;
    }

    // 统一校区名称
    let campus = "";
    if (partId === '0' || partId === '奉贤') campus = "奉贤";
    else if (partId === '1' || partId === '徐汇') campus = "徐汇";
    else campus = partId; // 如果用户填了其他字符串，直接显示

    // 格式化楼栋名 (如果用户没填"号楼"且不是特殊名，看起来像数字，就补上"号楼")
    let buildDisplay = buildId;
    if (/^\d+$/.test(buildId)) {
        buildDisplay = `${buildId}号楼`;
    }

    // 最终格式：徐汇-18号楼-507
    return `${campus}-${buildDisplay}-${roomId}`;
}

// --- API 接口 ---
app.get('/api/config', (req, res) => {
    res.json({
        roomId: process.env.ROOM_ID || null,
        displayName: getRoomDisplayName(),
        version: 'Docker-v2.0-AutoBuild'
    });
});

app.get('/api/data', async (req, res) => {
  try {
    const db = await getDb();
    const targetRoom = process.env.ROOM_ID;
    
    let query = "SELECT * FROM electricity WHERE timestamp > datetime('now', '-30 days')";
    const params = [];
    
    if (targetRoom) {
        query += " AND room_id = ?";
        params.push(targetRoom);
    }
    
    query += " ORDER BY timestamp ASC";
    const results = await db.all(query, params);
    res.json(results);
  } catch (e) {
    console.error("Database error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexFile = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res.type('text/html');
      res.send('<h1>Nakiri Electricity</h1><p>Frontend building...</p>');
    }
  }
});

cron.schedule('0 * * * *', async () => {
  console.log(`[${new Date().toISOString()}] Cron job running...`);
  await scrapeTargetRoom();
});

app.listen(port, '0.0.0.0', async () => {
  console.log(`
  🚀 Nakiri Electricity is running!
  ---------------------------------------
  Port:    ${port}
  Room:    ${getRoomDisplayName()}
  ---------------------------------------
  `);
  
  if (process.env.ROOM_ID) {
      console.log('Initializing data scrape on startup...');
      await scrapeTargetRoom();
  }
});