import { PhotoCacheService } from '../services/photoCache';

/**
 * Helper utilities for formatting and resolving image URLs, especially Google Drive and base64 strings
 */

/**
 * Validates whether a photo URL or string is an actual viewable image (not '0', '-', empty, or placeholder)
 */
export function isValidPhotoUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const str = String(url).trim();
  if (!str) return false;
  if (str === '0' || str === '-' || str === '--') return false;
  const lower = str.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'none' || lower === 'tidak ada' || lower === 'belum ada') return false;
  
  // If it's a placeholder string like [Foto Masuk Tersimpan], check if local memory cache has base64
  if (str.startsWith('[') && str.endsWith(']')) {
    const cached = PhotoCacheService.get(str);
    return Boolean(cached && cached.startsWith('data:image/'));
  }

  if (str.startsWith('data:image/')) return true;
  if (str.startsWith('http://') || str.startsWith('https://')) return true;
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(str)) return true;

  return false;
}

/**
 * Sanitizes photo strings from database/Google Sheets.
 * Converts '0', '-', '--', 'null', 'undefined' to empty string.
 */
export function sanitizePhotoUrl(url: string | undefined | null): string {
  if (!url) return '';
  const str = String(url).trim();
  if (!str || str === '0' || str === '-' || str === '--') return '';
  const lower = str.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'none' || lower === 'tidak ada') return '';
  return str;
}

export function extractDriveFileId(url: string | undefined | null): string | null {
  if (!url) return null;
  const str = String(url).trim();
  if (!str || str === '0' || str.startsWith('data:image/')) return null;

  // Match /file/d/{id}/ or /file/d/{id}
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // Match lh3.googleusercontent.com/d/{id}
  const lh3Match = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  // Match ?id={id} or &id={id}
  const idQueryMatch = str.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (idQueryMatch && idQueryMatch[1]) return idQueryMatch[1];

  // Match /d/{id}
  const genericDMatch = str.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (genericDMatch && genericDMatch[1]) return genericDMatch[1];

  // Check if string is directly a raw Google Drive File ID (25 to 45 chars)
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(str)) {
    return str;
  }

  return null;
}

/**
 * Returns Google Drive Thumbnail CDN URL (lightweight, edge-cached, highly reliable)
 */
export function getDriveThumbnailUrl(fileId: string, size = 400): string {
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`;
}

/**
 * Returns Google UserContent LH3 CDN URL
 */
export function getDriveLh3Url(fileId: string): string {
  if (!fileId) return '';
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`;
}

/**
 * Returns a direct embeddable image URL with high reliability and ultra-fast loading for Google Drive & web links
 */
export function getDirectImageUrl(url: string | undefined | null, isThumbnail: boolean = false): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (trimmed === '0' || trimmed === '-' || !trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;

  // 1. Check local photo cache first (instant 0ms response & offline capable)
  const cached = PhotoCacheService.get(trimmed);
  if (cached) return cached;

  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    // Check cache with fileId
    const cachedById = PhotoCacheService.get(fileId);
    if (cachedById) return cachedById;

    // Default to server-side proxy endpoint with disk & RAM cache (same-origin, zero CORS/cookie blocks)
    return `/api/proxy/image?id=${encodeURIComponent(fileId)}`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Returns direct Google Drive download URL for client-side fallback
 */
export function getDriveDirectDownloadUrl(fileId: string): string {
  if (!fileId) return '';
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=view`;
}

/**
 * Returns fallback server proxy URL for high resilience against browser/cookie blocking
 */
export function getProxyImageUrl(
  url: string | undefined | null,
  options?: { refresh?: boolean; forceGas?: boolean }
): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (trimmed.startsWith('data:image/')) return trimmed;

  const queryParams: string[] = [];
  if (options?.refresh) queryParams.push('refresh=1');
  if (options?.forceGas) queryParams.push('gas=1');
  const queryStr = queryParams.length > 0 ? `&${queryParams.join('&')}` : '';

  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    return `/api/proxy/image?id=${encodeURIComponent(fileId)}${queryStr}`;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `/api/proxy/image?url=${encodeURIComponent(trimmed)}${queryStr}`;
  }
  return trimmed;
}

/**
 * Returns a direct web view URL to open in a new tab if image preview fails
 */
export function getDriveViewUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (trimmed.startsWith('data:image/')) return null;

  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return null;
}

/**
 * Resizes and center-crops an uploaded user profile image to a lightweight square JPEG base64 string
 * Stores cleanly in local browser storage without burdening quota (~25-40KB)
 */
export async function compressProfileImage(file: File | Blob, maxSize = 300, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = img.width;
          const height = img.height;

          // Square center-crop dimensions
          const minDim = Math.min(width, height);
          const startX = (width - minDim) / 2;
          const startY = (height - minDim) / 2;

          const targetDim = Math.min(minDim, maxSize);
          canvas.width = targetDim;
          canvas.height = targetDim;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(e.target?.result || ''));
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, targetDim, targetDim);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch {
          resolve(String(e.target?.result || ''));
        }
      };
      img.onerror = () => reject(new Error('Gagal memproses file gambar'));
      img.src = String(e.target?.result);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.readAsDataURL(file);
  });
}
