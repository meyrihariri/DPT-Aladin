import { useEffect, useState, useCallback, useRef } from 'react';
import { showAppAlert } from './dialogService';

/**
 * Internet Connection Quality Status
 * - 'online': Normal connection (Green - INTERNET NORMAL)
 * - 'unstable': Weak / high latency connection (Orange - INTERNET TIDAK STABIL)
 * - 'offline': No connection / disconnected (Red - INTERNET TERPUTUS)
 */
export type NetworkQuality = 'online' | 'unstable' | 'offline';

export function isDeviceOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

let currentNetworkQuality: NetworkQuality = isDeviceOnline() ? 'online' : 'offline';
let lastAlertTimestamp = 0;
const ALERT_COOLDOWN_MS = 60000; // Show warning popup at most once per 60s to avoid spamming
const listeners = new Set<(quality: NetworkQuality, rtt: number | null) => void>();
let lastProbeTimestamp = 0;
let lastProbeCachedResult: { quality: NetworkQuality; rtt: number } = { quality: currentNetworkQuality, rtt: 50 };

/**
 * Triggers warning alert popup only when connection is completely offline
 */
function notifyUnstableOrOffline(quality: NetworkQuality, rtt?: number | null) {
  const now = Date.now();
  if (now - lastAlertTimestamp < ALERT_COOLDOWN_MS) {
    return;
  }

  // Do NOT show blocking modal popup for 'unstable' in background checks,
  // because normal latency fluctuations (e.g. 10Mbps cloud connection) should not block the user.
  // The UI status badge (InternetStatusBadge) already provides non-intrusive feedback.
  if (quality === 'offline') {
    lastAlertTimestamp = now;
    showAppAlert({
      title: '🔴 Peringatan: Koneksi Internet Terputus',
      message: 'Tidak ada koneksi internet terdeteksi. Dihimbau untuk TIDAK melakukan Absensi atau Menginput Data Pekerjaan sampai jaringan internet kembali normal.',
      type: 'error'
    });
  }
}

/**
 * Performs a fast, non-blocking network probe to detect connection health
 */
export async function probeNetworkQuality(timeoutMs = 4500, forceCheck = false): Promise<{ quality: NetworkQuality; rtt: number }> {
  // 1. Instant check via navigator.onLine
  if (!isDeviceOnline()) {
    currentNetworkQuality = 'offline';
    lastProbeCachedResult = { quality: 'offline', rtt: 0 };
    return lastProbeCachedResult;
  }

  // Throttle background health probes to avoid redundant requests during fast menu transitions
  const now = Date.now();
  if (!forceCheck && (now - lastProbeTimestamp < 8000) && lastProbeCachedResult.quality !== 'offline') {
    return lastProbeCachedResult;
  }
  lastProbeTimestamp = now;

  // 2. Probe server health endpoint
  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch('/api/health?_t=' + Date.now(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);

    const elapsed = performance.now() - startTime;

    if (res.ok) {
      // For cloud connections, latency under 3500ms with HTTP 200 is healthy and normal
      const q: NetworkQuality = elapsed > 3500 ? 'unstable' : 'online';
      currentNetworkQuality = q;
      lastProbeCachedResult = { quality: q, rtt: elapsed };
      return lastProbeCachedResult;
    }

    // Response received with server error status
    currentNetworkQuality = 'unstable';
    lastProbeCachedResult = { quality: 'unstable', rtt: elapsed };
    return lastProbeCachedResult;
  } catch (err: any) {
    const elapsed = performance.now() - startTime;
    if (!isDeviceOnline()) {
      currentNetworkQuality = 'offline';
      lastProbeCachedResult = { quality: 'offline', rtt: 0 };
      return lastProbeCachedResult;
    }
    // High latency / aborted or temporary blip
    currentNetworkQuality = 'unstable';
    lastProbeCachedResult = { quality: 'unstable', rtt: elapsed };
    return lastProbeCachedResult;
  }
}

/**
 * Legacy check helper for database operations
 */
export async function checkNetworkHealth(timeoutMs = 4000): Promise<{ ok: boolean; message?: string }> {
  const result = await probeNetworkQuality(timeoutMs);
  if (result.quality === 'offline') {
    return {
      ok: false,
      message: 'Jaringan internet terputus, data gagal di upload ke database'
    };
  }
  if (result.quality === 'unstable') {
    return {
      ok: true, // Still allow attempt but with caution
      message: 'Jaringan internet tidak stabil'
    };
  }
  return { ok: true };
}

/**
 * Global React Hook to monitor Internet status on-demand
 */
export function useNetworkStatus(options: { enableAlertPopup?: boolean; probeIntervalMs?: number } = {}) {
  const enableAlertPopup = options.enableAlertPopup ?? false;
  const [quality, setQuality] = useState<NetworkQuality>(currentNetworkQuality);
  const [rtt, setRtt] = useState<number | null>(null);
  const prevQualityRef = useRef<NetworkQuality>(currentNetworkQuality);

  const performCheck = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return currentNetworkQuality;
    }

    const res = await probeNetworkQuality(4500);
    currentNetworkQuality = res.quality;
    setQuality(prev => (prev !== res.quality ? res.quality : prev));
    setRtt(prev => {
      if (prev !== null && Math.abs((prev || 0) - res.rtt) < 25) return prev;
      return res.rtt;
    });

    if (enableAlertPopup && res.quality === 'offline') {
      if (prevQualityRef.current === 'online' || res.quality !== prevQualityRef.current) {
        notifyUnstableOrOffline(res.quality, res.rtt);
      }
    }
    prevQualityRef.current = res.quality;

    listeners.forEach(l => l(res.quality, res.rtt));
    return res.quality;
  }, [enableAlertPopup]);

  useEffect(() => {
    performCheck();

    const handleOnline = () => {
      performCheck();
    };

    const handleOffline = () => {
      currentNetworkQuality = 'offline';
      setQuality('offline');
      if (enableAlertPopup) {
        notifyUnstableOrOffline('offline');
      }
      prevQualityRef.current = 'offline';
      listeners.forEach(l => l('offline', 0));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [performCheck, enableAlertPopup]);

  return {
    status: quality,
    isOnline: quality === 'online',
    isUnstable: quality === 'unstable',
    isOffline: quality === 'offline',
    rtt,
    checkNow: performCheck
  };
}
