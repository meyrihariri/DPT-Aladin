import React from 'react';
import { WifiOff } from 'lucide-react';
import { NetworkQuality } from '../utils/networkCheck';

interface InternetStatusBadgeProps {
  status: NetworkQuality;
  rtt?: number | null;
  onRefresh?: () => void;
  className?: string;
}

export const InternetStatusBadge: React.FC<InternetStatusBadgeProps> = ({
  status,
  rtt,
  onRefresh,
  className = ''
}) => {
  if (status === 'online') {
    return (
      <div
        onClick={onRefresh}
        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-2 shadow-xs transition-all uppercase tracking-wider select-none shrink-0 bg-emerald-600 text-white shadow-emerald-700/20 cursor-default ${className}`}
        title={`Koneksi internet normal & stabil${rtt ? ` (${Math.round(rtt)}ms)` : ''}`}
      >
        <svg
          className="w-4 h-4 text-white shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="16" width="3.5" height="5" rx="1" />
          <rect x="7.5" y="12" width="3.5" height="9" rx="1" />
          <rect x="13" y="8" width="3.5" height="13" rx="1" />
          <rect x="18.5" y="4" width="3.5" height="17" rx="1" />
        </svg>
        <span>INTERNET NORMAL</span>
      </div>
    );
  }

  if (status === 'unstable') {
    return (
      <div
        onClick={onRefresh}
        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-2 shadow-xs transition-all uppercase tracking-wider select-none shrink-0 bg-amber-500 text-white shadow-amber-600/20 animate-pulse cursor-pointer hover:bg-amber-600 ${className}`}
        title={`Koneksi internet lemah / tidak stabil${rtt ? ` (${Math.round(rtt)}ms)` : ''}. Mohon hindari melakukan absensi atau input data pekerjaan.`}
      >
        <svg
          className="w-4 h-4 text-white shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="16" width="3.5" height="5" rx="1" />
          <rect x="7.5" y="12" width="3.5" height="9" rx="1" />
          <rect x="13" y="8" width="3.5" height="13" rx="1" opacity="0.3" />
          <rect x="18.5" y="4" width="3.5" height="17" rx="1" opacity="0.3" />
        </svg>
        <span>INTERNET TIDAK STABIL</span>
      </div>
    );
  }

  return (
    <div
      onClick={onRefresh}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-2 shadow-xs transition-all uppercase tracking-wider select-none shrink-0 bg-rose-600 text-white shadow-rose-700/20 animate-pulse cursor-pointer hover:bg-rose-700 ${className}`}
      title="Koneksi internet terputus. Mohon hindari melakukan absensi atau input data pekerjaan."
    >
      <WifiOff className="w-4 h-4 text-white shrink-0" />
      <span>INTERNET TERPUTUS</span>
    </div>
  );
};
