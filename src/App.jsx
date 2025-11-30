import React, { useState, useEffect, useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format, subDays, subHours, differenceInDays, parseISO, startOfDay, isSameDay } from 'date-fns';
import { Moon, Sun, Zap, Activity, RefreshCw, TrendingDown, TrendingUp, BatteryCharging, Clock, CalendarClock, CalendarDays, History, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const TIME_RANGES = [
  { label: '24小时', days: 1 },
  { label: '3天', days: 3 },
  { label: '7天', days: 7 },
  { label: '30天', days: 30 },
];

// --- Components ---

const Card = ({ children, className }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={cn("bg-white dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden", className)}
  >
    {children}
  </motion.div>
);

const StatCard = ({ title, value, subtext, icon: Icon, delay, highlight, compact }) => (
  <motion.div 
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: delay * 0.1 }}
    className={cn(
      "flex flex-col rounded-xl border transition-all",
      compact ? "p-3" : "p-4", 
      highlight 
        ? "bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" 
        : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800/50"
    )}
  >
    <div className={cn("flex items-center justify-between", compact ? "mb-1.5" : "mb-2")}>
        <div className={cn("flex items-center gap-2", highlight ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 dark:text-zinc-400")}>
            <Icon size={compact ? 16 : 18} />
            <span className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{title}</span>
        </div>
    </div>
    <div className={cn("font-bold truncate", compact ? "text-xl" : "text-2xl", highlight ? "text-blue-700 dark:text-blue-300" : "text-zinc-900 dark:text-zinc-100")}>
      {value}
    </div>
    <div className={cn("truncate", compact ? "text-[10px] mt-0.5" : "text-xs mt-1", highlight ? "text-blue-500/70 dark:text-blue-400/70" : "text-zinc-400")}>
      {subtext}
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  // 改动 1: 初始化时检测系统主题偏好
  const [darkMode, setDarkMode] = useState(() => {
    // 如果浏览器支持 matchMedia，则检查系统是否是深色模式
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true; // 默认回退到深色
  });

  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState([]);
  
  const [targetRoom, setTargetRoom] = useState(null); // Auto-fetched from backend
  const [roomDisplayName, setRoomDisplayName] = useState('Loading...'); // Formatted Name
  const [timeRange, setTimeRange] = useState(7);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  // Initial Config & Data Fetch
  useEffect(() => {
      const init = async () => {
          setLoading(true);
          try {
              // 1. Get Config (including display name)
              const configRes = await fetch('/api/config');
              const config = await configRes.json();
              setTargetRoom(config.roomId);
              setRoomDisplayName(config.displayName || `Room ${config.roomId}`);

              // 2. Get Data
              const dataRes = await fetch('/api/data');
              const data = await dataRes.json();
              setRawData(data);
          } catch (e) {
              console.error("Init failed", e);
              setRoomDisplayName("Connection Error");
          } finally {
              setLoading(false);
          }
      };
      init();

      const interval = setInterval(async () => {
          try {
              const res = await fetch('/api/data');
              const data = await res.json();
              setRawData(data);
          } catch (e) { console.error(e); }
      }, 60000 * 5); 
      return () => clearInterval(interval);
  }, []);

  // 1. Prepare Chart Data
  const chartData = useMemo(() => {
    if (!rawData.length || !targetRoom) return [];

    const now = new Date();
    const cutoff = subDays(now, timeRange);
    const filtered = rawData.filter(d => new Date(d.timestamp) > cutoff);
    
    const groupedMap = new Map();
    filtered.forEach(item => {
      const dateObj = new Date(item.timestamp);
      const key = format(dateObj, "yyyy-MM-dd HH:mm");
      
      if (!groupedMap.has(key)) {
        groupedMap.set(key, { 
          timestamp: dateObj.getTime(), 
          displayTime: format(dateObj, "MM-dd HH:mm"),
          fullDate: dateObj,
          val: null
        });
      }
      if (String(item.room_id) === String(targetRoom)) {
          groupedMap.get(key).val = item.kWh;
      }
    });

    return Array.from(groupedMap.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .filter(d => d.val !== undefined);
  }, [rawData, timeRange, targetRoom]);

  // 2. Calculate Stats
  const stats = useMemo(() => {
    if (!rawData.length || !targetRoom) return null;
    
    const roomData = rawData
        .filter(d => String(d.room_id) === String(targetRoom))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (roomData.length === 0) return null;

    const now = new Date();
    const currentKWh = roomData[roomData.length - 1].kWh;

    const getConsumption = (sinceDate) => {
        const recent = roomData.filter(d => new Date(d.timestamp) >= sinceDate);
        let sum = 0;
        for (let i = 1; i < recent.length; i++) {
            const diff = recent[i-1].kWh - recent[i].kWh;
            if (diff > 0) sum += diff; 
        }
        return sum;
    };

    const threeHoursAgo = subHours(now, 3);
    const consumption3h = getConsumption(threeHoursAgo);

    const dailyMap = {};
    roomData.forEach(d => {
        const day = format(new Date(d.timestamp), 'yyyy-MM-dd');
        if (!dailyMap[day]) dailyMap[day] = [];
        dailyMap[day].push(d.kWh);
    });
    
    let maxDaily = { val: 0, date: '-' };
    let minDaily = { val: 9999, date: '-' };
    
    Object.entries(dailyMap).forEach(([date, values]) => {
        if (values.length < 2) return;
        let dailySum = 0;
        for(let i=0; i<values.length-1; i++) {
             if (values[i] > values[i+1]) dailySum += (values[i] - values[i+1]);
        }
        
        if (dailySum > 0.1) {
            if (dailySum > maxDaily.val) maxDaily = { val: dailySum, date: date.slice(5) };
            if (dailySum < minDaily.val) minDaily = { val: dailySum, date: date.slice(5) };
        }
    });
    if (minDaily.val === 9999) minDaily.val = 0;

    const consumption24h = getConsumption(subDays(now, 1));
    const consumption7d = getConsumption(subDays(now, 7));

    let lastRechargeTime = null;
    let lastRechargeAmount = 0;
    for (let i = roomData.length - 1; i > 0; i--) {
        const curr = roomData[i].kWh;
        const prev = roomData[i-1].kWh;
        if (curr > prev + 1.0) { 
            lastRechargeTime = roomData[i].timestamp;
            lastRechargeAmount = curr - prev;
            break;
        }
    }

    let daysRemaining = 0;
    const dailyAvg = consumption24h > 0.1 ? consumption24h : (consumption7d / 7 || 5);
    if (dailyAvg > 0) daysRemaining = currentKWh / dailyAvg;

    const daysSinceRecharge = lastRechargeTime 
        ? differenceInDays(now, new Date(lastRechargeTime)) 
        : '-';

    return {
        current: currentKWh.toFixed(1),
        cons3h: consumption3h.toFixed(2),
        maxDaily: maxDaily,
        minDaily: minDaily,
        cons24h: consumption24h.toFixed(2),
        cons7d: consumption7d.toFixed(2),
        lastRecharge: {
            date: lastRechargeTime ? format(new Date(lastRechargeTime), 'MM-dd') : '-',
            time: lastRechargeTime ? format(new Date(lastRechargeTime), 'HH:mm') : '',
            amount: lastRechargeAmount > 0 ? lastRechargeAmount.toFixed(0) : '-',
            daysAgo: daysSinceRecharge
        },
        estimateDays: daysRemaining.toFixed(1)
    };

  }, [rawData, targetRoom]);

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-red-500/30 transition-colors duration-300">
      
      <nav className="sticky top-0 z-50 backdrop-blur-lg border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/70 dark:bg-black/70">
        <div className="w-full px-6 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center text-white font-bold shadow-lg shadow-red-500/20">
              N
            </div>
            <h1 className="text-lg font-bold tracking-tight">Nakiri <span className="text-zinc-400 font-normal">Electricity</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 800); }}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-500"
              title="Refresh Data"
            >
              <RefreshCw size={20} className={cn(loading && "animate-spin")} />
            </button>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-500"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="w-full px-6 md:px-8 py-6 md:py-8">
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 md:gap-8">
          
          {/* Left Column */}
          <div className="xl:col-span-1 space-y-6">
            
            {/* 1. Room Info */}
            <section>
                <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                        <Home size={20} />
                    </div>
                    <div className="overflow-hidden">
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">当前监控房间</div>
                        <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate" title={roomDisplayName}>
                            {roomDisplayName}
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. Primary Stats */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">核心指标</h2>
              <div className="grid grid-cols-2 gap-3">
                {stats ? (
                  <>
                    <StatCard 
                        title="当前电量" 
                        value={`${stats.current} kWh`} 
                        subtext="实时剩余" 
                        icon={Zap} 
                        delay={1} 
                        highlight={true}
                    />
                    <StatCard 
                        title="近3小时消耗" 
                        value={`${stats.cons3h} kWh`} 
                        subtext="实时波动" 
                        icon={Activity} 
                        delay={2} 
                    />
                    <StatCard 
                        title="单日最大消耗" 
                        value={`${stats.maxDaily.val.toFixed(1)} kWh`} 
                        subtext={stats.maxDaily.date} 
                        icon={TrendingUp} 
                        delay={3} 
                    />
                    <StatCard 
                        title="单日最小消耗" 
                        value={`${stats.minDaily.val.toFixed(1)} kWh`} 
                        subtext={stats.minDaily.date} 
                        icon={TrendingDown} 
                        delay={4} 
                    />
                  </>
                ) : (
                    <div className="col-span-2 text-center text-zinc-500 py-8 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                        数据加载中...
                    </div>
                )}
              </div>
            </section>

            {/* 3. Time Range */}
            <section>
               <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">趋势范围</h2>
               <div className="bg-zinc-200 dark:bg-zinc-900 p-1 rounded-lg flex">
                 {TIME_RANGES.map(range => (
                   <button
                    key={range.days}
                    onClick={() => setTimeRange(range.days)}
                    className={cn(
                      "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                      timeRange === range.days 
                        ? "bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm" 
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    )}
                   >
                     {range.label}
                   </button>
                 ))}
               </div>
            </section>

            {/* 4. Detailed Analysis */}
            {stats && (
                <section className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">深度分析</h2>
                  
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <StatCard 
                        title="24h消耗" 
                        value={stats.cons24h} 
                        subtext="kWh" 
                        icon={Clock} 
                        delay={5}
                        compact={true} 
                    />
                    <StatCard 
                        title="上次充值" 
                        value={stats.lastRecharge.date} 
                        subtext={stats.lastRecharge.time}
                        icon={BatteryCharging} 
                        delay={6}
                        compact={true}
                    />
                    <StatCard 
                        title="预计可用" 
                        value={`${stats.estimateDays}`} 
                        subtext="天" 
                        icon={CalendarClock} 
                        delay={7}
                        compact={true}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <StatCard 
                        title="7天消耗" 
                        value={stats.cons7d} 
                        subtext="kWh" 
                        icon={CalendarDays} 
                        delay={8}
                        compact={true} 
                    />
                    <StatCard 
                        title="充值金额" 
                        value={stats.lastRecharge.amount} 
                        subtext="kWh (估算)"
                        icon={Zap} 
                        delay={9}
                        compact={true}
                    />
                    <StatCard 
                        title="距充值" 
                        value={stats.lastRecharge.daysAgo} 
                        subtext="天" 
                        icon={History} 
                        delay={10}
                        compact={true}
                    />
                  </div>
                </section>
            )}

          </div>

          <div className="xl:col-span-3 space-y-6">
            <Card className="p-6 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    电量趋势
                    <span className="text-sm font-normal text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                        {roomDisplayName}
                    </span>
                </h2>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  Live
                </div>
              </div>

              <div className="w-full h-[65vh] min-h-[500px]">
                {loading ? (
                  <div className="h-full w-full flex items-center justify-center text-zinc-400">
                    Loading data...
                  </div>
                ) : chartData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-zinc-400">
                    暂无数据
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradient-room" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#333" : "#eee"} vertical={false} />
                      <XAxis 
                        dataKey="displayTime" 
                        stroke={darkMode ? "#666" : "#999"} 
                        fontSize={12} 
                        tickMargin={10}
                        minTickGap={40}
                      />
                      <YAxis 
                        width={45}
                        stroke={darkMode ? "#666" : "#999"} 
                        fontSize={12} 
                        domain={['auto', 'auto']}
                        allowDataOverflow={false} 
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: darkMode ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                          borderColor: darkMode ? '#333' : '#eee',
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          backdropFilter: 'blur(8px)'
                        }}
                        itemStyle={{ fontSize: '12px', padding: '2px 0' }}
                        labelStyle={{ color: darkMode ? '#ccc' : '#666', marginBottom: '8px' }}
                      />
                       <Area 
                          type="monotone"
                          dataKey="val"
                          name="剩余电量"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#gradient-room)"
                          connectNulls={true}
                          isAnimationActive={true}
                          animationDuration={1500}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                       />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}