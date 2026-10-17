import React, { useEffect, useState } from 'react';

interface MaroonLoadingOverlayProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  logoUrl?: string;
  companyName?: string;
  onDismiss?: () => void;
}

export const MaroonLoadingOverlay: React.FC<MaroonLoadingOverlayProps> = ({
  isOpen,
  title = 'Silahkan Tunggu...',
  message = 'Mengambil data dari Google Sheets...',
  logoUrl,
  companyName,
  onDismiss
}) => {
  const [showTimeoutFallback, setShowTimeoutFallback] = useState(false);

  useEffect(() => {
    let timer: any = null;
    if (isOpen) {
      setShowTimeoutFallback(false);
      // Jika loading lebih dari 10 detik (misal koneksi lambat), munculkan tombol lanjut
      timer = setTimeout(() => {
        setShowTimeoutFallback(true);
      }, 10000);
    } else {
      setShowTimeoutFallback(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-md animate-in fade-in duration-200 select-none"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Outer Card - Frosted Glass with Maroon Accent */}
      <div className="relative w-full max-w-sm rounded-3xl bg-slate-900/90 border border-white/15 p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(128,0,32,0.4)] text-center flex flex-col items-center justify-center overflow-hidden">
        {/* Subtle Ambient Maroon Glow behind circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-maroon-800/25 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Title */}
        <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight drop-shadow-sm mb-5">
          {title}
        </h3>

        {/* 2. Circular Spinner with Company Logo in the Center */}
        <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center my-1">
          {/* SVG Animated Spinning Arc & Track */}
          <svg
            className="absolute inset-0 w-full h-full animate-spin"
            style={{ animationDuration: '1.4s' }}
            viewBox="0 0 100 100"
          >
            <defs>
              <linearGradient id="maroonArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#800020" />
                <stop offset="60%" stopColor="#b91c1c" />
                <stop offset="100%" stopColor="#fb7185" />
              </linearGradient>
            </defs>

            {/* Subtle Circular Track (Thin translucent ring as in screenshot) */}
            <circle
              cx="50"
              cy="50"
              r="44"
              stroke="rgba(255, 255, 255, 0.16)"
              strokeWidth="2.5"
              fill="none"
            />

            {/* Glowing Accent Arc in Maroon Theme */}
            <circle
              cx="50"
              cy="50"
              r="44"
              stroke="url(#maroonArcGrad)"
              strokeWidth="3.5"
              strokeDasharray="80 200"
              strokeLinecap="round"
              fill="none"
            />
          </svg>

          {/* Inner Circle Badge with Company Logo */}
          <div className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-white shadow-xl flex items-center justify-center p-2.5 border-2 border-white/60 overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName || 'Logo Perusahaan'}
                className="w-full h-full object-contain pointer-events-none"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-maroon-800">
                <span className="font-black text-sm tracking-tighter">DPT</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">ALADIN</span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Five Animated Soundwave/Equalizer Bars (Pill shaped, maroon colors) */}
        <div className="flex items-center justify-center space-x-1.5 mt-5 mb-1 h-8">
          <span
            className="w-1.5 rounded-full bg-maroon-400 animate-wave-bar"
            style={{ height: '18px', animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 rounded-full bg-maroon-500 animate-wave-bar"
            style={{ height: '26px', animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 rounded-full bg-maroon-600 animate-wave-bar"
            style={{ height: '32px', animationDelay: '300ms' }}
          />
          <span
            className="w-1.5 rounded-full bg-maroon-500 animate-wave-bar"
            style={{ height: '24px', animationDelay: '450ms' }}
          />
          <span
            className="w-1.5 rounded-full bg-maroon-400 animate-wave-bar"
            style={{ height: '16px', animationDelay: '600ms' }}
          />
        </div>

        {/* Optional Subtitle / Message below loading animation */}
        {message && (
          <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xs line-clamp-2 mt-3">
            {message}
          </p>
        )}

        {/* 4. Safety Fallback: Dismiss button if internet is extremely slow */}
        {showTimeoutFallback && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-4 px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all cursor-pointer active:scale-95"
          >
            Lanjutkan ke Tampilan
          </button>
        )}
      </div>
    </div>
  );
};
