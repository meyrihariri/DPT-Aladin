/**
 * Photo Cache Service - In-memory and persistent local cache for base64 images
 * Ensures instant, offline-capable, and unbreakable previews for selfies, job proofs, and location photos.
 */

const PHOTO_CACHE_PREFIX = 'dpt_img_cache_';
const MEMORY_CACHE = new Map<string, string>();

export class PhotoCacheService {
  /**
   * Save a base64 photo to local cache indexed by its key (fileId, URL, or record ID)
   */
  static set(key: string | undefined | null, base64Data: string | undefined | null): void {
    if (!key || !base64Data || !base64Data.startsWith('data:image/')) return;
    const cleanKey = String(key).trim();
    if (!cleanKey) return;

    // Evict oldest entries to prevent memory bloat on low-RAM mobile devices
    if (MEMORY_CACHE.size > 250) {
      const firstKey = MEMORY_CACHE.keys().next().value;
      if (firstKey) MEMORY_CACHE.delete(firstKey);
    }

    // Cache in memory
    MEMORY_CACHE.set(cleanKey, base64Data);

    // Also extract fileId if it's a Drive URL so it can be retrieved by either URL or fileId
    const fileId = this.extractId(cleanKey);
    if (fileId && fileId !== cleanKey) {
      MEMORY_CACHE.set(fileId, base64Data);
    }
  }

  /**
   * Purge legacy photo cache from localStorage to prevent QuotaExceededError and keep app blazing fast
   */
  static purgeLegacyLocalStorageCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PHOTO_CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Retrieve cached base64 image by key or fileId
   */
  static get(key: string | undefined | null): string | null {
    if (!key) return null;
    const cleanKey = String(key).trim();
    if (!cleanKey) return null;

    // If key itself is already base64 data, return it directly
    if (cleanKey.startsWith('data:image/')) return cleanKey;

    // Check memory cache
    if (MEMORY_CACHE.has(cleanKey)) {
      return MEMORY_CACHE.get(cleanKey)!;
    }

    const fileId = this.extractId(cleanKey);
    if (fileId && MEMORY_CACHE.has(fileId)) {
      return MEMORY_CACHE.get(fileId)!;
    }

    // Check localStorage
    try {
      const storageKey = PHOTO_CACHE_PREFIX + (fileId || cleanKey).slice(-40);
      const val = localStorage.getItem(storageKey);
      if (val && val.startsWith('data:image/')) {
        MEMORY_CACHE.set(cleanKey, val);
        if (fileId) MEMORY_CACHE.set(fileId, val);
        return val;
      }
    } catch {
      // Ignore
    }

    return null;
  }

  /**
   * Helper to extract Google Drive file ID
   */
  private static extractId(str: string): string | null {
    if (!str || str.startsWith('data:image/')) return null;
    const match = str.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/) ||
                  str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/) ||
                  str.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
                  str.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (match && match[1]) return match[1];
    if (/^[a-zA-Z0-9_-]{25,45}$/.test(str)) return str;
    return null;
  }
}

// Auto purge bloated base64 images from localStorage on startup to prevent mobile QuotaExceededError
if (typeof window !== 'undefined') {
  try {
    PhotoCacheService.purgeLegacyLocalStorageCache();
  } catch {}
}
