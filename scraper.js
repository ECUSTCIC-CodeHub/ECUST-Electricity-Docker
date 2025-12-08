import axios from 'axios';
import { getDb } from './database.js';

// --- 楼栋映射字典 (移植自你的 Python 代码) ---
const BUILDING_MAP = {
    "奉贤1号楼":"1", "奉贤2号楼":"2", "奉贤3号楼":"3", "奉贤4号楼":"4",
    "奉贤5号楼":"27", "奉贤6号楼":"28", "奉贤7号楼":"29", "奉贤8号楼":"30",
    "奉贤9号楼":"31", "奉贤10号楼":"32", "奉贤11号楼":"33", "奉贤12号楼":"34",
    "奉贤13号楼":"35", "奉贤14号楼":"36", "奉贤15号楼":"37", "奉贤16号楼":"38",
    "奉贤17号楼":"39", "奉贤18号楼":"40", "奉贤19号楼":"41", "奉贤20号楼":"42",
    "奉贤21号楼":"43", "奉贤22号楼":"44", "奉贤23号楼":"45", "奉贤24号楼":"46",
    "奉贤25号楼":"49", "奉贤26号楼":"50", "奉贤27号楼":"51", "奉贤28号楼":"52",
    "奉贤后勤职工宿舍":"55",
    "徐汇1号楼":"64", "徐汇2号楼":"47", "徐汇3号楼":"5", "徐汇4号楼":"6",
    "徐汇5号楼":"7", "徐汇6号楼":"8", "徐汇7号楼":"9", "徐汇8号楼":"10",
    "徐汇9号楼":"11", "徐汇10号楼":"12", "徐汇11号楼":"13", "徐汇12号楼":"14",
    "徐汇13号楼":"15", "徐汇14号楼":"16", "徐汇15号楼":"17", "徐汇16号楼":"18",
    "徐汇17号楼":"19", "徐汇18号楼":"20", "徐汇19号楼":"21", "徐汇20号楼":"22",
    "徐汇21号楼":"23", "徐汇22号楼":"24", "徐汇23号楼":"25", "徐汇24号楼":"26",
    "徐汇25号楼":"48",
    "徐汇晨园公寓":"53", "徐汇励志公寓":"54",
    "徐汇南区第一宿舍楼":"66", "徐汇南区第二宿舍楼":"65",
    "徐汇南区第三宿舍楼":"67", "徐汇南区4A宿舍楼":"68", "徐汇南区4B宿舍楼":"69"
};

const SPECIAL_NAMES = {
    "后勤职工": "后勤职工宿舍",
    "晨园": "晨园公寓",
    "励志": "励志公寓",
    "南区1": "南区第一宿舍楼", "南区2": "南区第二宿舍楼",
    "南区3": "南区第三宿舍楼", "南区4A": "南区4A宿舍楼", "南区4B": "南区4B宿舍楼"
};

// 基础配置
const BASE_URL = "https://yktyd.ecust.edu.cn/epay/wxpage/wanxiao/eleresult";
const headers = {
  "User-Agent": "Mozilla/5.0 (Linux; U; Android 4.1.2; zh-cn; Chitanda/Akari) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30 MicroMessenger/6.0.0.58_r884092.501 NetType/WIFI",
};
const regex = /(-?\d+(\.\d+)?)度/;

// --- 辅助函数：自动生成 URL ---
function autoGenerateUrl() {
    const roomId = process.env.ROOM_ID;
    let partId = process.env.PART_ID; // "0"/"奉贤" or "1"/"徐汇"
    const buildIdRaw = process.env.BUILD_ID; // "1", "南区4A"

    if (!roomId || !partId || !buildIdRaw) {
        console.warn("⚠️ 自动生成 URL 失败: 缺少 ROOM_ID, PART_ID 或 BUILD_ID");
        return null;
    }

    // 1. 规范化校区名称 & 确定 areaid
    // areaid: 奉贤=2, 徐汇=3
    let campusName = "";
    let areaId = "";
    
    if (partId === "0" || partId === "奉贤") {
        campusName = "奉贤";
        areaId = "2";
    } else if (partId === "1" || partId === "徐汇") {
        campusName = "徐汇";
        areaId = "3";
    } else {
        console.warn(`⚠️ 未知校区 PART_ID: ${partId}`);
        return null;
    }

    // 2. 匹配 buildid
    let matchedBuildId = null;
    
    // 尝试匹配特殊名称 (如 "南区1")
    if (SPECIAL_NAMES[buildIdRaw]) {
        const key = `${campusName}${SPECIAL_NAMES[buildIdRaw]}`;
        matchedBuildId = BUILDING_MAP[key];
    } 
    // 尝试匹配普通数字 (如 "1") -> "奉贤1号楼"
    else {
        const key = `${campusName}${buildIdRaw}号楼`;
        matchedBuildId = BUILDING_MAP[key];
        
        // 兜底：如果没匹配到，尝试直接拼接 (防止用户直接输入 "奉贤1号楼")
        if (!matchedBuildId) {
            const directKey = `${campusName}${buildIdRaw}`;
            matchedBuildId = BUILDING_MAP[directKey];
        }
    }

    if (!matchedBuildId) {
        console.error(`❌ 无法找到楼栋 ID: ${campusName} ${buildIdRaw} (尝试 key: ${campusName}${buildIdRaw}号楼)`);
        return null;
    }

    // 3. 生成 URL
    const finalUrl = `${BASE_URL}?sysid=1&roomid=${roomId}&areaid=${areaId}&buildid=${matchedBuildId}`;
    console.log(`✨ 自动生成 URL: [${campusName}${buildIdRaw}号楼-${roomId}] -> buildid=${matchedBuildId}`);
    return finalUrl;
}

// --- 核心：抓取 ---
export async function scrapeTargetRoom() {
  const roomId = process.env.ROOM_ID;

  if (!roomId) {
      console.error("❌ Error: ROOM_ID is not set.");
      return;
  }

  // 优先级：ROOM_URL > 自动生成 > 默认老逻辑(buildid=20)
  let url = process.env.ROOM_URL;
  
  if (!url) {
      url = autoGenerateUrl();
  }
  
  // 如果还是没有 URL，尝试最原始的默认值 (兼容旧配置)
  if (!url) {
      console.warn("⚠️ 使用默认兜底 URL (可能不准确，建议配置 BUILD_ID)");
      const defaultArea = (process.env.PART_ID === '1' || process.env.PART_ID === '徐汇') ? '3' : '3'; // 默认徐汇? 
      url = `${BASE_URL}?sysid=1&areaid=${defaultArea}&buildid=20&roomid=${roomId}`;
  }
  
  try {
    const response = await axios.get(url, { headers, timeout: 10000 });
    const match = response.data.match(regex);

    if (match && match[1]) {
      const kwh = parseFloat(match[1]);
      const timestamp = new Date().toISOString();
      const db = await getDb();
      
      await db.run(
        "INSERT OR IGNORE INTO electricity (timestamp, room_id, kWh) VALUES (?, ?, ?)",
        timestamp,
        roomId,
        kwh
      );
      
      console.log(`✅ Success: Room ${roomId} - ${kwh} kWh`);
      return { success: true, kwh };
    } else {
      console.warn(`⚠️ Failed to parse data. Response snippet:`, response.data.substring(0, 50));
      return { success: false, error: 'Parse error' };
    }
  } catch (e) {
    console.error(`❌ Error scraping:`, e.message);
  }
}