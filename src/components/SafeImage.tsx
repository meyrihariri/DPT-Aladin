import React, { useState, useEffect } from 'react';
import { ExternalLink, Cloud, Camera, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import {
  getDirectImageUrl,
  getProxyImageUrl,
  getDriveViewUrl,
  extractDriveFileId,
  getDriveDirectDownloadUrl,
  getDriveThumbnailUrl,
  getDriveLh3Url
} from '../utils/imageHelper';
import { PhotoCacheService } from '../services/photoCache';

interface SafeImageProps {
  src: string | undefined | null;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallbackText?: string;
  showOpenLink?: boolean;
  isThumbnail?: boolean;
  onClick?: () => void;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  containerClassName = '',
  fallbackText = 'Foto Bukti',
  showOpenLink = true,
  isThumbnail,
  onClick
}) => {
  const isSmallThumb = isThumbnail ?? (!showOpenLink);
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [attemptStage, setAttemptStage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!src || !src.trim()) {
      setCurrentSrc('');
      setHasError(true);
      setIsLoading(false);
      return;
    }

    const trimmed = src.trim();

    // Ignore invalid/empty database placeholder values
    if (trimmed === '0' || trimmed === '-' || trimmed === '--' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
      setCurrentSrc('');
      setHasError(true);
      setIsLoading(false);
      return;
    }

    // Check if placeholder string from Google Sheets sync
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const cached = PhotoCacheService.get(trimmed);
      if (cached && cached.startsWith('data:image/')) {
        setCurrentSrc(cached);
        setHasError(false);
        setIsLoading(false);
        return;
      }
      setCurrentSrc('');
      setHasError(true);
      setIsLoading(false);
      return;
    }

    // 1. Direct base64 - render immediately without network request
    if (trimmed.startsWith('data:image/')) {
      setCurrentSrc(trimmed);
      setHasError(false);
      setIsLoading(false);
      PhotoCacheService.set(trimmed, trimmed);
      return;
    }

    // 2. Local client cache check (0ms instant rendering)
    const cached = PhotoCacheService.get(trimmed);
    if (cached) {
      setCurrentSrc(cached);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    // 3. Fast direct URL (Google CDN thumbnail for thumbs or proxy with disk/memory cache)
    setHasError(false);
    setAttemptStage(0);
    setIsLoading(true);
    setCurrentSrc(getDirectImageUrl(trimmed, isSmallThumb));
  }, [src, isSmallThumb]);

  const handleImageError = () => {
    const fileId = extractDriveFileId(src);

    if (fileId) {
      if (attemptStage === 0) {
        // Stage 1: Try high-res Google Drive Thumbnail CDN
        setAttemptStage(1);
        setCurrentSrc(getDriveThumbnailUrl(fileId, isSmallThumb ? 320 : 1200));
      } else if (attemptStage === 1) {
        // Stage 2: Try Google usercontent lh3 endpoint
        setAttemptStage(2);
        setCurrentSrc(getDriveLh3Url(fileId));
      } else if (attemptStage === 2) {
        // Stage 3: Try server proxy with disk & memory cache
        setAttemptStage(3);
        setCurrentSrc(getProxyImageUrl(src, { refresh: true }));
      } else if (attemptStage === 3) {
        // Stage 4: Try direct usercontent download endpoint
        setAttemptStage(4);
        setCurrentSrc(getDriveDirectDownloadUrl(fileId));
      } else {
        // Exhausted all 5 layers
        setHasError(true);
        setIsLoading(false);
      }
    } else {
      if (attemptStage === 0 && src && (src.startsWith('http://') || src.startsWith('https://'))) {
        setAttemptStage(1);
        setCurrentSrc(getProxyImageUrl(src, { refresh: true }));
      } else {
        setHasError(true);
        setIsLoading(false);
      }
    }
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasError(false);
    setAttemptStage(0);
    setIsLoading(true);
    const fileId = extractDriveFileId(src);
    if (fileId) {
      setCurrentSrc(getDriveThumbnailUrl(fileId, 800));
    } else {
      setCurrentSrc(getProxyImageUrl(src, { refresh: true }));
    }
  };

  const driveViewUrl = getDriveViewUrl(src);
  const isCloudSyncedOnly = Boolean(
    src && (
      src.trim() === '[Foto Upload Tersimpan]' ||
      src.trim() === '[Foto Masuk Tersimpan]' ||
      src.trim() === '[Foto Pulang Tersimpan]' ||
      src.includes('[Foto Upload') ||
      src.includes('[Foto Masuk') ||
      src.includes('[Foto Pulang')
    )
  );

  if (hasError || !currentSrc) {
    if (isSmallThumb) {
      return (
        <div
          className={`bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 select-none ${containerClassName || className}`}
          title={fallbackText || alt}
          onClick={onClick}
        >
          {isCloudSyncedOnly ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
        </div>
      );
    }

    if (isCloudSyncedOnly) {
      return (
        <div
          className={`bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-4 text-center text-slate-300 space-y-2 select-none ${containerClassName || className}`}
          onClick={onClick}
        >
          <div className="w-10 h-10 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-slate-200 line-clamp-1 max-w-[90%]">
            {fallbackText || alt}
          </div>
          <p className="text-[10px] text-slate-400 max-w-[85%] leading-tight">
            Foto telah diverifikasi & tersimpan pada riwayat sinkronisasi server/cloud Google.
          </p>
        </div>
      );
    }

    return (
      <div
        className={`bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center justify-center p-4 text-center text-slate-300 space-y-2 select-none ${containerClassName || className}`}
      >
        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
          {driveViewUrl ? <Cloud className="w-5 h-5 text-indigo-400" /> : <Camera className="w-5 h-5" />}
        </div>
        <div className="text-xs font-semibold text-slate-200 line-clamp-1 max-w-[90%]">
          {fallbackText || alt}
        </div>
        <p className="text-[10px] text-slate-400 max-w-[85%] leading-tight">
          File tersimpan di Google Drive. Klik tombol di bawah untuk membuka atau memuat ulang foto.
        </p>
        <div className="flex items-center space-x-2 pt-1">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center space-x-1 text-[11px] font-bold text-slate-200 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 shadow-xs hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Muat Ulang</span>
          </button>
          {showOpenLink && driveViewUrl && (
            <a
              href={driveViewUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center space-x-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-500 shadow-sm transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <span>Buka di Drive</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName || ''}`}>
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        referrerPolicy="no-referrer"
        onLoad={() => {
          setIsLoading(false);
          if (src && currentSrc.startsWith('data:image/')) {
            PhotoCacheService.set(src, currentSrc);
          }
        }}
        onError={handleImageError}
        loading="lazy"
        onClick={onClick}
      />
      {isLoading && (
        <div className="absolute inset-0 bg-slate-100/70 animate-pulse flex items-center justify-center pointer-events-none">
          {!isSmallThumb && (
            <div className="bg-slate-900/80 text-white text-[11px] font-medium px-2.5 py-1 rounded-full shadow-xs flex items-center space-x-1.5 backdrop-blur-xs">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              <span>Memuat...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
