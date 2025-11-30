import axios from 'axios';
import { getDb } from './database.js';

// 从环境变量获取配置
const TARGET_ROOM_ID = process.env.ROOM_ID; 
const TARGET_ROOM_URL = process.env.ROOM_URL; // 新增：直接读取完整URL

// 备用基础配置 (仅当未提供 ROOM_URL 时使用)
const BASE_URL = "https://yktyd.ecust.edu.cn/epay/wxpage/wanxiao/eleresult";
const BASE_PARAMS = "sysid=1&areaid=3&buildid=20"; 

const headers = {
  "User-Agent": "Mozilla/5.0 (Linux; U; Android 4.1.2; zh-cn; Chitanda/Akari) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30 MicroMessenger/6.0.0.58_r884092.501 NetType/WIFI",
};
const regex = /(-?\d+(\.\d+)?)度/;

// --- 核心：抓取配置的房间 ---
export async function scrapeTargetRoom() {
  const roomId = process.env.ROOM_ID;

  if (!roomId) {
      console.error("❌ Error: ROOM_ID environment variable is not set. Cannot scrape.");
      return;
  }

  // 优先使用环境变量中的完整 URL，否则回退到旧的拼接逻辑
  const url = process.env.ROOM_URL || `${BASE_URL}?${BASE_PARAMS}&roomid=${roomId}`;
  
  try {
    console.log(`Scraping Room ${roomId}...`);
    console.log(`Target URL: ${url}`); // 打印 URL 方便调试

    const response = await axios.get(url, { headers, timeout: 10000 });
    const match = response.data.match(regex);

    if (match && match[1]) {
      const kwh = parseFloat(match[1]);
      const timestamp = new Date().toISOString();
      const db = await getDb();
      
      // 存入电量数据
      await db.run(
        "INSERT OR IGNORE INTO electricity (timestamp, room_id, kWh) VALUES (?, ?, ?)",
        timestamp,
        roomId,
        kwh
      );
      
      console.log(`✅ Success: Room ${roomId} - ${kwh} kWh`);
      return { success: true, kwh };
    } else {
      console.warn(`⚠️ Failed to parse data for Room ${roomId}. Response content snippet:`, response.data.substring(0, 100));
      return { success: false, error: 'Parse error' };
    }
  } catch (e) {
    console.error(`❌ Error scraping Room ${roomId}:`, e.message);
  }
}
