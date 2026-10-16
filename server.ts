import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';
import { parseParsedSheetsToState } from './src/services/googleSheetsHelper';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const DATA_DIR = path.join(process.cwd(), 'server_data');
const STATE_FILE = path.join(DATA_DIR, 'app_state.json');
const IMAGE_CACHE_DIR = path.join(DATA_DIR, 'image_cache');

// Ensure data and image cache directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

// In-memory cache for server state to eliminate continuous disk reads & JSON.parse on every heartbeat
let cachedServerState: any = null;
let lastStateMtime = 0;

// Helper to read server state
function readServerState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stats = fs.statSync(STATE_FILE);
      if (cachedServerState && stats.mtimeMs === lastStateMtime) {
        return cachedServerState;
      }
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      cachedServerState = JSON.parse(data);
      lastStateMtime = stats.mtimeMs;
      return cachedServerState;
    }
  } catch (err) {
    console.error('Error reading server state:', err);
  }
  return cachedServerState;
}

// Helper to write server state
function writeServerState(data: any) {
  try {
    cachedServerState = data;
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    try {
      const stats = fs.statSync(STATE_FILE);
      lastStateMtime = stats.mtimeMs;
    } catch {}
  } catch (err) {
    console.error('Error writing server state:', err);
  }
}

// Helper to fetch buffer supporting HTTP redirects
async function fetchBufferWithRedirects(urlStr: string, maxRedirects = 5): Promise<Buffer | null> {
  if (!urlStr || maxRedirects <= 0) return null;
  return new Promise((resolve) => {
    try {
      const client = urlStr.startsWith('https') ? https : http;
      client.get(urlStr, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchBufferWithRedirects(res.headers.location, maxRedirects - 1));
        }
        if (res.statusCode !== 200) {
          return resolve(null);
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

// Synchronizes and generates all PWA and desktop icons from the company logo
async function syncAppLogo(customLogoUrl?: string) {
  try {
    const state = readServerState();
    const logoUrl = customLogoUrl || state?.settings?.logoUrl;
    if (!logoUrl) return;

    const buffer = await fetchBufferWithRedirects(logoUrl);
    if (!buffer || buffer.length === 0) return;

    const publicDir = path.join(process.cwd(), 'public');

    // 512x512 PNG
    await sharp(buffer)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, 'pwa-512x512.png'));

    // 192x192 PNG
    await sharp(buffer)
      .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, 'pwa-192x192.png'));

    // Maskable 512x512 PNG
    await sharp(buffer)
      .resize(410, 410, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .extend({
        top: 51,
        bottom: 51,
        left: 51,
        right: 51,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

    // Apple touch icon 180x180
    await sharp(buffer)
      .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, 'apple-touch-icon.png'));

    // SVG icon with embedded base64 image
    const b64 = buffer.toString('base64');
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image href="data:image/jpeg;base64,${b64}" width="512" height="512" preserveAspectRatio="xMidYMid meet" />
</svg>`;
    fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');
  } catch (err) {
    console.warn('Error syncing app logo:', err);
  }
}

// Background sync on startup
syncAppLogo().catch(() => {});

// API Routes
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dynamic App Icon & Logo Endpoint for PWA & Home Screen
async function serveAppLogo(req: express.Request, res: express.Response, fallbackPath: string) {
  const filePath = path.join(process.cwd(), 'public', fallbackPath);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', fallbackPath.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  }
  res.status(404).send('Icon not found');
}

app.get('/api/app-icon.png', (req, res) => serveAppLogo(req, res, 'pwa-512x512.png'));
app.get('/pwa-192x192.png', (req, res) => serveAppLogo(req, res, 'pwa-192x192.png'));
app.get('/pwa-512x512.png', (req, res) => serveAppLogo(req, res, 'pwa-512x512.png'));
app.get('/pwa-maskable-512x512.png', (req, res) => serveAppLogo(req, res, 'pwa-maskable-512x512.png'));
app.get('/apple-touch-icon.png', (req, res) => serveAppLogo(req, res, 'apple-touch-icon.png'));
app.get('/apple-touch-icon-precomposed.png', (req, res) => serveAppLogo(req, res, 'apple-touch-icon.png'));
app.get('/desktop-screenshot.png', (req, res) => serveAppLogo(req, res, 'desktop-screenshot.png'));
app.get('/mobile-screenshot.png', (req, res) => serveAppLogo(req, res, 'mobile-screenshot.png'));

// Dynamic Web App Manifest
const serveManifest = (req: express.Request, res: express.Response) => {
  const appName = 'DPT-AlaDin - Manajemen Pekerjaan & Honor Teknisi';
  const shortName = 'DPT-AlaDin';
  
  const manifest = {
    id: '/',
    short_name: shortName,
    name: appName,
    description: 'Aplikasi Manajemen Pekerjaan & Honor Teknisi RT/RW Net',
    icons: [
      {
        src: '/pwa-512x512.png',
        type: 'image/png',
        sizes: '512x512',
        purpose: 'any'
      },
      {
        src: '/pwa-192x192.png',
        type: 'image/png',
        sizes: '192x192',
        purpose: 'any'
      },
      {
        src: '/pwa-maskable-512x512.png',
        type: 'image/png',
        sizes: '512x512',
        purpose: 'maskable'
      },
      {
        src: '/icon.svg',
        type: 'image/svg+xml',
        sizes: 'any'
      }
    ],
    screenshots: [
      {
        src: '/desktop-screenshot.png',
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide',
        label: 'DPT AlaDin Desktop Dashboard'
      },
      {
        src: '/mobile-screenshot.png',
        sizes: '640x1136',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'DPT AlaDin Mobile Teknisi'
      }
    ],
    shortcuts: [
      {
        name: 'Dashboard Utama',
        short_name: 'Dashboard',
        description: 'Buka Dashboard Pemantauan Presensi dan Pekerjaan',
        url: '/',
        icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
      },
      {
        name: 'Approval Presensi',
        short_name: 'Presensi',
        description: 'Buka Approval Presensi Teknisi Harian',
        url: '/?tab=approval',
        icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
      },
      {
        name: 'Daftar Pekerjaan',
        short_name: 'Pekerjaan',
        description: 'Buka Manajemen Daftar Pekerjaan Teknisi',
        url: '/?tab=pekerjaan',
        icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
      },
      {
        name: 'Rekap Honor & Slip',
        short_name: 'Rekap Honor',
        description: 'Buka Rekapitulasi Honor & Cetak Slip Gaji',
        url: '/?tab=rekap',
        icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }]
      }
    ],
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    background_color: '#0F172A',
    theme_color: '#800020',
    categories: ['business', 'productivity', 'utilities']
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.json(manifest);
};

app.get('/manifest.json', serveManifest);
app.get('/manifest.webmanifest', serveManifest);

// Dedicated Service Worker Endpoint
app.get('/sw.js', (req, res) => {
  const swFile = path.join(process.cwd(), 'public', 'sw.js');
  if (fs.existsSync(swFile)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(swFile);
  }
  res.status(404).send('Service Worker not found');
});

// GET /api/bootstrap - Return shared settings and latest cached state
app.get('/api/bootstrap', (req, res) => {
  const state = readServerState();
  res.json({
    success: true,
    data: state || {}
  });
});

// Helper to merge attendance records without ever destroying existing jamPulang or photos
function mergeServerAttendanceLists(existingList: any[] = [], incomingList: any[] = []): any[] {
  if (!Array.isArray(existingList) || existingList.length === 0) return incomingList || [];
  if (!Array.isArray(incomingList) || incomingList.length === 0) return existingList || [];

  const map = new Map<string, any>();
  const getRecordKey = (item: any) => {
    let tgl = '';
    const rawTgl = String(item.tanggal || '').trim();
    if (rawTgl) {
      if (/^\d{4}-\d{2}-\d{2}/.test(rawTgl)) {
        tgl = rawTgl.slice(0, 10);
      } else {
        const dmyMatch = rawTgl.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmyMatch) {
          tgl = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
        } else {
          tgl = rawTgl.slice(0, 10);
        }
      }
    }
    const techKey = (item.teknisiNama || item.teknisiId || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    return `${tgl}_${techKey}`;
  };

  // 1. Seed with existing server records
  for (const item of existingList) {
    if (!item || !item.id) continue;
    const key = getRecordKey(item) || item.id;
    map.set(key, { ...item });
  }

  // 2. Merge incoming records preserving clock-out data
  for (const incoming of incomingList) {
    if (!incoming || !incoming.id) continue;
    const key = getRecordKey(incoming) || incoming.id;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...incoming });
    } else {
      const hasExistingPulang = Boolean(existing.jamPulang && existing.jamPulang !== '-' && String(existing.jamPulang).trim().length > 0);
      const hasIncomingPulang = Boolean(incoming.jamPulang && incoming.jamPulang !== '-' && String(incoming.jamPulang).trim().length > 0);

      // CRITICAL: NEVER destroy existing jamPulang if incoming is empty/missing
      const finalJamPulang = hasIncomingPulang
        ? incoming.jamPulang
        : (hasExistingPulang ? existing.jamPulang : undefined);

      const finalFotoPulang = (incoming.fotoPulangUrl && incoming.fotoPulangUrl !== '-')
        ? incoming.fotoPulangUrl
        : (hasExistingPulang ? existing.fotoPulangUrl : '');
      const finalKetPulang = incoming.keteranganPulang || (hasExistingPulang ? existing.keteranganPulang : '');

      const hasExistingMasuk = Boolean(existing.jamMasuk && existing.jamMasuk !== '-' && String(existing.jamMasuk).trim().length > 0);
      const hasIncomingMasuk = Boolean(incoming.jamMasuk && incoming.jamMasuk !== '-' && String(incoming.jamMasuk).trim().length > 0);
      const finalJamMasuk = hasIncomingMasuk ? incoming.jamMasuk : (hasExistingMasuk ? existing.jamMasuk : '08:00');
      const finalFotoMasuk = incoming.fotoProofUrl || existing.fotoProofUrl || '';

      // An attendance record is considered approved if either existing or incoming was approved, is manual, or has Hadir status without pending flag
      const isExplicitlyApproved = 
        incoming.isApproved === true || 
        existing.isApproved === true ||
        incoming.isManual === true ||
        existing.isManual === true ||
        incoming.id?.startsWith('att-manual-') ||
        existing.id?.startsWith('att-manual-') ||
        incoming.keterangan?.includes('[Absen Manual Admin]') ||
        existing.keterangan?.includes('[Absen Manual Admin]') ||
        incoming.keteranganPulang?.toLowerCase().includes('manual') ||
        existing.keteranganPulang?.toLowerCase().includes('manual') ||
        incoming.keteranganPulang?.toLowerCase().includes('admin') ||
        existing.keteranganPulang?.toLowerCase().includes('admin') ||
        (incoming.status === 'Hadir' && incoming.needsApproval === false) ||
        (existing.status === 'Hadir' && existing.needsApproval === false) ||
        (incoming.status === 'Hadir' && !incoming.needsApproval && incoming.status !== 'Pending Approval') ||
        (existing.status === 'Hadir' && !existing.needsApproval && existing.status !== 'Pending Approval');

      const isExplicitlyRejected = incoming.status === 'Ditolak' || existing.status === 'Ditolak';

      let isPending = false;
      let finalStatus = 'Hadir';

      if (isExplicitlyRejected) {
        finalStatus = 'Ditolak';
        isPending = false;
      } else if (isExplicitlyApproved) {
        finalStatus = 'Hadir';
        isPending = false;
      } else {
        isPending = Boolean(
          incoming.needsApproval || 
          existing.needsApproval || 
          incoming.status === 'Pending Approval' || 
          existing.status === 'Pending Approval'
        );
        finalStatus = isPending ? 'Pending Approval' : (incoming.status || existing.status || 'Hadir');
      }

      const merged = {
        ...existing,
        ...incoming,
        id: existing.id || incoming.id,
        jamMasuk: finalJamMasuk,
        fotoProofUrl: finalFotoMasuk,
        jamPulang: finalJamPulang,
        fotoPulangUrl: finalFotoPulang,
        keteranganPulang: finalKetPulang,
        isApproved: isExplicitlyApproved && !isExplicitlyRejected,
        needsApproval: isPending,
        status: finalStatus,
        potonganOtomatis: isExplicitlyApproved ? 0 : (isExplicitlyRejected ? 25000 : (incoming.potonganOtomatis !== undefined ? incoming.potonganOtomatis : (existing.potonganOtomatis || 0)))
      };
      map.set(key, merged);
    }
  }

  return Array.from(map.values());
}

// POST /api/sync/state - Save latest application state from any client (PC Admin or HP)
app.post('/api/sync/state', (req, res) => {
  try {
    const currentState = readServerState() || {};
    const incoming = req.body || {};

    let mergedAttendanceList = currentState.attendanceList || [];
    if (incoming.attendanceList !== undefined) {
      mergedAttendanceList = mergeServerAttendanceLists(currentState.attendanceList, incoming.attendanceList);
    }

    // Merge resolvedAttendanceKeys set across all clients
    const existingResolved = new Set(currentState.resolvedAttendanceKeys || []);
    if (Array.isArray(incoming.resolvedAttendanceKeys)) {
      incoming.resolvedAttendanceKeys.forEach((k: string) => {
        if (k && typeof k === 'string') existingResolved.add(k.trim().toLowerCase());
      });
    }

    // Merge deletedAttendanceIds set across all clients
    const existingDeleted = new Set(currentState.deletedAttendanceIds || []);
    if (Array.isArray(incoming.deletedAttendanceIds)) {
      incoming.deletedAttendanceIds.forEach((id: string) => {
        if (id && typeof id === 'string') existingDeleted.add(id.trim());
      });
    }

    if (existingDeleted.size > 0) {
      mergedAttendanceList = mergedAttendanceList.filter((a: any) => !existingDeleted.has(a.id));
    }

    // Merge approvedLemburMap across all clients
    const mergedLemburMap = {
      ...(currentState.approvedLemburMap || {}),
      ...(incoming.approvedLemburMap || {})
    };

    const updatedState = {
      ...currentState,
      ...incoming,
      attendanceList: mergedAttendanceList,
      resolvedAttendanceKeys: Array.from(existingResolved),
      deletedAttendanceIds: Array.from(existingDeleted),
      approvedLemburMap: mergedLemburMap,
      settings: {
        ...(currentState.settings || {}),
        ...(incoming.settings || {})
      },
      lastUpdated: new Date().toISOString()
    };

    writeServerState(updatedState);
    res.json({ success: true, message: 'State synced successfully', data: updatedState });
  } catch (err: any) {
    console.error('Failed to sync state:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/attendance/update - Explicitly update single attendance record (e.g. set jamPulang)
app.post('/api/attendance/update', (req, res) => {
  try {
    const currentState = readServerState() || {};
    const incomingRecord = req.body || {};
    if (!incomingRecord.id && (!incomingRecord.tanggal || !incomingRecord.teknisiId)) {
      return res.status(400).json({ success: false, error: 'Missing record identification' });
    }

    const list = currentState.attendanceList || [];
    const tgl = (incomingRecord.tanggal || '').slice(0, 10);
    const techKey = (incomingRecord.teknisiNama || incomingRecord.teknisiId || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    const idx = list.findIndex((a: any) => {
      if (incomingRecord.id && a.id === incomingRecord.id) return true;
      const aTgl = (a.tanggal || '').slice(0, 10);
      const aTechKey = (a.teknisiNama || a.teknisiId || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      return aTgl === tgl && aTechKey === techKey;
    });

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...incomingRecord };
    } else {
      list.push(incomingRecord);
    }

    const updatedState = {
      ...currentState,
      attendanceList: list,
      lastUpdated: new Date().toISOString()
    };
    writeServerState(updatedState);
    res.json({ success: true, message: 'Attendance record updated successfully', record: idx >= 0 ? list[idx] : incomingRecord });
  } catch (err: any) {
    console.error('Failed to update attendance record:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings - Update global settings (e.g. Google Apps Script URL)
app.post('/api/settings', (req, res) => {
  try {
    const currentState = readServerState() || {};
    const newSettings = req.body || {};

    const updatedState = {
      ...currentState,
      settings: {
        ...(currentState.settings || {}),
        ...newSettings
      },
      lastUpdated: new Date().toISOString()
    };

    writeServerState(updatedState);

    // If logoUrl was updated, trigger background icon re-generation
    if (newSettings.logoUrl && newSettings.logoUrl !== currentState?.settings?.logoUrl) {
      syncAppLogo(newSettings.logoUrl).catch(() => {});
    }

    res.json({ success: true, settings: updatedState.settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sync/sheets - Server-side proxy to sync payload to Google Apps Script reliably (bypasses browser CORS & redirects)
app.post('/api/sync/sheets', async (req, res) => {
  try {
    const { scriptUrl, payload } = req.body || {};
    const url = scriptUrl || readServerState()?.settings?.googleAppsScriptUrl;
    if (!url || !url.trim()) {
      return res.status(400).json({ success: false, message: 'Google Apps Script URL is required' });
    }

    const cleanUrl = url.trim();
    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Invalidate proxy cache so next read immediately sees the updated data
    GAS_PROXY_CACHE.clear();

    res.json({ success: true, data });
  } catch (err: any) {
    console.error('Proxy to Google Apps Script failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// In-memory proxy cache for fast responses from Google Apps Script
interface GasProxyCache {
  data: any;
  timestamp: number;
}
const GAS_PROXY_CACHE = new Map<string, GasProxyCache>();
const GAS_CACHE_DURATION_MS = 25000; // 25 seconds fast cache

// GET /api/proxy/sheets - Server-side proxy to fetch data from Google Apps Script reliably & swiftly
app.get('/api/proxy/sheets', async (req, res) => {
  try {
    const scriptUrl = (req.query.url as string) || readServerState()?.settings?.googleAppsScriptUrl;
    const action = (req.query.action as string) || 'getAllData';
    const sheet = req.query.sheet as string;
    const isForced = req.query.force === 'true' || req.query.nocache === 'true';

    if (!scriptUrl || !scriptUrl.trim()) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const cacheKey = `${scriptUrl.trim()}?action=${action}&sheet=${sheet || ''}`;
    const now = Date.now();

    // Return instant cached response if valid (< 25s old) and not forced
    if (!isForced && GAS_PROXY_CACHE.has(cacheKey)) {
      const cached = GAS_PROXY_CACHE.get(cacheKey)!;
      if (now - cached.timestamp < GAS_CACHE_DURATION_MS) {
        return res.json(cached.data);
      }
    }

    let targetUrl = `${scriptUrl.trim()}?action=${encodeURIComponent(action)}`;
    if (sheet) {
      targetUrl += `&sheet=${encodeURIComponent(sheet)}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(targetUrl, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timeout);

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ success: false, error: 'Respons dari Google Apps Script bukan JSON valid' });
    }

    if (data && data.status === 'success') {
      GAS_PROXY_CACHE.set(cacheKey, { data, timestamp: now });
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to pull full database from Google Sheets and update app_state.json directly
async function syncServerStateFromGoogleSheets(customUrl?: string): Promise<boolean> {
  try {
    const currentState = readServerState() || {};
    const scriptUrl = (customUrl || currentState?.settings?.googleAppsScriptUrl || '').trim();
    if (!scriptUrl) return false;

    const gasUrl = `${scriptUrl}?action=getAllData`;
    const res = await fetch(gasUrl, { redirect: 'follow' });
    if (!res.ok) return false;
    const json = await res.json();
    if (!json || !json.data) return false;

    const parsed = parseParsedSheetsToState(json.data || json);
    const mergedAttendance = mergeServerAttendanceLists(currentState.attendanceList, parsed.attendanceList);
    const updatedState = {
      ...currentState,
      ...parsed,
      attendanceList: mergedAttendance,
      lastUpdated: new Date().toISOString()
    };
    writeServerState(updatedState);
    console.log('[Server State Sync] Successfully refreshed server state from Google Sheets. Jobs count:', updatedState.jobs?.length);
    return true;
  } catch (err: any) {
    console.warn('[Server State Sync] Failed to refresh from Google Sheets:', err.message);
    return false;
  }
}

// POST /api/pull/sheets - Trigger an immediate pull from Google Sheets to server cache
app.post('/api/pull/sheets', async (req, res) => {
  try {
    const { scriptUrl } = req.body || {};
    const success = await syncServerStateFromGoogleSheets(scriptUrl);
    const state = readServerState() || {};
    res.json({ success, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// In-memory cache for proxied images
const IMAGE_CACHE = new Map<string, { buffer: Buffer; contentType: string; timestamp: number }>();

// Helper to get safe cache filename
function getDiskCachePath(key: string): string {
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return path.join(IMAGE_CACHE_DIR, `${safeName}.bin`);
}

// Self-healing function for bit-shifted or truncated JPEG buffers
function repairJpegBuffer(buf: Buffer): Buffer {
  if (!buf || buf.length < 100 || buf[0] !== 0xFF || buf[1] !== 0xD8) return buf;
  if (buf.slice(-2).toString('hex') === 'ffd9' && buf.slice(0, 2000).indexOf(Buffer.from([0xFF, 0xC0])) !== -1) {
    return buf;
  }

  // Scan for shifted JPEG markers (FF DB quantization or FF C0 baseline frame)
  for (let offset = 400; offset < Math.min(800, buf.length - 20); offset++) {
    for (let shift = 1; shift < 8; shift++) {
      const b1 = buf[offset];
      const b2 = buf[offset + 1] || 0;
      const b3 = buf[offset + 2] || 0;
      const s1 = ((b1 << shift) | (b2 >> (8 - shift))) & 0xFF;
      const s2 = ((b2 << shift) | (b3 >> (8 - shift))) & 0xFF;
      if (s1 === 0xFF && (s2 === 0xDB || s2 === 0xC0)) {
        const head = buf.slice(0, offset);
        const tailLen = buf.length - offset;
        const repTail = Buffer.alloc(tailLen);
        for (let i = 0; i < tailLen; i++) {
          const byteA = buf[offset + i];
          const byteB = (offset + i + 1 < buf.length) ? buf[offset + i + 1] : 0;
          repTail[i] = ((byteA << shift) | (byteB >> (8 - shift))) & 0xFF;
        }
        let repaired = Buffer.concat([head, repTail]);
        const eoiPos = repaired.lastIndexOf(Buffer.from([0xFF, 0xD9]));
        if (eoiPos !== -1 && eoiPos > repaired.length - 20) {
          repaired = repaired.slice(0, eoiPos + 2);
        } else if (repaired.slice(-2).toString('hex') !== 'ffd9') {
          repaired = Buffer.concat([repaired, Buffer.from([0xFF, 0xD9])]);
        }
        if (repaired.slice(0, 2000).indexOf(Buffer.from([0xFF, 0xC0])) !== -1) {
          return repaired;
        }
      }
    }
  }

  // If missing EOI marker, append it
  if (buf.slice(-2).toString('hex') !== 'ffd9') {
    return Buffer.concat([buf, Buffer.from([0xFF, 0xD9])]);
  }

  return buf;
}

// POST /api/proxy/upload-image - Upload image to Google Drive via server proxy with bit-shift protection
app.post('/api/proxy/upload-image', async (req, res) => {
  try {
    const { base64Data, filename, folderName, scriptUrl } = req.body || {};
    const url = (scriptUrl || readServerState()?.settings?.googleAppsScriptUrl || '').trim();
    if (!url) {
      return res.status(400).json({ success: false, message: 'Google Apps Script URL is required' });
    }
    if (!base64Data) {
      return res.status(400).json({ success: false, message: 'base64Data is required' });
    }

    // Clean up base64: ensure proper formatting and no lost '+'
    let cleanB64 = String(base64Data);
    const b64Idx = cleanB64.indexOf('base64,');
    if (b64Idx !== -1) {
      cleanB64 = cleanB64.substring(b64Idx + 7);
    }
    // Prevent '+' from being lost as space
    cleanB64 = cleanB64.split(' ').join('+').replace(/[^A-Za-z0-9+/=]/g, '');

    const targetFilename = filename || `bukti_${Date.now()}.jpg`;
    const payload = {
      action: 'uploadImage',
      base64Data: cleanB64,
      filename: targetFilename,
      folderName: folderName || 'DPT_AlaDin_Bukti_Foto'
    };

    const gasRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const text = await gasRes.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (json && (json.status === 'success' || json.fileUrl || json.fileId)) {
      const fileId = json.fileId || '';
      if (fileId) {
        try {
          const buf = Buffer.from(cleanB64, 'base64');
          const validBuf = Buffer.from(repairJpegBuffer(buf));
          IMAGE_CACHE.set(fileId, { buffer: validBuf, contentType: 'image/jpeg', timestamp: Date.now() });
          const diskPath = getDiskCachePath(fileId);
          fs.writeFileSync(diskPath, validBuf);
        } catch {}
      }
      return res.json({
        success: true,
        fileId: json.fileId,
        fileUrl: json.fileUrl || `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
        driveUrl: json.driveUrl
      });
    }

    res.status(400).json({ success: false, message: json.message || 'Upload gagal', details: json });
  } catch (err: any) {
    console.error('Upload image proxy error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// OPTIONS handler for /api/proxy/image (CORS preflight)
app.options('/api/proxy/image', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendStatus(204);
});

// GET /api/proxy/image - Image proxy to reliably stream Google Drive & remote photos to client
app.get('/api/proxy/image', async (req, res) => {
  // Set CORS and CORP headers immediately so ANY browser request succeeds
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  try {
    const rawId = req.query.id as string;
    const rawUrl = req.query.url as string;
    const bypassCache = req.query.refresh === '1' || req.query.refresh === 'true';
    const forceGas = req.query.gas === '1' || req.query.forceGas === 'true';
    let fileId = rawId ? rawId.trim() : '';

    if (!fileId && rawUrl) {
      const match = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/) ||
                    rawUrl.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/) ||
                    rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
                    rawUrl.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
      if (match && match[1]) {
        fileId = match[1];
      } else if (/^[a-zA-Z0-9_-]{25,45}$/.test(rawUrl.trim())) {
        fileId = rawUrl.trim();
      }
    }

    const cacheKey = fileId || rawUrl;
    if (!cacheKey) {
      return res.status(400).send('Parameter id or url required');
    }

    // 1. In-memory cache check (sub-millisecond return)
    if (!bypassCache && IMAGE_CACHE.has(cacheKey)) {
      const cached = IMAGE_CACHE.get(cacheKey)!;
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      return res.send(cached.buffer);
    }

    // 2. Disk cache check
    const diskPath = getDiskCachePath(cacheKey);
    if (!bypassCache && fs.existsSync(diskPath)) {
      try {
        const fileBuffer = fs.readFileSync(diskPath);
        if (fileBuffer.length > 0) {
          const contentType = 'image/jpeg';
          IMAGE_CACHE.set(cacheKey, { buffer: fileBuffer, contentType, timestamp: Date.now() });
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
          return res.send(fileBuffer);
        }
      } catch (diskErr) {
        console.warn('Failed to read image from disk cache:', diskErr);
      }
    }

    // 3. Fallback to Google Apps Script first if explicitly forced
    if (fileId && forceGas) {
      const scriptUrl = readServerState()?.settings?.googleAppsScriptUrl;
      if (scriptUrl && scriptUrl.trim()) {
        try {
          const gasUrl = `${scriptUrl.trim()}?action=getImage&id=${encodeURIComponent(fileId)}`;
          const gasRes = await fetch(gasUrl, { redirect: 'follow' });
          if (gasRes.ok) {
            const text = await gasRes.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch {}
            if (json && json.status === 'success' && json.base64) {
              const buffer = Buffer.from(json.base64, 'base64');
              const contentType = json.mimeType || 'image/jpeg';
              IMAGE_CACHE.set(cacheKey, { buffer, contentType, timestamp: Date.now() });
              try { fs.writeFileSync(diskPath, buffer); } catch {}
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
              return res.send(buffer);
            }
          }
        } catch (gasErr) {
          console.warn('Google Apps Script forced fetch failed:', gasErr);
        }
      }
    }

    // 4. Candidate direct download endpoints (PRIORITIZING WORKING CDN ENDPOINTS)
    const candidateUrls: string[] = [];
    if (fileId) {
      // 1. Google Drive Thumbnail CDN (fastest, high reliability, edge cached)
      candidateUrls.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`);
      // 2. Google UserContent LH3 CDN
      candidateUrls.push(`https://lh3.googleusercontent.com/d/${fileId}`);
      // 3. Direct usercontent download endpoint
      candidateUrls.push(`https://drive.usercontent.google.com/download?id=${fileId}&export=view`);
      // 4. Drive uc?export=view
      candidateUrls.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
      // 5. Docs uc?export=download
      candidateUrls.push(`https://docs.google.com/uc?id=${fileId}&export=download`);
    } else if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
      candidateUrls.push(rawUrl);
    }

    for (const targetUrl of candidateUrls) {
      try {
        const fetchRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(4500)
        });

        if (fetchRes.ok) {
          const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            const arrayBuf = await fetchRes.arrayBuffer();
            let buffer = Buffer.from(arrayBuf);
            // Verify this is not an HTML redirect page pretending to be an image
            if (buffer.length > 50 && buffer[0] !== 0x3C) {
              // Self-heal bit-shifted JPEG if needed
              buffer = Buffer.from(repairJpegBuffer(buffer));
              // Save to memory cache & disk cache
              IMAGE_CACHE.set(cacheKey, { buffer, contentType: 'image/jpeg', timestamp: Date.now() });
              try { fs.writeFileSync(diskPath, buffer); } catch {}

              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
              return res.send(buffer);
            }
          }
        }
      } catch {
        // Continue to next candidate
      }
    }

    // 5. Secondary fallback: Query Google Apps Script (has owner privileges to read any company photo)
    if (fileId) {
      const scriptUrl = readServerState()?.settings?.googleAppsScriptUrl;
      if (scriptUrl && scriptUrl.trim()) {
        try {
          const gasUrl = `${scriptUrl.trim()}?action=getImage&id=${encodeURIComponent(fileId)}`;
          const gasRes = await fetch(gasUrl, { redirect: 'follow' });
          if (gasRes.ok) {
            const text = await gasRes.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch {}
            if (json && json.status === 'success' && json.base64) {
              let cleanBase64 = String(json.base64).replace(/ /g, '+').replace(/[\r\n\t]/g, '');
              let buffer = Buffer.from(cleanBase64, 'base64');
              buffer = Buffer.from(repairJpegBuffer(buffer));
              const contentType = 'image/jpeg';
              IMAGE_CACHE.set(cacheKey, { buffer, contentType, timestamp: Date.now() });
              try { fs.writeFileSync(diskPath, buffer); } catch {}

              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
              return res.send(buffer);
            }
          }
        } catch (gasErr) {
          console.warn('Google Apps Script secondary fetch failed:', gasErr);
        }
      }
    }

    res.status(404).send('Image could not be loaded');
  } catch (err: any) {
    console.error('Image proxy error:', err);
    res.status(500).send('Proxy error');
  }
});

// In-memory / persistent push subscriptions storage
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');
function readPushSubscriptions(): any[] {
  try {
    if (fs.existsSync(PUSH_SUBSCRIPTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PUSH_SUBSCRIPTIONS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}
function writePushSubscriptions(subs: any[]) {
  try {
    fs.writeFileSync(PUSH_SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch {}
}

// In-memory & disk-backed active presence tracking for online technicians
interface ActivePresence {
  id: string;
  namaLengkap: string;
  role: string;
  serverId?: string;
  namaServer?: string;
  lastSeen: number;
}
const PRESENCES_FILE = path.join(DATA_DIR, 'presences.json');
const activePresences: Record<string, ActivePresence> = {};

// Admin Real-time Notification Events Store (Technician Online, Attendance, Planning, Job Submission)
export interface AdminNotificationEvent {
  id: string;
  type: 'technician_online' | 'attendance_submitted' | 'planning_created' | 'job_submitted';
  title: string;
  body: string;
  timestamp: number;
  data?: any;
}

const ADMIN_EVENTS_FILE = path.join(DATA_DIR, 'admin_events.json');
let adminEvents: AdminNotificationEvent[] = [];

try {
  if (fs.existsSync(ADMIN_EVENTS_FILE)) {
    const raw = fs.readFileSync(ADMIN_EVENTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      adminEvents = parsed;
    }
  }
} catch {}

function saveAdminEventsToDisk() {
  try {
    fs.writeFileSync(ADMIN_EVENTS_FILE, JSON.stringify(adminEvents.slice(0, 100), null, 2), 'utf-8');
  } catch {}
}

function pushAdminEvent(event: Omit<AdminNotificationEvent, 'id' | 'timestamp'> & { timestamp?: number }): AdminNotificationEvent {
  const newEvt: AdminNotificationEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: event.type,
    title: event.title,
    body: event.body,
    timestamp: event.timestamp || Date.now(),
    data: event.data || {}
  };

  adminEvents = [newEvt, ...adminEvents].slice(0, 100);
  saveAdminEventsToDisk();
  console.log(`[Admin Event] ${newEvt.type.toUpperCase()}: ${newEvt.title} - ${newEvt.body}`);
  return newEvt;
}

// Load persisted presences on startup (10 minutes window)
const PRESENCE_ACTIVE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface PresenceHistoryEntry {
  technicianId: string;
  technicianName: string;
  role?: string;
  serverId?: string;
  serverName?: string;
  timestamp: number;
}

const PRESENCE_HISTORY_FILE = path.join(DATA_DIR, 'presence_history.json');
let presenceHistory: PresenceHistoryEntry[] = [];

try {
  if (fs.existsSync(PRESENCE_HISTORY_FILE)) {
    const raw = fs.readFileSync(PRESENCE_HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000; // retain 48 hours
      presenceHistory = parsed.filter(item => item && item.timestamp && item.timestamp > cutoff);
    }
  }
} catch {}

let presenceHistoryTimer: any = null;
function savePresenceHistoryToDisk() {
  if (presenceHistoryTimer) return;
  presenceHistoryTimer = setTimeout(() => {
    presenceHistoryTimer = null;
    try {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      presenceHistory = presenceHistory.filter(item => item && item.timestamp && item.timestamp > cutoff);
      fs.writeFile(PRESENCE_HISTORY_FILE, JSON.stringify(presenceHistory.slice(-2000), null, 2), 'utf-8', () => {});
    } catch {}
  }, 5000);
}

function recordPresenceHistory(entry: PresenceHistoryEntry) {
  const fiveMin = 5 * 60 * 1000;
  const recent = presenceHistory.find(
    p => p.technicianId === entry.technicianId && Math.abs(p.timestamp - entry.timestamp) < fiveMin
  );
  if (!recent) {
    presenceHistory.push(entry);
    savePresenceHistoryToDisk();
  }
}

try {
  if (fs.existsSync(PRESENCES_FILE)) {
    const raw = fs.readFileSync(PRESENCES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const now = Date.now();
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const item = v as ActivePresence;
        if (item && item.id && now - item.lastSeen < PRESENCE_ACTIVE_TIMEOUT_MS) {
          activePresences[k] = item;
        }
      }
    }
  }
} catch {}

let presenceSaveTimer: any = null;
function savePresencesToDisk() {
  if (presenceSaveTimer) return;
  presenceSaveTimer = setTimeout(() => {
    presenceSaveTimer = null;
    try {
      const now = Date.now();
      // Prune entries older than 10 minutes
      for (const key of Object.keys(activePresences)) {
        if (!activePresences[key] || now - activePresences[key].lastSeen > PRESENCE_ACTIVE_TIMEOUT_MS) {
          delete activePresences[key];
        }
      }
      fs.writeFile(PRESENCES_FILE, JSON.stringify(activePresences, null, 2), 'utf-8', () => {});
    } catch {}
  }, 2000);
}

function getActiveOnlineUsers(): ActivePresence[] {
  const now = Date.now();
  // Active if heartbeat received within last 10 minutes
  return Object.values(activePresences).filter(p => p && p.lastSeen && now - p.lastSeen < PRESENCE_ACTIVE_TIMEOUT_MS);
}

// POST /api/presence/heartbeat - Record technician / user heartbeat & auto-detect new online technicians
app.post('/api/presence/heartbeat', (req, res) => {
  try {
    const { id, namaLengkap, role, serverId, namaServer, username, password } = req.body || {};

    // Validate employee session credentials against current server state
    const serverState = readServerState();
    let sessionInvalid = false;
    let sessionInvalidReason = '';

    if (id && serverState && Array.isArray(serverState.employees) && serverState.employees.length > 0) {
      if (id === 'emp-admin' || role === 'Admin') {
        const adminEmp = serverState.employees.find((e: any) => e.id === 'emp-admin' || e.role === 'Admin');
        const adminUser = adminEmp?.username || serverState.settings?.adminUsername;
        const adminPass = adminEmp?.password || serverState.settings?.adminPassword;
        const currentTrim = String(username || '').trim().toLowerCase();
        const freshUserTrim = String(adminUser || '').trim().toLowerCase();
        const currentPassTrim = String(password || '').trim();
        const freshPassTrim = String(adminPass || '').trim();

        if (currentTrim && freshUserTrim && currentTrim !== freshUserTrim) {
          sessionInvalid = true;
          sessionInvalidReason = 'Username Administrator telah diubah.';
        } else if (currentPassTrim && freshPassTrim && currentPassTrim !== freshPassTrim) {
          sessionInvalid = true;
          sessionInvalidReason = 'Password Administrator telah diubah.';
        }
      } else {
        // Robust lookup by id, username, or namaLengkap
        const emp = serverState.employees.find((e: any) =>
          (e.id && id && String(e.id).trim().toLowerCase() === String(id).trim().toLowerCase()) ||
          (e.username && username && String(e.username).trim().toLowerCase() === String(username).trim().toLowerCase()) ||
          (e.namaLengkap && namaLengkap && String(e.namaLengkap).trim().toLowerCase() === String(namaLengkap).trim().toLowerCase())
        );

        if (emp) {
          const currentTrim = String(username || '').trim().toLowerCase();
          const freshUserTrim = String(emp.username || '').trim().toLowerCase();
          const currentPassTrim = String(password || '').trim();
          const freshPassTrim = String(emp.password || '').trim();

          const userMismatch = Boolean(currentTrim && freshUserTrim && currentTrim !== freshUserTrim);
          const passMismatch = Boolean(currentPassTrim && freshPassTrim && currentPassTrim !== freshPassTrim);

          if (userMismatch || passMismatch) {
            sessionInvalid = true;
            sessionInvalidReason = 'Username atau sandi login akun Anda telah diubah oleh Administrator.';
          }
        }
        // Gracefully allow active connection even if server employee cache is temporarily syncing
      }
    }

    if (sessionInvalid) {
      if (id && activePresences[id]) {
        delete activePresences[id];
        savePresencesToDisk();
      }
      return res.json({
        success: false,
        sessionInvalid: true,
        reason: sessionInvalidReason,
        onlineUsers: getActiveOnlineUsers(),
        onlineTechnicians: getActiveOnlineUsers().filter(u => String(u.role || '').toLowerCase().trim() === 'teknisi')
      });
    }

    if (id && namaLengkap) {
      const resolvedRole = role || (serverState?.employees?.find((e: any) => e.id === id || e.namaLengkap === namaLengkap)?.role) || 'Teknisi';
      const isTech = String(resolvedRole || '').toLowerCase().trim() === 'teknisi';
      const existing = activePresences[id];
      const now = Date.now();
      const wasOffline = !existing || (now - existing.lastSeen > PRESENCE_ACTIVE_TIMEOUT_MS);

      activePresences[id] = {
        id,
        namaLengkap,
        role: resolvedRole,
        serverId: serverId || undefined,
        namaServer: namaServer || undefined,
        lastSeen: now
      };
      savePresencesToDisk();

      // Record hourly presence history log for trend chart
      if (isTech) {
        recordPresenceHistory({
          technicianId: id,
          technicianName: namaLengkap,
          role: resolvedRole,
          serverId: serverId || undefined,
          serverName: namaServer || undefined,
          timestamp: now
        });
      }

      // Auto trigger notification for admin and other technicians if technician just came online
      if (isTech && wasOffline) {
        pushAdminEvent({
          type: 'technician_online',
          title: '🟢 Teknisi Online',
          body: `${namaLengkap} baru saja membuka aplikasi / aktif online${namaServer ? ` (${namaServer})` : ''}.`,
          data: {
            technicianId: id,
            technicianName: namaLengkap,
            serverName: namaServer,
            senderId: id,
            teknisiId: id,
            senderName: namaLengkap,
            senderRole: resolvedRole
          }
        });
      }
    }
    const onlineUsers = getActiveOnlineUsers();
    res.json({
      success: true,
      onlineUsers,
      onlineTechnicians: onlineUsers.filter(u => String(u.role || '').toLowerCase().trim() === 'teknisi')
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/admin - Publish real-time event for admin devices
app.post('/api/notifications/admin', (req, res) => {
  try {
    const { type, title, body, data } = req.body || {};
    if (!type || !title || !body) {
      return res.status(400).json({ success: false, message: 'Type, title, and body are required' });
    }
    const event = pushAdminEvent({ type, title, body, data });
    res.json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/notifications/admin - Poll latest events for admin devices
app.get('/api/notifications/admin', (req, res) => {
  try {
    const since = req.query.since ? parseInt(req.query.since as string, 10) : 0;
    if (since > 0) {
      const newEvents = adminEvents.filter(e => e.timestamp > since);
      return res.json({ success: true, events: newEvents });
    }
    res.json({ success: true, events: adminEvents.slice(0, 20) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/presence/leave - Immediately remove user when tab closes or logs out
app.post('/api/presence/leave', (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
    const { id } = body || {};
    if (id && activePresences[id]) {
      delete activePresences[id];
      savePresencesToDisk();
    }
    const onlineUsers = getActiveOnlineUsers();
    res.json({
      success: true,
      onlineUsers,
      onlineTechnicians: onlineUsers.filter(u => u.role?.toLowerCase().trim() === 'teknisi')
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/presence/active - Retrieve current online technicians and users
app.get('/api/presence/active', (req, res) => {
  const onlineUsers = getActiveOnlineUsers();
  res.json({
    success: true,
    onlineUsers,
    onlineTechnicians: onlineUsers.filter(u => u.role?.toLowerCase().trim() === 'teknisi')
  });
});

// GET /api/presence/hourly-trend - 24-hour hourly trend of online technicians
app.get('/api/presence/hourly-trend', (req, res) => {
  try {
    const { serverId } = req.query as { serverId?: string };
    const now = Date.now();
    const serverState = readServerState();
    const employees: any[] = Array.isArray(serverState?.employees) ? serverState.employees : [];
    const attendance: any[] = Array.isArray(serverState?.attendanceList) ? serverState.attendanceList : [];
    const jobs: any[] = Array.isArray(serverState?.jobs) ? serverState.jobs : [];
    const servers: any[] = Array.isArray(serverState?.servers) ? serverState.servers : [];

    const selectedServerObj = servers.find((s: any) => s.id === serverId);
    const targetServerName = selectedServerObj?.namaServer?.toLowerCase().trim();

    // Map each technician ID or name to their assigned server
    const techServerMap = new Map<string, { serverId?: string; serverName?: string }>();
    employees.forEach(e => {
      if (e.id) {
        techServerMap.set(e.id.toLowerCase().trim(), { serverId: e.serverId, serverName: e.namaServer });
      }
      if (e.namaLengkap) {
        techServerMap.set(e.namaLengkap.toLowerCase().trim(), { serverId: e.serverId, serverName: e.namaServer });
      }
    });

    const isMatchServer = (tId?: string, tName?: string, sId?: string, sName?: string) => {
      if (!serverId || serverId === 'all') return true;
      if (sId && sId === serverId) return true;
      if (targetServerName && sName && sName.toLowerCase().trim() === targetServerName) return true;
      const mapped = (tId && techServerMap.get(tId.toLowerCase().trim())) || (tName && techServerMap.get(tName.toLowerCase().trim()));
      if (mapped) {
        if (mapped.serverId && mapped.serverId === serverId) return true;
        if (targetServerName && mapped.serverName && mapped.serverName.toLowerCase().trim() === targetServerName) return true;
      }
      return false;
    };

    const buckets: Array<{
      hour: string;
      hourNum: number;
      fullLabel: string;
      timestamp: number;
      onlineCount: number;
      technicians: string[];
      serverBreakdown: Record<string, number>;
    }> = [];

    const allActiveTechNames24h = new Set<string>();

    for (let i = 23; i >= 0; i--) {
      const bucketTime = new Date(now - i * 3600 * 1000);
      const year = bucketTime.getFullYear();
      const month = bucketTime.getMonth();
      const date = bucketTime.getDate();
      const hour = bucketTime.getHours();

      const slotStart = new Date(year, month, date, hour, 0, 0, 0).getTime();
      const slotEnd = new Date(year, month, date, hour, 59, 59, 999).getTime();

      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      const dateStr = bucketTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const fullLabel = `${dateStr}, ${hourStr}`;
      const ymdStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

      const activeInSlot = new Map<string, { id: string; name: string; serverName?: string }>();

      // 1. Presence history
      presenceHistory.forEach(p => {
        if (p.timestamp >= slotStart && p.timestamp <= slotEnd) {
          if (isMatchServer(p.technicianId, p.technicianName, p.serverId, p.serverName)) {
            const key = (p.technicianId || p.technicianName).toLowerCase().trim();
            const sName = p.serverName || (p.technicianId && techServerMap.get(p.technicianId.toLowerCase().trim())?.serverName);
            activeInSlot.set(key, { id: p.technicianId, name: p.technicianName, serverName: sName });
          }
        }
      });

      // 2. Current active online users for current hour
      if (i === 0) {
        getActiveOnlineUsers().forEach(p => {
          const roleStr = String(p.role || '').toLowerCase().trim();
          if (!roleStr || roleStr === 'teknisi') {
            if (isMatchServer(p.id, p.namaLengkap, p.serverId, p.namaServer)) {
              const key = (p.id || p.namaLengkap).toLowerCase().trim();
              const sName = p.namaServer || (p.id && techServerMap.get(p.id.toLowerCase().trim())?.serverName);
              activeInSlot.set(key, { id: p.id, name: p.namaLengkap, serverName: sName });
            }
          }
        });
      }

      // 3. Attendance records active during this hour
      attendance.forEach((att: any) => {
        if (att && att.tanggal === ymdStr && att.status !== 'Ditolak') {
          const jamMasukNum = att.jamMasuk ? parseInt(att.jamMasuk.split(':')[0], 10) : 8;
          const jamPulangNum = (att.jamPulang && att.jamPulang !== '-' && att.jamPulang.trim())
            ? parseInt(att.jamPulang.split(':')[0], 10)
            : 17;

          if (hour >= jamMasukNum && hour <= jamPulangNum) {
            if (isMatchServer(att.teknisiId, att.teknisiNama, att.serverId, att.serverNama)) {
              const techName = att.teknisiNama || 'Teknisi';
              const key = (att.teknisiId || techName).toLowerCase().trim();
              if (!activeInSlot.has(key)) {
                activeInSlot.set(key, { id: att.teknisiId || key, name: techName, serverName: att.serverNama });
              }
            }
          }
        }
      });

      // 4. Jobs submitted during this hour
      jobs.forEach((job: any) => {
        if (job && job.tanggal === ymdStr) {
          const jobHour = job.jamMulai ? parseInt(job.jamMulai.split(':')[0], 10) : (job.createdAt ? new Date(job.createdAt).getHours() : -1);
          if (jobHour === hour || (job.jamSelesai && parseInt(job.jamSelesai.split(':')[0], 10) === hour)) {
            if (Array.isArray(job.teknisiNamas)) {
              job.teknisiNamas.forEach((tName: string, idx: number) => {
                const tId = Array.isArray(job.teknisiIds) ? job.teknisiIds[idx] : undefined;
                if (isMatchServer(tId, tName, job.serverId, job.namaServer)) {
                  const key = (tId || tName).toLowerCase().trim();
                  if (!activeInSlot.has(key)) {
                    activeInSlot.set(key, { id: tId || key, name: tName, serverName: job.namaServer });
                  }
                }
              });
            }
          }
        }
      });

      const serverBreakdown: Record<string, number> = {};
      const techNames: string[] = [];

      activeInSlot.forEach(item => {
        techNames.push(item.name);
        allActiveTechNames24h.add(item.name);
        const s = item.serverName || 'Pusat';
        serverBreakdown[s] = (serverBreakdown[s] || 0) + 1;
      });

      buckets.push({
        hour: hourStr,
        hourNum: hour,
        fullLabel,
        timestamp: slotStart,
        onlineCount: activeInSlot.size,
        technicians: techNames,
        serverBreakdown
      });
    }

    let peakCount = 0;
    let peakHour = '00:00';
    let totalCountSum = 0;

    buckets.forEach(b => {
      totalCountSum += b.onlineCount;
      if (b.onlineCount > peakCount) {
        peakCount = b.onlineCount;
        peakHour = b.hour;
      }
    });

    const averageCount = Number((totalCountSum / (buckets.length || 1)).toFixed(1));
    const currentOnline = buckets[buckets.length - 1]?.onlineCount || 0;

    res.json({
      success: true,
      trend: buckets,
      summary: {
        peakHour,
        peakCount,
        averageCount,
        currentOnline,
        totalActive24h: allActiveTechNames24h.size
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/push/subscribe - Register client device for push notification
app.post('/api/push/subscribe', (req, res) => {
  try {
    const sub = req.body;
    if (sub && (sub.endpoint || sub.technicianId)) {
      const current = readPushSubscriptions();
      const filtered = current.filter(s => s.endpoint !== sub.endpoint && s.technicianId !== sub.technicianId);
      filtered.push({ ...sub, updatedAt: new Date().toISOString() });
      writePushSubscriptions(filtered);
    }
    res.json({ success: true, message: 'Subscription saved' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notify/whatsapp - Send WhatsApp message via Gateway (Fonnte, Wablas, or Webhook)
app.post('/api/notify/whatsapp', async (req, res) => {
  try {
    const { phone, message, provider, apiToken, apiUrl } = req.body || {};
    const state = readServerState() || {};
    const settings = state.settings || {};

    const token = apiToken || settings.waApiToken;
    const gateway = provider || settings.waGatewayProvider || 'fonnte';
    const targetPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';

    if (!targetPhone) {
      return res.status(400).json({ success: false, message: 'Nomor telepon tujuan tidak valid' });
    }

    if (!token || !token.trim()) {
      return res.json({
        success: false,
        message: 'API Token WhatsApp belum diisi pada menu Pengaturan > Notifikasi & WhatsApp Gateway.'
      });
    }

    // Fonnte Gateway Integration (Default & most popular in ID)
    if (gateway === 'fonnte' || (!apiUrl && !gateway)) {
      const endpoint = apiUrl || 'https://api.fonnte.com/send';
      const fonnteResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': token.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: targetPhone,
          message: message,
          countryCode: '62'
        })
      });

      const json = await fonnteResponse.json();
      if (json.status || json.status === true) {
        return res.json({ success: true, message: 'Notifikasi WhatsApp berhasil dikirim ke teknisi!' });
      } else {
        return res.json({
          success: false,
          message: json.reason || json.message || 'Gagal mengirim pesan via Fonnte Gateway'
        });
      }
    }

    // Wablas Gateway
    if (gateway === 'wablas') {
      const endpoint = apiUrl || 'https://kudus.wablas.com/api/send-message';
      const wablasResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': token.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: targetPhone,
          message: message
        })
      });
      const json = await wablasResponse.json();
      return res.json({
        success: json.status === true || json.status === 'success',
        message: json.message || 'Respon dari Wablas diterima'
      });
    }

    // Custom Webhook
    if (apiUrl) {
      const customRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: targetPhone,
          message: message,
          timestamp: new Date().toISOString()
        })
      });
      const json = await customRes.json().catch(() => ({ status: 'ok' }));
      return res.json({ success: true, data: json });
    }

    res.json({ success: false, message: 'Provider WhatsApp tidak dikenali.' });
  } catch (err: any) {
    console.error('WhatsApp gateway error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notify/planning - Broadcast new planning task notification
app.post('/api/notify/planning', (req, res) => {
  try {
    const { plan, targetIds, settings } = req.body || {};
    console.log(`[Notification Engine] New Planning Task Created: ${plan?.id} for technicians:`, targetIds);

    // Save notification log
    const state = readServerState() || {};
    const logs = state.notificationLogs || [];
    logs.unshift({
      id: `notif-${Date.now()}`,
      type: 'PLANNING_TASK',
      planId: plan?.id,
      targetIds,
      createdAt: new Date().toISOString()
    });
    // Keep last 50 logs
    state.notificationLogs = logs.slice(0, 50);
    writeServerState(state);

    res.json({
      success: true,
      message: 'Planning notification broadcast registered',
      count: targetIds?.length || 0
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: {
          ignored: ['**/server_data/**', '**/public/**', '**/.git/**']
        }
      },
      appType: 'spa',
    });

    // Intercept /@vite/client to disable unwanted HMR websocket reconnection attempts in the sandbox preview
    app.get('/@vite/client', async (req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result && result.code) {
          let code = result.code;
          // Replace websocket transport with a clean dummy transport so no failed WebSocket connection occurs
          code = code.replace(
            /const createWebSocketModuleRunnerTransport = [\s\S]*?^};/m,
            'const createWebSocketModuleRunnerTransport = () => ({ connect: async () => {}, disconnect: async () => {}, send: () => {} });'
          );
          // Suppress any remaining vite connection error logger
          code = code.replace(
            /error:\s*\(err\)\s*=>\s*console\.error\("\[vite\]",\s*err\)/g,
            'error: () => {}'
          );
          code = code.replace(
            /console\.error\(\s*`\[vite\] failed to connect to websocket[\s\S]*?`\s*\);(\s*throw e;)?/g,
            '/* suppressed */ return;'
          );
          code = code.replace(
            /console\.debug\("\[vite\] connecting\.\.\."\);/g,
            '/* suppressed */'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(code);
        }
      } catch (err) {
        console.warn('Fallback serving @vite/client via vite middleware:', err);
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Sync latest data from Google Sheets into server cache on startup
    syncServerStateFromGoogleSheets();
    // Keep server state up to date with Google Sheets every 2 minutes
    setInterval(() => {
      syncServerStateFromGoogleSheets();
    }, 120000);
  });
}

startServer();
