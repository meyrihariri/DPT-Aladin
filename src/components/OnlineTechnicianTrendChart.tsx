import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  Activity,
  Users,
  Clock,
  TrendingUp,
  RefreshCw,
  Filter,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { ServerData } from '../types';
import { StorageService } from '../services/storage';

interface TrendDataPoint {
  hour: string;
  hourNum: number;
  fullLabel: string;
  timestamp: number;
  onlineCount: number;
  technicians: string[];
  serverBreakdown: Record<string, number>;
}

interface TrendSummary {
  peakHour: string;
  peakCount: number;
  averageCount: number;
  currentOnline: number;
  totalActive24h: number;
}

interface OnlineTechnicianTrendChartProps {
  servers?: ServerData[];
  initialServerFilter?: string;
  isPjServer?: boolean;
  userServer?: ServerData | null;
  className?: string;
}

export const OnlineTechnicianTrendChart: React.FC<OnlineTechnicianTrendChartProps> = ({
  servers = [],
  initialServerFilter = 'all',
  isPjServer = false,
  userServer = null,
  className = ''
}) => {
  const [selectedServerId, setSelectedServerId] = useState<string>(
    isPjServer && userServer ? userServer.id : initialServerFilter
  );
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [summary, setSummary] = useState<TrendSummary>({
    peakHour: '00:00',
    peakCount: 0,
    averageCount: 0,
    currentOnline: 0,
    totalActive24h: 0
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Sync if initialServerFilter prop changes from parent
  useEffect(() => {
    if (!isPjServer && initialServerFilter) {
      setSelectedServerId(initialServerFilter);
    }
  }, [initialServerFilter, isPjServer]);

  const loadTrendData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const serverParam = isPjServer && userServer ? userServer.id : selectedServerId;
      const res = await StorageService.fetchHourlyPresenceTrend(serverParam);
      if (res && Array.isArray(res.trend)) {
        setData(res.trend);
        if (res.summary) {
          setSummary(res.summary);
        }
      }
      setLastRefreshedAt(new Date());
    } catch {
      // Silently retain current state on error
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isPjServer, userServer, selectedServerId]);

  useEffect(() => {
    loadTrendData();
    // Auto refresh every 60 seconds to keep live trends updated when tab is visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadTrendData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [loadTrendData]);

  const activeServerName = useMemo(() => {
    if (isPjServer && userServer) return userServer.namaServer;
    if (selectedServerId === 'all') return 'Semua Server';
    const match = servers.find(s => s.id === selectedServerId);
    return match?.namaServer || 'Server Terpilih';
  }, [selectedServerId, servers, isPjServer, userServer]);

  // Custom rich Tooltip for Recharts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point: TrendDataPoint = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs max-w-xs z-50">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 mb-2 gap-3">
            <span className="font-extrabold text-slate-200 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              {point.fullLabel} WIB
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40">
              {point.onlineCount} Teknisi
            </span>
          </div>

          {point.technicians.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Teknisi Aktif ({point.technicians.length}):
              </p>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                {point.technicians.map((name, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 text-slate-200 text-[10px] px-1.5 py-0.5 rounded font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="truncate max-w-[120px]">{name}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 italic">
              Tidak ada aktivitas teknisi pada jam ini.
            </p>
          )}

          {/* Server Breakdown */}
          {point.serverBreakdown && Object.keys(point.serverBreakdown).length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-slate-800 flex flex-wrap gap-1">
              {Object.entries(point.serverBreakdown).map(([srv, count]) => (
                <span key={srv} className="text-[9px] text-slate-400">
                  {srv}: <strong className="text-white">{count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-xs transition-all ${className}`}>
      {/* Chart Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-700 rounded-xl shrink-0 mt-0.5 shadow-2xs">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-slate-900 text-sm leading-snug">
                Tren Teknisi Online (24 Jam Terakhir)
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Real-time
              </span>
            </div>
          </div>
        </div>

        {/* Filter per Server & Refresh Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {!isPjServer && servers.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200/90 rounded-xl px-2 py-1 transition-colors">
              <Filter className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <select
                value={selectedServerId}
                onChange={e => setSelectedServerId(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent border-0 outline-hidden cursor-pointer pr-1 max-w-[150px] sm:max-w-[190px] truncate"
                title="Pilih server untuk melihat tren per lokasi"
                aria-label="Filter Server Tren Teknisi"
              >
                <option value="all">🌐 Semua Server</option>
                {servers.map(s => (
                  <option key={s.id} value={s.id}>
                    📍 {s.namaServer}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => loadTrendData(true)}
            disabled={isRefreshing || isLoading}
            className="p-1.5 rounded-xl border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:scale-95 transition-all shadow-2xs"
            title={`Perbarui data grafik (Terakhir: ${lastRefreshedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`}
            aria-label="Refresh Chart Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Mini Stat Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5">
        {/* Metric 1: Online Saat Ini */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2 flex items-center justify-between">
          <div>
            <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
              Online Saat Ini
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base sm:text-lg font-black text-slate-900">
                {summary.currentOnline}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Teknisi</span>
            </div>
          </div>
          <div className="p-1.5 bg-emerald-100/70 text-emerald-700 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 block animate-pulse" />
          </div>
        </div>

        {/* Metric 2: Jam Puncak (Peak) */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2 flex items-center justify-between">
          <div>
            <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
              Jam Tersibuk (Peak)
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base sm:text-lg font-black text-emerald-800">
                {summary.peakHour}
              </span>
              <span className="text-[10px] text-emerald-600 font-bold">
                ({summary.peakCount} Org)
              </span>
            </div>
          </div>
          <div className="p-1.5 bg-amber-100/70 text-amber-700 rounded-lg">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Metric 3: Rata-Rata per Jam */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2 flex items-center justify-between">
          <div>
            <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
              Rata-rata Online
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base sm:text-lg font-black text-slate-900">
                {summary.averageCount}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Org / Jam</span>
            </div>
          </div>
          <div className="p-1.5 bg-indigo-100/70 text-indigo-700 rounded-lg">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Metric 4: Total Teknisi Aktif (24 Jam) */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-2 flex items-center justify-between">
          <div>
            <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Aktif (24 Jam)
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base sm:text-lg font-black text-slate-900">
                {summary.totalActive24h}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Teknisi Unik</span>
            </div>
          </div>
          <div className="p-1.5 bg-emerald-100/70 text-emerald-700 rounded-lg">
            <Users className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Main Recharts Area Container */}
      <div className="w-full h-44 sm:h-48 mt-1">
        {isLoading && data.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <p className="text-xs font-semibold text-slate-500">Memuat tren kehadiran teknisi...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="emeraldOnlineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#10b981" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />

              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                domain={[0, (dataMax: number) => Math.max(dataMax + 1, 3)]}
              />

              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="onlineCount"
                name="Teknisi Online"
                stroke="#059669"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#emeraldOnlineGrad)"
                activeDot={{
                  r: 6,
                  fill: '#059669',
                  stroke: '#ffffff',
                  strokeWidth: 2.5
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart Footer Insight Note */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-500 gap-1.5">
        <div className="flex items-center space-x-1.5 text-slate-600">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            {summary.peakCount > 0 ? (
              <>
                Jam tersibuk hari ini tercatat pada pukul <strong>{summary.peakHour} WIB</strong> dengan{' '}
                <strong>{summary.peakCount} teknisi</strong> online bersamaan.
              </>
            ) : (
              'Grafik mencatat presensi, pengerjaan tugas, dan heartbeat aplikasi setiap jam dalam 24 jam terakhir.'
            )}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          Auto-update setiap 30 detik
        </span>
      </div>
    </div>
  );
};
