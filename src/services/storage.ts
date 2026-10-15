import {
  Employee,
  ServerData,
  WilayahPekerjaan,
  JenisPekerjaan,
  JobRecord,
  PlanningTask,
  AttendanceRecord,
  LeaveRequest,
  AppSettings,
  PotonganManual,
  AdminNotificationEvent,
  HonorLunasRecord
} from '../types';
import { sanitizeTimeString, sanitizeDateString, getEffectiveTodayISO } from './googleSheetsHelper';
import { PhotoCacheService } from './photoCache';

const STORAGE_KEYS = {
  EMPLOYEES: 'dpt_aladin_employees_v1',
  SERVERS: 'dpt_aladin_servers_v1',
  WILAYAH: 'dpt_aladin_wilayah_v1',
  JENIS_PEKERJAAN: 'dpt_aladin_jenis_pekerjaan_v1',
  JOBS: 'dpt_aladin_jobs_v1',
  PLANNING: 'dpt_aladin_planning_v1',
  ATTENDANCE: 'dpt_aladin_attendance_v1',
  DELETED_ATTENDANCE: 'dpt_aladin_deleted_attendance_ids_v1',
  RESOLVED_ATTENDANCE: 'dpt_aladin_resolved_attendance_keys_v1',
  LEAVE: 'dpt_aladin_leave_v1',
  POTONGAN_MANUAL: 'dpt_aladin_potongan_manual_v1',
  HONOR_LUNAS: 'dpt_aladin_honor_lunas_v1',
  SETTINGS: 'dpt_aladin_settings_v1',
  CURRENT_USER: 'dpt_aladin_current_user_v1',
  APPROVED_LEMBUR: 'dpt_aladin_approved_lembur_v1',
  PROFILE_PHOTOS: 'dpt_aladin_profile_photos_v1',
  JOB_DRAFT: 'dpt_aladin_job_draft_v1',
  ATTENDANCE_DRAFT: 'dpt_aladin_attendance_draft_v1',
  LEAVE_DRAFT: 'dpt_aladin_leave_draft_v1',
  MANUAL_ATTENDANCE_DRAFT: 'dpt_aladin_manual_attendance_draft_v1',
  MASTER_DATA_DRAFT: 'dpt_aladin_master_data_draft_v1',
  PLANNING_DRAFT: 'dpt_aladin_planning_draft_v1',
  QUICK_JOB_MODAL_OPEN: 'dpt_aladin_quick_job_modal_open_v1'
};

// Initial Seed Data - Minimal Administrator fallback if Google Sheets is not yet connected
const initialEmployees: Employee[] = [
  {
    id: 'emp-admin',
    namaLengkap: 'Administrator',
    username: 'admin',
    password: 'Admin143',
    role: 'Admin',
    status: 'Tetap',
    honorTetapBulanan: 0,
    wilayahHandledIds: [],
    bonusTargetBulanan: 0,
    kontak: '081234567890',
    isOnline: false
  }
];

const initialServers: ServerData[] = [];

const initialWilayah: WilayahPekerjaan[] = [];

const initialJenisPekerjaan: JenisPekerjaan[] = [
  {
    id: "jp-1791078534297",
    jenisPekerjaan: "Distribusi Jaringan",
    subPekerjaan: "Pindah Jalur / Lepas Kabel Feeder",
    tarifDasar: 10000,
    tarifTitik: 0,
    tarifTarikKabelPerMeter: 500,
    tarifLemburPerMenit: 300,
    butuhInputTitik: false,
    butuhPanjangKabel: true,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736817596",
    jenisPekerjaan: "Distribusi Jaringan",
    subPekerjaan: "Tarik Kabel Feeder",
    tarifDasar: 20000,
    tarifTitik: 0,
    tarifTarikKabelPerMeter: 600,
    tarifLemburPerMenit: 333,
    butuhInputTitik: false,
    butuhPanjangKabel: true,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736039453",
    jenisPekerjaan: "Instalasi",
    subPekerjaan: "Instalasi ODC/ODP",
    tarifDasar: 10000,
    tarifTitik: 15000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 333,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788735939199",
    jenisPekerjaan: "Instalasi",
    subPekerjaan: "PSB Pelanggan",
    tarifDasar: 10000,
    tarifTitik: 15000,
    tarifTarikKabelPerMeter: 500,
    tarifLemburPerMenit: 300,
    butuhInputTitik: true,
    butuhPanjangKabel: true,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736655113",
    jenisPekerjaan: "Pemeliharaan Jaringan",
    subPekerjaan: "Migrasi HTB",
    tarifDasar: 10000,
    tarifTitik: 15000,
    tarifTarikKabelPerMeter: 400,
    tarifLemburPerMenit: 300,
    butuhInputTitik: true,
    butuhPanjangKabel: true,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736704408",
    jenisPekerjaan: "Pemeliharaan Jaringan",
    subPekerjaan: "Pengecekan Redaman ODP/ODC",
    tarifDasar: 5000,
    tarifTitik: 5000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 333,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736746767",
    jenisPekerjaan: "Pemeliharaan Jaringan",
    subPekerjaan: "Pindah Jalur/Pelepasan Kabel",
    tarifDasar: 10000,
    tarifTitik: 0,
    tarifTarikKabelPerMeter: 400,
    tarifLemburPerMenit: 250,
    butuhInputTitik: false,
    butuhPanjangKabel: true,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736880838",
    jenisPekerjaan: "Pemeliharaan Jaringan",
    subPekerjaan: "Pindah/Ganti ODP ODC",
    tarifDasar: 10000,
    tarifTitik: 20000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 350,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788772392649",
    jenisPekerjaan: "Pemeliharaan Jaringan",
    subPekerjaan: "Splicing Kabel Feeder",
    tarifDasar: 10000,
    tarifTitik: 25000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 400,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736425029",
    jenisPekerjaan: "Trouble/Maintenance",
    subPekerjaan: "Ganti Router/ONT",
    tarifDasar: 5000,
    tarifTitik: 5000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 250,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: false
  },
  {
    id: "jp-1788736383285",
    jenisPekerjaan: "Trouble/Maintenance",
    subPekerjaan: "Internet PPPoE",
    tarifDasar: 5000,
    tarifTitik: 10000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 250,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: false
  },
  {
    id: "jp-1788736580204",
    jenisPekerjaan: "Trouble/Maintenance",
    subPekerjaan: "Perbaikan ODC",
    tarifDasar: 25000,
    tarifTitik: 25000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 400,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736550408",
    jenisPekerjaan: "Trouble/Maintenance",
    subPekerjaan: "Perbaikan ODP",
    tarifDasar: 20000,
    tarifTitik: 25000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 400,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736611374",
    jenisPekerjaan: "Trouble/Maintenance",
    subPekerjaan: "Perbaikan Redaman",
    tarifDasar: 5000,
    tarifTitik: 15000,
    tarifTarikKabelPerMeter: 0,
    tarifLemburPerMenit: 333,
    butuhInputTitik: true,
    butuhPanjangKabel: false,
    isMultiTeknisi: true
  },
  {
    id: "jp-1788736487687",
    jenisPekerjaan: "Trouble/Maintenance",
    subPekerjaan: "Splicing Kabel/Pathcord",
    tarifDasar: 10000,
    tarifTitik: 15000,
    tarifTarikKabelPerMeter: 500,
    tarifLemburPerMenit: 333,
    butuhInputTitik: true,
    butuhPanjangKabel: true,
    isMultiTeknisi: true
  }
];

const initialJobs: JobRecord[] = [];

const initialPlanning: PlanningTask[] = [];

const initialAttendance: AttendanceRecord[] = [];

const initialLeave: LeaveRequest[] = [];

export const DEFAULT_GOOGLE_APPS_SCRIPT_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_APPS_SCRIPT_URL) ||
  'https://script.google.com/macros/s/AKfycbyVyW9TxnWgCAQLS-sehGPay574Vnne2Fhn8t-mKqTX3PlvBwpS8kEbLzFF31dSaUj5/exec';

const initialSettings: AppSettings = {
  namaPerusahaan: 'DPT AlaDin',
  alamatPerusahaan: 'Jl. Utama RT/RW Net No. 88, Jakarta East',
  logoUrl: 'https://lh3.googleusercontent.com/d/15UkXvneSLPZbr3JxQQn0j6Qwy50uoRBz',
  adminUsername: 'admin',
  adminPassword: 'Admin143',
  jamMasukDefinisikan: '08:00',
  jamPulangDefinisikan: '17:00',
  hariLibur: ['Minggu'],
  tanggalLiburKhusus: ['2026-10-14'],
  jumlahCutiMaksimalPerBulan: 2,
  totalCutiPerTahun: 12,
  toleransiKeterlambatanMenit: 15,
  potonganPerKeterlambatan: 25000,
  potonganPulangAwal: 20000,
  googleSheetUrl: '',
  googleAppsScriptUrl: DEFAULT_GOOGLE_APPS_SCRIPT_URL,
  isGoogleSheetConnected: true,
  waGatewayProvider: 'fonnte',
  waApiToken: '',
  waApiUrl: 'https://api.fonnte.com/send',
  autoNotifyTechnicianOnPlanning: true,
  notifyViaBrowserPush: true,
  notifyViaWhatsApp: true
};

// In-memory cache to eliminate repetitive localStorage reads and JSON.parse bottlenecks
const storageMemoryCache = new Map<string, any>();
const normalizedTechKeyCache = new Map<string, string>();

export function clearNormalizedTechKeyCache() {
  normalizedTechKeyCache.clear();
}

// Helper for local storage persistence with zero-latency in-memory cache and sessionStorage dual-layer protection
function getStorage<T>(key: string, fallback: T): T {
  if (storageMemoryCache.has(key)) {
    return storageMemoryCache.get(key) as T;
  }
  try {
    let item: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        item = sessionStorage.getItem(key);
      } catch {}
      if (!item) {
        try {
          item = localStorage.getItem(key);
        } catch {}
      }
    }
    const parsed = item ? JSON.parse(item) : fallback;
    storageMemoryCache.set(key, parsed);
    return parsed;
  } catch {
    storageMemoryCache.set(key, fallback);
    return fallback;
  }
}

const storageWriteTimers = new Map<string, any>();

function setStorage<T>(key: string, value: T): void {
  const currentInMemory = storageMemoryCache.get(key);
  if (currentInMemory === value) return;

  storageMemoryCache.set(key, value);

  if (typeof window === 'undefined') return;

  // 1. Instant write to sessionStorage (independent quota, protects against page reload / camera app switch)
  try {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}

  const isDraftOrTransient = key.includes('draft') || key.includes('modal_open');

  // CRITICAL: If this is draft data or modal visibility, write synchronously & immediately to localStorage
  // so mobile browsers / cameras never lose data when backgrounding or unloading tabs!
  if (isDraftOrTransient) {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      try {
        PhotoCacheService.purgeLegacyLocalStorageCache();
        if (value === null || value === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(value));
        }
      } catch {
        try {
          if (key === STORAGE_KEYS.JOB_DRAFT && value && typeof value === 'object') {
            const trimmed = { ...(value as any), buktiFotoUrls: [] };
            localStorage.setItem(key, JSON.stringify(trimmed));
          } else if (key === STORAGE_KEYS.ATTENDANCE_DRAFT && value && typeof value === 'object') {
            const copy: any = {};
            for (const [k, v] of Object.entries(value)) {
              copy[k] = { ...(v as any), selfieMasukPhoto: '', selfiePulangPhoto: '' };
            }
            localStorage.setItem(key, JSON.stringify(copy));
          }
        } catch {}
      }
    }
    return;
  }

  // 2. Debounce synchronous localStorage writes to avoid main-thread UI jank/lag on mobile smartphones
  if (storageWriteTimers.has(key)) {
    clearTimeout(storageWriteTimers.get(key));
  }

  const timer = setTimeout(() => {
    storageWriteTimers.delete(key);
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (err) {
      console.warn(`LocalStorage write warning for ${key}:`, err);
      try {
        PhotoCacheService.purgeLegacyLocalStorageCache();
        if (value === null || value === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(value));
        }
      } catch {
        // If quota still exceeded, and this is a draft, strip large photo data for localStorage fallback
        // while preserving all critical text/form fields in sessionStorage and in-memory
        try {
          if (key === STORAGE_KEYS.JOB_DRAFT && value && typeof value === 'object') {
            const trimmed = { ...(value as any), buktiFotoUrls: [] };
            localStorage.setItem(key, JSON.stringify(trimmed));
          } else if (key === STORAGE_KEYS.ATTENDANCE_DRAFT && value && typeof value === 'object') {
            const copy: any = {};
            for (const [k, v] of Object.entries(value)) {
              copy[k] = { ...(v as any), selfieMasukPhoto: '', selfiePulangPhoto: '' };
            }
            localStorage.setItem(key, JSON.stringify(copy));
          }
        } catch {}
      }
    }
  }, 40);

  storageWriteTimers.set(key, timer);
}

// Helper to normalize technician identity so ID variations or name-only records map consistently
export function getNormalizedTechKey(teknisiId?: string, teknisiNama?: string): string {
  const cacheKey = `${teknisiId || ''}:::${teknisiNama || ''}`;
  const cached = normalizedTechKeyCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const cleanName = (teknisiNama || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const cleanId = (teknisiId || '').toLowerCase().trim();

  // Cross-reference with known employees from in-memory cache
  try {
    const emps = getStorage<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
    if (Array.isArray(emps) && emps.length > 0) {
      const matched = emps.find((e: any) => {
        const eId = (e.id || '').toLowerCase().trim();
        const eUser = (e.username || '').toLowerCase().trim();
        const eNameClean = (e.namaLengkap || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const isIdMatch = Boolean(
          cleanId && (
            eId === cleanId ||
            eUser === cleanId ||
            `emp-${eUser}` === cleanId ||
            eId === `emp-${cleanId}` ||
            cleanId.includes(eId) ||
            (eUser && cleanId.includes(eUser))
          )
        );
        const isNameMatch = Boolean(
          cleanName && (
            eNameClean === cleanName ||
            (cleanName.length >= 4 && (eNameClean.includes(cleanName) || cleanName.includes(eNameClean)))
          )
        );
        return isIdMatch || isNameMatch;
      });
      if (matched && matched.id) {
        const res = matched.id.toLowerCase().trim();
        normalizedTechKeyCache.set(cacheKey, res);
        return res;
      }
    }
  } catch {}

  const finalKey = cleanId || cleanName || 'unknown';
  normalizedTechKeyCache.set(cacheKey, finalKey);
  return finalKey;
}

// Helper to choose the best available photo URL (prioritizes permanent Drive URL, then base64, rejects '0' or dummy values)
export function pickBestPhotoUrl(url1?: string, url2?: string): string | undefined {
  const isDummy = (u?: string) => {
    if (!u) return true;
    const s = String(u).trim();
    if (!s || s === '0' || s === '-' || s === '--') return true;
    const l = s.toLowerCase();
    if (l === 'null' || l === 'undefined' || l === 'none' || l === 'tidak ada' || l === 'belum ada') return true;
    return false;
  };
  const isDrive = (u?: string) => Boolean(u && !isDummy(u) && !u.startsWith('[') && (u.startsWith('http://') || u.startsWith('https://') || /^[a-zA-Z0-9_-]{25,45}$/.test(u.trim())));
  const isB64 = (u?: string) => Boolean(u && !isDummy(u) && u.startsWith('data:image/'));
  const isPlaceholder = (u?: string) => Boolean(u && !isDummy(u) && u.startsWith('['));

  // 1. Prefer permanent Google Drive URL
  if (isDrive(url1)) return url1!.trim();
  if (isDrive(url2)) return url2!.trim();

  // 2. Prefer Base64 string
  if (isB64(url1)) return url1!.trim();
  if (isB64(url2)) return url2!.trim();

  // 3. Prefer valid placeholder over empty/0
  if (isPlaceholder(url1)) return url1!.trim();
  if (isPlaceholder(url2)) return url2!.trim();

  // 4. Any valid non-dummy string
  if (!isDummy(url1)) return url1!.trim();
  if (!isDummy(url2)) return url2!.trim();

  return undefined;
}

// Helper to cleanly consolidate and merge Attendance records per technician and date without collisions
export function consolidateAttendanceRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  const deletedIds = new Set(StorageService.getDeletedAttendanceIds());
  const resolvedKeys = new Set(StorageService.getResolvedAttendanceKeys());
  // Explicitly ensure the persistent bugged 2026-09-07 record is forever suppressed
  deletedIds.add('att-1788758276968');

  // Load configured standard shift hours & tolerance from settings
  let maxOnTimeMinutes = 8 * 60 + 15;
  let endOfDayMinutes = 17 * 60;
  try {
    const s = StorageService.getSettings();
    if (s) {
      const stdMasukStr = sanitizeTimeString(s.jamMasukDefinisikan, '08:00');
      const stdPulangStr = sanitizeTimeString(s.jamPulangDefinisikan, '17:00');
      const toleransiMenit = Number(s.toleransiKeterlambatanMenit ?? 15);
      const [hIn, mIn] = stdMasukStr.split(':').map(Number);
      maxOnTimeMinutes = (hIn || 8) * 60 + (mIn || 0) + toleransiMenit;
      const [hOut, mOut] = stdPulangStr.split(':').map(Number);
      endOfDayMinutes = (hOut || 17) * 60 + (mOut || 0);
    }
  } catch {
    // fallback
  }

  for (const r of records) {
    if (!r || !r.id) continue;
    if (deletedIds.has(r.id)) continue;

    const cleanDate = sanitizeDateString(r.tanggal);
    const techKey = getNormalizedTechKey(r.teknisiId, r.teknisiNama);
    const groupKey = `${cleanDate}_${techKey}`;

    // Check violations for single incoming record
    const rIn = r.jamMasuk ? sanitizeTimeString(r.jamMasuk, '') : '';
    const rOut = r.jamPulang ? sanitizeTimeString(r.jamPulang, '') : '';
    let rIsLate = false;
    let rIsEarly = false;
    if (rIn && rIn.includes(':')) {
      const [h, m] = rIn.split(':').map(Number);
      if ((h || 0) * 60 + (m || 0) > maxOnTimeMinutes) rIsLate = true;
    }
    if (rOut && rOut !== '-' && rOut.includes(':')) {
      const [h, m] = rOut.split(':').map(Number);
      if ((h || 0) * 60 + (m || 0) < endOfDayMinutes) rIsEarly = true;
    }

    const dateTechIdKey = `${cleanDate}_${r.teknisiId}`.toLowerCase();
    const dateTechNamaKey = `${cleanDate}_${(r.teknisiNama || '').toLowerCase().trim()}`;

    // Check if this record or this technician on this specific date was explicitly approved by admin
    const isExplicitlyResolved = 
      resolvedKeys.has(groupKey.toLowerCase()) || 
      resolvedKeys.has(r.id.toLowerCase()) || 
      resolvedKeys.has(dateTechIdKey) ||
      resolvedKeys.has(dateTechNamaKey) ||
      r.isManual === true ||
      r.id.startsWith('att-manual-') ||
      r.isApproved === true ||
      r.keteranganPulang?.toLowerCase().includes('admin') ||
      r.keteranganPulang?.toLowerCase().includes('manual') ||
      r.keterangan?.includes('[Absen Manual Admin]') ||
      r.keterangan?.toLowerCase().includes('absen manual') ||
      (r.jamPulang && r.jamPulang !== '-' && r.jamPulang.trim().length > 0 && (r.isManual || r.isApproved)) ||
      (r.status === 'Hadir' && r.needsApproval === false) ||
      (r.status === 'Hadir' && !r.needsApproval);

    const isRejected = r.status === 'Ditolak';

    const rNeedsApproval = !isExplicitlyResolved && !isRejected && (
      r.status === 'Pending Approval' || 
      r.needsApproval === true || 
      r.status === 'Terlambat'
    );

    // Cek apakah ada record yang cocok: baik melalui groupKey langsung, atau pencocokan nama/ID teknisi pada tanggal yang sama
    let matchedGroupKey = groupKey;
    if (!map.has(matchedGroupKey)) {
      for (const [k, existingItem] of map.entries()) {
        const existingCleanDate = sanitizeDateString(existingItem.tanggal);
        if (existingCleanDate === cleanDate) {
          const existingTechKey = getNormalizedTechKey(existingItem.teknisiId, existingItem.teknisiNama);
          const exName = (existingItem.teknisiNama || '').toLowerCase().trim();
          const rName = (r.teknisiNama || '').toLowerCase().trim();
          const exId = (existingItem.teknisiId || '').toLowerCase().trim();
          const rId = (r.teknisiId || '').toLowerCase().trim();

          const sameTech = 
            (existingTechKey && techKey && existingTechKey === techKey) ||
            (exId && rId && (exId === rId || exId === `emp-${rId}` || rId === `emp-${exId}`)) ||
            (exName && rName && (exName === rName || (exName.length >= 3 && (exName.includes(rName) || rName.includes(exName))))) ||
            (r.id && existingItem.id && r.id === existingItem.id);
          if (sameTech) {
            matchedGroupKey = k;
            break;
          }
        }
      }
    }

    const isPastDate = cleanDate < getEffectiveTodayISO();
    const isInvalidServer = (s?: string) => {
      if (!s) return true;
      const l = s.toLowerCase().trim();
      return (
        l === 'ya' || 
        l === 'tidak' || 
        l === 'yes' || 
        l === 'no' || 
        l === 'true' || 
        l === 'false' || 
        l === '-' || 
        l === '--' || 
        l === 'undefined' || 
        l === 'null' || 
        l === 'server' || 
        l === 'server ya' ||
        !isNaN(Number(s))
      );
    };

    if (!map.has(matchedGroupKey)) {
      const initFotoPulang = pickBestPhotoUrl(r.fotoPulangUrl);
      const initHasFotoPulang = Boolean(initFotoPulang && !initFotoPulang.startsWith('[Foto Masuk'));
      const rawInPulang = (r.jamPulang && r.jamPulang !== '-' && !/^(belum|pending)/i.test(r.jamPulang))
        ? (sanitizeTimeString(r.jamPulang, '') || r.jamPulang)
        : (initHasFotoPulang ? '17:00' : (isPastDate && r.status !== 'Ditolak' ? '17:00' : undefined));

      const cleanInitialServerNama = !isInvalidServer(r.serverNama) ? r.serverNama : undefined;
      const cleanInitialServerId = (!isInvalidServer(r.serverId) && !r.serverId?.includes('Ya')) ? r.serverId : undefined;

      map.set(groupKey, {
        ...r,
        tanggal: cleanDate,
        serverId: cleanInitialServerId,
        serverNama: cleanInitialServerNama,
        jamMasuk: sanitizeTimeString(r.jamMasuk, '08:00'),
        jamPulang: rawInPulang,
        fotoProofUrl: pickBestPhotoUrl(r.fotoProofUrl),
        fotoPulangUrl: initFotoPulang,
        ...(isExplicitlyResolved ? {
          status: (isRejected ? 'Ditolak' : 'Hadir') as AttendanceRecord['status'],
          needsApproval: false,
          isApproved: !isRejected,
          potonganOtomatis: isRejected ? (r.potonganOtomatis || 25000) : 0
        } : (rNeedsApproval ? {
          status: 'Pending Approval' as AttendanceRecord['status'],
          needsApproval: true,
          isApproved: false,
          approvalType: rIsLate ? 'Terlambat' : (rIsEarly ? 'Pulang Awal' : (r.approvalType || 'Terlambat')),
          potonganOtomatis: rIsLate ? (r.potonganOtomatis || 25000) : (r.potonganOtomatis || 0)
        } : {}))
      });
    } else {
      const existing = map.get(matchedGroupKey)!;
      // Smart non-destructive merge: retain both Jam Masuk & Jam Pulang along with photos and GPS
      const existingHasMasuk = Boolean(existing.jamMasuk && existing.jamMasuk !== '-' && existing.jamMasuk.trim());
      const incomingHasMasuk = Boolean(r.jamMasuk && r.jamMasuk !== '-' && r.jamMasuk.trim());

      const finalJamMasukRaw = (() => {
        if (existingHasMasuk && incomingHasMasuk) {
          if (existing.jamMasuk !== '08:00' && r.jamMasuk === '08:00') return existing.jamMasuk;
          if (existing.jamMasuk === '08:00' && r.jamMasuk !== '08:00') return r.jamMasuk;
          return existing.jamMasuk < r.jamMasuk ? existing.jamMasuk : r.jamMasuk;
        }
        return existingHasMasuk ? existing.jamMasuk : (incomingHasMasuk ? r.jamMasuk : '08:00');
      })();
      
      const existingHasPulang = Boolean(existing.jamPulang && existing.jamPulang !== '-' && existing.jamPulang.trim() && !/^(belum|pending)/i.test(existing.jamPulang));
      const incomingHasPulang = Boolean(r.jamPulang && r.jamPulang !== '-' && r.jamPulang.trim() && !/^(belum|pending)/i.test(r.jamPulang));
      const existingHasFotoPulang = Boolean(existing.fotoPulangUrl && existing.fotoPulangUrl.trim().length > 5 && !existing.fotoPulangUrl.startsWith('[Foto Masuk'));
      const incomingHasFotoPulang = Boolean(r.fotoPulangUrl && r.fotoPulangUrl.trim().length > 5 && !r.fotoPulangUrl.startsWith('[Foto Masuk'));
      
      const finalJamPulangRaw = (() => {
        if (existingHasPulang && incomingHasPulang) {
          return existing.jamPulang! > r.jamPulang! ? existing.jamPulang : r.jamPulang;
        }
        if (incomingHasPulang) return r.jamPulang;
        if (existingHasPulang) return existing.jamPulang;
        if (incomingHasFotoPulang || existingHasFotoPulang) return '17:00';
        if (isPastDate && existing.status !== 'Ditolak' && r.status !== 'Ditolak') return '17:00';
        return undefined;
      })();

      const cleanExistingServerNama = !isInvalidServer(existing.serverNama) ? existing.serverNama : undefined;
      const cleanRServerNama = !isInvalidServer(r.serverNama) ? r.serverNama : undefined;
      const finalServerNama = cleanRServerNama || cleanExistingServerNama;

      const cleanExistingServerId = (!isInvalidServer(existing.serverId) && !existing.serverId?.includes('Ya')) ? existing.serverId : undefined;
      const cleanRServerId = (!isInvalidServer(r.serverId) && !r.serverId?.includes('Ya')) ? r.serverId : undefined;
      const finalServerId = cleanRServerId || cleanExistingServerId;
      
      const merged: AttendanceRecord = {
        ...existing,
        ...r,
        id: existing.id || r.id,
        tanggal: cleanDate,
        teknisiId: existing.teknisiId || r.teknisiId,
        teknisiNama: existing.teknisiNama || r.teknisiNama,
        serverId: finalServerId,
        serverNama: finalServerNama,
        // Jam Masuk: never overwrite with default or empty
        jamMasuk: sanitizeTimeString(finalJamMasukRaw, '08:00'),
        // Foto Proof (Masuk) - prioritize real Drive URL and Base64 over dummy/placeholder
        fotoProofUrl: pickBestPhotoUrl(existing.fotoProofUrl, r.fotoProofUrl),
        // Jam Pulang: keep if either has it
        jamPulang: finalJamPulangRaw ? (sanitizeTimeString(finalJamPulangRaw, '') || finalJamPulangRaw) : undefined,
        // Foto Pulang - prioritize real Drive URL and Base64 over dummy/placeholder
        fotoPulangUrl: pickBestPhotoUrl(r.fotoPulangUrl, existing.fotoPulangUrl),
        // Keterangan Masuk & Pulang
        keterangan: existing.keterangan || r.keterangan,
        keteranganPulang: r.keteranganPulang || existing.keteranganPulang,
        // GPS data
        lat: r.lat ?? existing.lat,
        lng: r.lng ?? existing.lng,
        distanceMeter: r.distanceMeter ?? existing.distanceMeter,
        isWithinRadius: r.isWithinRadius ?? existing.isWithinRadius,
        isManual: Boolean(
          r.isManual ||
          existing.isManual ||
          r.id?.startsWith('att-manual-') ||
          existing.id?.startsWith('att-manual-')
        ),
        // Approval & Status:
        // Must strictly require admin approval for late check-in or early check-out unless explicitly resolved by admin
        ...(() => {
          // Check if there is an early checkout or late checkin in merged record
          const finalIn = sanitizeTimeString(finalJamMasukRaw, '08:00');
          const [inH, inM] = finalIn.split(':').map(Number);
          const isLate = (inH || 0) * 60 + (inM || 0) > maxOnTimeMinutes;

          let isEarly = false;
          if (finalJamPulangRaw && finalJamPulangRaw !== '-') {
            const cleanOut = sanitizeTimeString(finalJamPulangRaw, '');
            if (cleanOut && cleanOut.includes(':')) {
              const [outH, outM] = cleanOut.split(':').map(Number);
              if ((outH || 0) * 60 + (outM || 0) < endOfDayMinutes) isEarly = true;
            }
          }

          const targetTechId = r.teknisiId || existing.teknisiId;
          const targetTechNama = (r.teknisiNama || existing.teknisiNama || '').toLowerCase().trim();
          const dateTechIdKey = `${cleanDate}_${targetTechId}`.toLowerCase();
          const dateTechNamaKey = `${cleanDate}_${targetTechNama}`;

          const isResolvedByAdmin = 
            resolvedKeys.has(groupKey.toLowerCase()) || 
            resolvedKeys.has((existing.id || '').toLowerCase()) || 
            resolvedKeys.has((r.id || '').toLowerCase()) ||
            resolvedKeys.has(dateTechIdKey) ||
            resolvedKeys.has(dateTechNamaKey) ||
            r.isManual === true ||
            existing.isManual === true ||
            r.id?.startsWith('att-manual-') ||
            existing.id?.startsWith('att-manual-') ||
            existing.keteranganPulang?.toLowerCase().includes('admin') ||
            r.keteranganPulang?.toLowerCase().includes('admin') ||
            existing.keteranganPulang?.toLowerCase().includes('manual') ||
            r.keteranganPulang?.toLowerCase().includes('manual') ||
            existing.isApproved === true ||
            r.isApproved === true ||
            (existing.status === 'Hadir' && existing.needsApproval === false) ||
            (r.status === 'Hadir' && r.needsApproval === false) ||
            (existing.status === 'Hadir' && !existing.needsApproval) ||
            (r.status === 'Hadir' && !r.needsApproval);

          const isRejected = r.status === 'Ditolak' || existing.status === 'Ditolak';

          if (isResolvedByAdmin) {
            return {
              status: (isRejected ? 'Ditolak' : 'Hadir') as AttendanceRecord['status'],
              needsApproval: false,
              isApproved: !isRejected,
              potonganOtomatis: isRejected ? (r.potonganOtomatis || existing.potonganOtomatis || 25000) : 0
            };
          }

          const isOutsideRad = (r.isWithinRadius === false || existing.isWithinRadius === false);
          const isPending = Boolean(
            isLate || isEarly || isOutsideRad ||
            existing.needsApproval || r.needsApproval ||
            existing.status === 'Pending Approval' || r.status === 'Pending Approval' ||
            existing.status === 'Terlambat' || r.status === 'Terlambat'
          );

          if (isPending) {
            let appType = existing.approvalType || r.approvalType || 'Terlambat';
            if (isLate && isEarly) appType = 'Terlambat & Pulang Awal';
            else if (isEarly) appType = 'Pulang Awal';
            else if (isOutsideRad) appType = 'Luar Radius';
            else if (isLate) appType = 'Terlambat';

            return {
              status: 'Pending Approval' as AttendanceRecord['status'],
              needsApproval: true,
              isApproved: false,
              approvalType: appType,
              potonganOtomatis: isLate ? (r.potonganOtomatis || existing.potonganOtomatis || 25000) : (r.potonganOtomatis || existing.potonganOtomatis || 0)
            };
          }

          return {
            status: 'Hadir' as AttendanceRecord['status'],
            needsApproval: false,
            isApproved: true,
            potonganOtomatis: 0
          };
        })()
      };
      map.set(groupKey, merged);
    }
  }

  return Array.from(map.values()).map(att => ({
    ...att,
    jamMasuk: sanitizeTimeString(att.jamMasuk, '08:00'),
    jamPulang: att.jamPulang ? sanitizeTimeString(att.jamPulang, '') : undefined
  })).sort((a, b) => {
    return (b.tanggal || '').localeCompare(a.tanggal || '');
  });
}

export const sortJenisPekerjaan = (data: JenisPekerjaan[]): JenisPekerjaan[] => {
  if (!Array.isArray(data)) return [];
  return [...data].sort((a, b) => {
    const jpA = (a.jenisPekerjaan || '').trim();
    const jpB = (b.jenisPekerjaan || '').trim();
    const compJp = jpA.localeCompare(jpB, 'id', { sensitivity: 'base', numeric: true });
    if (compJp !== 0) return compJp;
    
    const subA = (a.subPekerjaan || '').trim();
    const subB = (b.subPekerjaan || '').trim();
    return subA.localeCompare(subB, 'id', { sensitivity: 'base', numeric: true });
  });
};

/**
 * Robust boolean parser for spreadsheet, JSON, or form values
 * Handles true/false, "true"/"false", 1/0, "ya"/"tidak", "yes"/"no", checks, etc.
 */
export function isFieldTrue(val: any): boolean {
  if (val === true || val === 1) return true;
  if (val === false || val === 0 || val === null || val === undefined) return false;
  const s = String(val).toLowerCase().trim();
  return ['true', 'ya', 'yes', '1', 'y', 'v', '✓', 'si'].includes(s);
}

/**
 * Checks if a Jenis Pekerjaan requires Jumlah Titik input
 * Requires tarifTitik > 0 AND butuhInputTitik is true
 */
export function isJobNeedTitik(j: JenisPekerjaan | null | undefined): boolean {
  if (!j) return false;
  const tarif = Number(j.tarifTitik) || 0;
  return tarif > 0 && isFieldTrue(j.butuhInputTitik);
}

/**
 * Checks if a Jenis Pekerjaan requires Panjang Kabel input
 * Requires tarifTarikKabelPerMeter > 0 AND butuhPanjangKabel is true
 */
export function isJobNeedKabel(j: JenisPekerjaan | null | undefined): boolean {
  if (!j) return false;
  const tarif = Number(j.tarifTarikKabelPerMeter) || 0;
  return tarif > 0 && isFieldTrue(j.butuhPanjangKabel);
}

/**
 * Checks if a Jenis Pekerjaan supports multiple technicians
 */
export function isJobMulti(j: JenisPekerjaan | null | undefined): boolean {
  if (!j) return false;
  return isFieldTrue(j.isMultiTeknisi);
}

/**
 * Finds matching JenisPekerjaan from list with ID, name, or normalized alias match
 */
export function findJenisPekerjaan(key: string | undefined | null, list: JenisPekerjaan[]): JenisPekerjaan | null {
  if (!key || !list || list.length === 0) return null;
  const cleanKey = String(key).trim();
  const cleanLower = cleanKey.toLowerCase();
  const cleanNorm = cleanLower.replace(/[^a-z0-9]/g, '');

  // 1. Exact ID match
  const byId = list.find(j => j.id === cleanKey);
  if (byId) return byId;

  // 2. Exact SubPekerjaan match
  const bySub = list.find(j => j.subPekerjaan.toLowerCase().trim() === cleanLower);
  if (bySub) return bySub;

  // 3. Combined "Jenis - Sub" match
  const byComb = list.find(j => `${j.jenisPekerjaan} - ${j.subPekerjaan}`.toLowerCase().trim() === cleanLower);
  if (byComb) return byComb;

  // 4. Normalized alias match (handles "Ganti Router" vs "Ganti Router/ONT", slash spacing, etc.)
  const byNorm = list.find(j => {
    const jSubNorm = (j.subPekerjaan || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const jCombNorm = `${j.jenisPekerjaan || ''}${j.subPekerjaan || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    return jSubNorm === cleanNorm || jCombNorm === cleanNorm ||
           (cleanNorm.length >= 6 && (jSubNorm.includes(cleanNorm) || cleanNorm.includes(jSubNorm)));
  });
  if (byNorm) return byNorm;

  return null;
}

export const StorageService = {
  getEmployees: (): Employee[] => getStorage(STORAGE_KEYS.EMPLOYEES, initialEmployees),
  saveEmployees: (data: Employee[]) => {
    normalizedTechKeyCache.clear();
    setStorage(STORAGE_KEYS.EMPLOYEES, data);
  },

  getServers: (): ServerData[] => getStorage(STORAGE_KEYS.SERVERS, initialServers),
  saveServers: (data: ServerData[]) => setStorage(STORAGE_KEYS.SERVERS, data),

  getWilayah: (): WilayahPekerjaan[] => getStorage(STORAGE_KEYS.WILAYAH, initialWilayah),
  saveWilayah: (data: WilayahPekerjaan[]) => setStorage(STORAGE_KEYS.WILAYAH, data),

  getJenisPekerjaan: (): JenisPekerjaan[] => {
    const raw = getStorage(STORAGE_KEYS.JENIS_PEKERJAAN, initialJenisPekerjaan);
    // Pastikan flag butuhInputTitik & butuhPanjangKabel sinkron dengan tarif dan format boolean bersih
    const sanitized = (raw && raw.length > 0 ? raw : initialJenisPekerjaan).map(j => {
      const tarifTitik = Number(j.tarifTitik) || 0;
      const tarifKabel = Number(j.tarifTarikKabelPerMeter) || 0;
      const needTitik = tarifTitik > 0 && isFieldTrue(j.butuhInputTitik);
      const needKabel = tarifKabel > 0 && isFieldTrue(j.butuhPanjangKabel);
      const isMulti = isFieldTrue(j.isMultiTeknisi);
      return {
        ...j,
        tarifDasar: Number(j.tarifDasar) || 0,
        tarifTitik,
        tarifTarikKabelPerMeter: tarifKabel,
        tarifLemburPerMenit: Number(j.tarifLemburPerMenit) || 0,
        butuhInputTitik: needTitik,
        butuhPanjangKabel: needKabel,
        isMultiTeknisi: isMulti
      };
    });
    return sortJenisPekerjaan(sanitized);
  },
  saveJenisPekerjaan: (data: JenisPekerjaan[]) => setStorage(STORAGE_KEYS.JENIS_PEKERJAAN, sortJenisPekerjaan(data)),

  getJobs: (): JobRecord[] => {
    const data = getStorage(STORAGE_KEYS.JOBS, initialJobs);
    const cleaned = data.filter(j => !['job-1', 'job-2', 'job-3', 'job-demo-1', 'job-demo-2'].includes(j.id));
    const srvs = getStorage(STORAGE_KEYS.SERVERS, initialServers);
    const jenisList = StorageService.getJenisPekerjaan();
    const emps = getStorage(STORAGE_KEYS.EMPLOYEES, initialEmployees);
    let modified = false;
    const resolved = cleaned.map(j => {
      let updated = { ...j };
      if (!Array.isArray(updated.teknisiIds)) {
        updated.teknisiIds = updated.teknisiIds ? [String(updated.teknisiIds)] : ['emp-1'];
      }
      if (!Array.isArray(updated.teknisiNamas) || updated.teknisiNamas.length === 0) {
        updated.teknisiNamas = (updated.teknisiIds || []).map(id => emps.find(e => e.id === id)?.namaLengkap || id);
        if (updated.teknisiNamas.length === 0) {
          updated.teknisiNamas = ['Teknisi'];
        }
      }
      if (!Array.isArray(updated.wilayahNamas)) {
        updated.wilayahNamas = [];
      }

      const match = srvs.find(s => s.id === j.serverId || s.id === j.namaServer || s.namaServer === j.namaServer);
      if (match && j.namaServer !== match.namaServer) {
        modified = true;
        updated.namaServer = match.namaServer;
      }

      // Re-verify honor calculation with SOP:
      // Honor dasar diterima UTUH oleh masing-masing teknisi Tetap & Freelance (Magang = Rp 0).
      // Honor lembur diterima UTUH oleh masing-masing teknisi termasuk Magang.
      // Honor titik & kabel:
      // - Teknisi Tetap/Freelance dibagi HANYA sesama teknisi reguler (kehadiran magang TIDAK memotong).
      // - Teknisi Magang memperoleh 50% dari pembagian honor tersebut.
      const jp = findJenisPekerjaan(j.jenisPekerjaanId || j.subPekerjaanNama || j.jenisPekerjaanNama, jenisList);
      if (jp) {
        const tarifDasar = jp.tarifDasar || 0;
        const needTitik = isJobNeedTitik(jp);
        const needKabel = isJobNeedKabel(jp);
        const tarifTitik = needTitik ? (jp.tarifTitik || 0) : 0;
        const tarifKabel = needKabel ? (jp.tarifTarikKabelPerMeter || 0) : 0;
        const tarifLembur = jp.tarifLemburPerMenit || 0;

        const titik = needTitik ? (Number(j.jumlahTitik) || 0) : 0;
        const kabel = needKabel ? (Number(j.panjangKabelMeter) || 0) : 0;
        const lembur = (j.adaLembur || (j.menitLembur && j.menitLembur > 0)) ? (Number(j.menitLembur) || 0) : 0;

        const techObjs = (j.teknisiIds || []).map(id => emps.find(e => e.id === id));
        const magangTechs = techObjs.filter(t => t?.status === 'Magang');
        const regularTechs = techObjs.filter(t => t?.status !== 'Magang');
        const magangCount = magangTechs.length;
        const regularCount = regularTechs.length;

        const dasarPerTech = tarifDasar;
        const lemburPerTech = tarifLembur * lembur;
        const totalTitik = tarifTitik * titik;
        const totalKabel = tarifKabel * kabel;

        let regularPointShare = 0;
        let regularCableShare = 0;
        let magangPointShare = 0;
        let magangCableShare = 0;

        if (regularCount > 0) {
          regularPointShare = Math.round(totalTitik / regularCount);
          regularCableShare = Math.round(totalKabel / regularCount);
          const effectiveMagang = Math.max(1, magangCount);
          magangPointShare = Math.round((regularPointShare * 0.5) / effectiveMagang);
          magangCableShare = Math.round((regularCableShare * 0.5) / effectiveMagang);
        } else {
          const effectiveMagang = Math.max(1, magangCount);
          magangPointShare = Math.round((totalTitik * 0.5) / effectiveMagang);
          magangCableShare = Math.round((totalKabel * 0.5) / effectiveMagang);
        }

        const regularWorkTotal = dasarPerTech + lemburPerTech + regularPointShare + regularCableShare;
        const magangWorkTotal = 0 + lemburPerTech + magangPointShare + magangCableShare;

        const expectedTotal = (regularWorkTotal * regularCount) + (magangWorkTotal * magangCount);
        const mainTech = emps.find(e => e.id === (j.teknisiIds?.[0]));
        const expectedPerTech = mainTech?.status === 'Magang' ? magangWorkTotal : regularWorkTotal;

        if (j.honorPerTeknisi !== expectedPerTech || j.estimasiTotalHonor !== expectedTotal) {
          modified = true;
          updated.honorPerTeknisi = expectedPerTech;
          updated.estimasiTotalHonor = expectedTotal;
        }
      }

      return updated;
    });
    if (cleaned.length !== data.length || modified) {
      setStorage(STORAGE_KEYS.JOBS, resolved);
    }
    return resolved;
  },
  saveJobs: (data: JobRecord[]) => setStorage(STORAGE_KEYS.JOBS, data),

  getPlanning: (): PlanningTask[] => {
    const data = getStorage(STORAGE_KEYS.PLANNING, initialPlanning);
    // Filter out old legacy mock seed planning tasks (e.g. Hendra, Klender, plan-1, plan-2)
    const cleaned = data.filter(p => 
      !['plan-1', 'plan-2', 'plan-3', 'plan-demo-1', 'plan-demo-2'].includes(p.id) &&
      !p.detailPekerjaan?.includes('Hendra') &&
      !p.detailPekerjaan?.includes('Klender')
    );
    if (cleaned.length !== data.length) {
      setStorage(STORAGE_KEYS.PLANNING, cleaned);
    }
    return cleaned;
  },
  savePlanning: (data: PlanningTask[]) => setStorage(STORAGE_KEYS.PLANNING, data),

  getAttendance: (): AttendanceRecord[] => {
    const data = getStorage(STORAGE_KEYS.ATTENDANCE, initialAttendance);
    // Filter out old legacy mock seed data if still present in localStorage
    const cleaned = data.filter(a => !['att-1', 'att-2', 'att-3', 'att-demo-1', 'att-demo-2'].includes(a.id));
    const consolidated = consolidateAttendanceRecords(cleaned);
    if (consolidated.length !== data.length || JSON.stringify(consolidated) !== JSON.stringify(data)) {
      setStorage(STORAGE_KEYS.ATTENDANCE, consolidated);
    }
    return consolidated;
  },
  saveAttendance: (data: AttendanceRecord[]) => {
    const consolidated = consolidateAttendanceRecords(data);
    setStorage(STORAGE_KEYS.ATTENDANCE, consolidated);
  },

  getDeletedAttendanceIds: (): string[] => {
    return getStorage<string[]>(STORAGE_KEYS.DELETED_ATTENDANCE, ['att-1788758276968']);
  },

  addDeletedAttendanceId: (id: string) => {
    if (!id) return;
    const current = StorageService.getDeletedAttendanceIds();
    if (!current.includes(id)) {
      setStorage(STORAGE_KEYS.DELETED_ATTENDANCE, [...current, id]);
    }
  },

  setDeletedAttendanceIds: (ids: string[]) => {
    if (!Array.isArray(ids)) return;
    const set = new Set(ids.filter(Boolean));
    setStorage(STORAGE_KEYS.DELETED_ATTENDANCE, Array.from(set));
  },

  getResolvedAttendanceKeys: (): string[] => {
    const raw = getStorage<string[]>(STORAGE_KEYS.RESOLVED_ATTENDANCE, []);
    // Keamanan: Hanya izinkan key yang terikat tanggal spesifik (format YYYY-MM-DD) atau ID record (att- / row-)
    // Bare technician ID atau nama tanpa tanggal TIDAK BOLEH dianggap resolved agar keterlambatan di hari berikutnya selalu wajib approval
    return raw.filter(k => {
      if (!k) return false;
      const clean = k.trim().toLowerCase();
      const hasDate = /\d{4}-\d{2}-\d{2}/.test(clean);
      const isRecordId = clean.startsWith('att-') || clean.startsWith('row-');
      return hasDate || isRecordId;
    });
  },

  addResolvedAttendanceKey: (key: string) => {
    if (!key) return;
    const clean = key.trim().toLowerCase();
    const hasDate = /\d{4}-\d{2}-\d{2}/.test(clean);
    const isRecordId = clean.startsWith('att-') || clean.startsWith('row-');
    if (!hasDate && !isRecordId) return; // Tolak bare tech key

    const current = StorageService.getResolvedAttendanceKeys();
    if (!current.includes(clean)) {
      setStorage(STORAGE_KEYS.RESOLVED_ATTENDANCE, [...current, clean]);
    }
  },

  addResolvedAttendanceKeys: (keys: string[]) => {
    if (!keys || keys.length === 0) return;
    const current = StorageService.getResolvedAttendanceKeys();
    const cleanKeys = keys
      .map(k => (k || '').trim().toLowerCase())
      .filter(k => {
        if (!k) return false;
        const hasDate = /\d{4}-\d{2}-\d{2}/.test(k);
        const isRecordId = k.startsWith('att-') || k.startsWith('row-');
        return hasDate || isRecordId;
      });
    const set = new Set([...current, ...cleanKeys]);
    setStorage(STORAGE_KEYS.RESOLVED_ATTENDANCE, Array.from(set));
  },

  removeResolvedAttendanceKey: (key: string) => {
    if (!key) return;
    const current = StorageService.getResolvedAttendanceKeys();
    const clean = key.trim().toLowerCase();
    setStorage(STORAGE_KEYS.RESOLVED_ATTENDANCE, current.filter(k => k !== clean));
  },

  // Lembur Approval persistent tracking across reloads & devices
  getApprovedLemburMap: (): Record<string, { approved: boolean; approvedBy?: string; approvedAt?: string }> => {
    return getStorage<Record<string, { approved: boolean; approvedBy?: string; approvedAt?: string }>>(
      STORAGE_KEYS.APPROVED_LEMBUR,
      {}
    );
  },

  setLemburApproval: (jobId: string, approved: boolean, approvedBy?: string, approvedAt?: string) => {
    if (!jobId) return;
    const map = StorageService.getApprovedLemburMap();
    map[jobId] = {
      approved,
      approvedBy: approved ? (approvedBy || 'Admin') : undefined,
      approvedAt: approved ? (approvedAt || new Date().toISOString()) : undefined
    };
    setStorage(STORAGE_KEYS.APPROVED_LEMBUR, map);
  },

  isLemburApproved: (jobId: string): boolean => {
    const map = StorageService.getApprovedLemburMap();
    return Boolean(map[jobId]?.approved);
  },

  setApprovedLemburMap: (map: Record<string, any>) => {
    if (!map || typeof map !== 'object') return;
    const current = StorageService.getApprovedLemburMap();
    setStorage(STORAGE_KEYS.APPROVED_LEMBUR, { ...current, ...map });
  },

  getLeave: (): LeaveRequest[] => {
    const data = getStorage(STORAGE_KEYS.LEAVE, initialLeave);
    // Filter out old legacy mock seed data if still present in localStorage
    const cleaned = data.filter(l => !['leave-1', 'leave-2', 'leave-demo-1'].includes(l.id));
    if (cleaned.length !== data.length) {
      setStorage(STORAGE_KEYS.LEAVE, cleaned);
    }
    return cleaned;
  },
  saveLeave: (data: LeaveRequest[]) => setStorage(STORAGE_KEYS.LEAVE, data),

  getPotonganManual: (): PotonganManual[] => {
    return getStorage<PotonganManual[]>(STORAGE_KEYS.POTONGAN_MANUAL, []);
  },
  savePotonganManual: (data: PotonganManual[]) => setStorage(STORAGE_KEYS.POTONGAN_MANUAL, data),

  getHonorLunas: (): HonorLunasRecord[] => {
    return getStorage<HonorLunasRecord[]>(STORAGE_KEYS.HONOR_LUNAS, []);
  },
  saveHonorLunas: (data: HonorLunasRecord[]) => setStorage(STORAGE_KEYS.HONOR_LUNAS, data),

  getSettings: (): AppSettings => {
    const s = getStorage(STORAGE_KEYS.SETTINGS, initialSettings);
    const scriptUrl = (s.googleAppsScriptUrl && s.googleAppsScriptUrl.trim()) || DEFAULT_GOOGLE_APPS_SCRIPT_URL;
    return {
      ...initialSettings,
      ...s,
      googleAppsScriptUrl: scriptUrl,
      isGoogleSheetConnected: Boolean(scriptUrl && scriptUrl.trim()),
      jamMasukDefinisikan: sanitizeTimeString(s.jamMasukDefinisikan, '08:00'),
      jamPulangDefinisikan: sanitizeTimeString(s.jamPulangDefinisikan, '17:00')
    };
  },
  saveSettings: (data: AppSettings) => {
    const sanitized: AppSettings = {
      ...data,
      jamMasukDefinisikan: sanitizeTimeString(data.jamMasukDefinisikan, '08:00'),
      jamPulangDefinisikan: sanitizeTimeString(data.jamPulangDefinisikan, '17:00')
    };
    setStorage(STORAGE_KEYS.SETTINGS, sanitized);
  },

  getCurrentUser: (): Employee | null => {
    // 1. Primary: In-memory cache & localStorage
    const user = getStorage<Employee | null>(STORAGE_KEYS.CURRENT_USER, null);
    if (user && user.id) return user;

    // 2. Secondary: sessionStorage
    if (typeof window !== 'undefined') {
      try {
        const sess = sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        if (sess) {
          const parsed = JSON.parse(sess);
          if (parsed && parsed.id) {
            setStorage(STORAGE_KEYS.CURRENT_USER, parsed);
            return parsed;
          }
        }
      } catch {}
    }

    // 3. Tertiary: Persistent Cookie (Crucial for smartphone Safari / Chrome / PWA reload reliability)
    if (typeof document !== 'undefined') {
      try {
        const match = document.cookie.match(new RegExp('(^|;\\s*)' + 'dpt_aladin_auth_session' + '=([^;]+)'));
        if (match && match[2]) {
          const decoded = decodeURIComponent(match[2]);
          const parsed = JSON.parse(decoded);
          if (parsed && parsed.id) {
            setStorage(STORAGE_KEYS.CURRENT_USER, parsed);
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  },
  saveCurrentUser: (user: Employee | null) => {
    setStorage(STORAGE_KEYS.CURRENT_USER, user);
    if (typeof window !== 'undefined') {
      try {
        if (user) {
          sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
          const cookieVal = encodeURIComponent(JSON.stringify(user));
          document.cookie = `dpt_aladin_auth_session=${cookieVal}; max-age=31536000; path=/; SameSite=Lax`;
        } else {
          sessionStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          document.cookie = 'dpt_aladin_auth_session=; max-age=0; path=/; SameSite=Lax';
        }
      } catch {}
    }
  },

  // Local User Profile Photos (Stored securely in local device storage without modifying Google Sheets)
  getProfilePhotoMap: (): Record<string, string> => {
    return getStorage<Record<string, string>>(STORAGE_KEYS.PROFILE_PHOTOS, {});
  },
  getUserProfilePhoto: (userIdOrUsername?: string | null): string => {
    if (!userIdOrUsername) return '';
    const map = StorageService.getProfilePhotoMap();
    const rawKey = String(userIdOrUsername).trim();
    return map[rawKey] || map[rawKey.toLowerCase()] || '';
  },
  saveUserProfilePhoto: (userIdOrUsername: string, photoBase64: string) => {
    if (!userIdOrUsername) return;
    const map = StorageService.getProfilePhotoMap();
    const rawKey = String(userIdOrUsername).trim();
    map[rawKey] = photoBase64;
    map[rawKey.toLowerCase()] = photoBase64;
    setStorage(STORAGE_KEYS.PROFILE_PHOTOS, map);
  },
  removeUserProfilePhoto: (userIdOrUsername: string) => {
    if (!userIdOrUsername) return;
    const map = StorageService.getProfilePhotoMap();
    const rawKey = String(userIdOrUsername).trim();
    delete map[rawKey];
    delete map[rawKey.toLowerCase()];
    setStorage(STORAGE_KEYS.PROFILE_PHOTOS, map);
  },

  // Server-side State Synchronization (for cross-device access: PC, HP Teknisi, Tablet)
  fetchServerBootstrap: async (): Promise<any> => {
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const json = await res.json();
        return json?.data || null;
      }
    } catch (err) {
      console.warn('Server bootstrap unavailable, fallback to local storage:', err);
    }
    return null;
  },

  syncServerState: async (state: any) => {
    try {
      const resolvedKeys = StorageService.getResolvedAttendanceKeys();
      const deletedIds = StorageService.getDeletedAttendanceIds();
      const approvedLembur = StorageService.getApprovedLemburMap();
      await fetch('/api/sync/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...state,
          resolvedAttendanceKeys: state.resolvedAttendanceKeys || resolvedKeys,
          deletedAttendanceIds: state.deletedAttendanceIds || deletedIds,
          approvedLemburMap: state.approvedLemburMap || approvedLembur
        })
      });
    } catch (err) {
      console.warn('Failed to sync state to server:', err);
    }
  },

  syncServerSettings: async (settings: AppSettings) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch (err) {
      console.warn('Failed to sync settings to server:', err);
    }
  },

  // Technician / User Presence Tracking
  sendPresenceHeartbeat: async (user: {
    id: string;
    namaLengkap: string;
    role: string;
    serverId?: string;
    namaServer?: string;
    username?: string;
    password?: string;
  }) => {
    try {
      // BroadcastChannel for instant local cross-tab notification
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('app_presence_channel');
          bc.postMessage({ type: 'HEARTBEAT', user, timestamp: Date.now() });
          bc.close();
        } catch {}
      }

      const res = await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (res.ok) {
        const json = await res.json();
        return {
          success: true,
          onlineTechnicians: (json?.onlineTechnicians as Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>) || [],
          onlineUsers: (json?.onlineUsers as Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>) || [],
          sessionInvalid: Boolean(json?.sessionInvalid),
          reason: json?.reason as string | undefined
        };
      }
    } catch {
      // Fallback silently
    }
    return null;
  },

  fetchActivePresences: async () => {
    try {
      const res = await fetch('/api/presence/active');
      if (res.ok) {
        const json = await res.json();
        return {
          onlineTechnicians: (json?.onlineTechnicians as Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>) || [],
          onlineUsers: (json?.onlineUsers as Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>) || []
        };
      }
    } catch {
      // Fallback silently
    }
    return null;
  },

  sendPresenceLeave: async (userId: string) => {
    if (!userId) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ id: userId })], { type: 'application/json' });
        navigator.sendBeacon('/api/presence/leave', blob);
      } else {
        await fetch('/api/presence/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId }),
          keepalive: true
        });
      }
    } catch {
      // Fallback silently
    }
  },

  resetToDefault: () => {
    storageMemoryCache.clear();
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEES);
    localStorage.removeItem(STORAGE_KEYS.SERVERS);
    localStorage.removeItem(STORAGE_KEYS.WILAYAH);
    localStorage.removeItem(STORAGE_KEYS.JENIS_PEKERJAAN);
    localStorage.removeItem(STORAGE_KEYS.JOBS);
    localStorage.removeItem(STORAGE_KEYS.PLANNING);
    localStorage.removeItem(STORAGE_KEYS.ATTENDANCE);
    localStorage.removeItem(STORAGE_KEYS.LEAVE);
    localStorage.removeItem(STORAGE_KEYS.POTONGAN_MANUAL);
    localStorage.removeItem(STORAGE_KEYS.HONOR_LUNAS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.APPROVED_LEMBUR);
    if (typeof document !== 'undefined') {
      document.cookie = 'dpt_aladin_auth_session=; max-age=0; path=/; SameSite=Lax';
    }
  },

  // Google Sheets Asynchronous Sync helper
  syncWithGoogleSheets: async (scriptUrl: string) => {
    if (!scriptUrl) throw new Error('URL Google Apps Script belum diatur');
    
    // Test payload ping
    const res = await fetch(scriptUrl + '?action=ping', { method: 'GET' });
    const json = await res.json();
    return json;
  },

  // Real-time Notifications API (Technician Online, Attendance, Planning, Job Input)
  publishAdminNotification: async (notif: {
    type: 'technician_online' | 'attendance_submitted' | 'planning_created' | 'job_submitted';
    title: string;
    body: string;
    data?: any;
  }): Promise<void> => {
    // Broadcast locally across browser tabs immediately
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('app_notification_channel');
        bc.postMessage({
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...notif,
          timestamp: Date.now()
        });
        bc.close();
      } catch {}
    }

    try {
      await fetch('/api/notifications/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notif)
      });
    } catch (err) {
      console.warn('Failed to publish notification event:', err);
    }
  },

  pollAdminNotifications: async (since: number = 0): Promise<AdminNotificationEvent[]> => {
    try {
      const res = await fetch(`/api/notifications/admin?since=${since}`);
      if (res.ok) {
        const json = await res.json();
        return (json?.events as AdminNotificationEvent[]) || [];
      }
    } catch {
      // Return empty array silently on network lag
    }
    return [];
  },

  // Fetch 24-hour hourly trend of online technicians
  fetchHourlyPresenceTrend: async (serverId?: string): Promise<{
    trend: Array<{
      hour: string;
      hourNum: number;
      fullLabel: string;
      timestamp: number;
      onlineCount: number;
      technicians: string[];
      serverBreakdown: Record<string, number>;
    }>;
    summary: {
      peakHour: string;
      peakCount: number;
      averageCount: number;
      currentOnline: number;
      totalActive24h: number;
    };
  } | null> => {
    try {
      const q = serverId && serverId !== 'all' ? `?serverId=${encodeURIComponent(serverId)}` : '';
      const res = await fetch(`/api/presence/hourly-trend${q}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.trend)) {
          return {
            trend: json.trend,
            summary: json.summary || {
              peakHour: '00:00',
              peakCount: 0,
              averageCount: 0,
              currentOnline: 0,
              totalActive24h: 0
            }
          };
        }
      }
    } catch {
      // Ignore network fail
    }
    return null;
  },

  // Form Draft Persistence Helpers to guarantee zero data loss during input
  getJobDraft: (): any => {
    return getStorage(STORAGE_KEYS.JOB_DRAFT, null);
  },
  saveJobDraft: (draft: any): void => {
    setStorage(STORAGE_KEYS.JOB_DRAFT, draft);
  },
  clearJobDraft: (): void => {
    setStorage(STORAGE_KEYS.JOB_DRAFT, null);
  },

  getAttendanceDraft: (techId: string = 'default'): any => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.ATTENDANCE_DRAFT, {});
    return all[techId] || null;
  },
  saveAttendanceDraft: (draft: any, techId: string = 'default'): void => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.ATTENDANCE_DRAFT, {});
    all[techId] = draft;
    setStorage(STORAGE_KEYS.ATTENDANCE_DRAFT, all);
  },
  clearAttendanceDraft: (techId: string = 'default'): void => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.ATTENDANCE_DRAFT, {});
    delete all[techId];
    setStorage(STORAGE_KEYS.ATTENDANCE_DRAFT, all);
  },

  getLeaveDraft: (techId: string = 'default'): any => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.LEAVE_DRAFT, {});
    return all[techId] || null;
  },
  saveLeaveDraft: (draft: any, techId: string = 'default'): void => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.LEAVE_DRAFT, {});
    all[techId] = draft;
    setStorage(STORAGE_KEYS.LEAVE_DRAFT, all);
  },
  clearLeaveDraft: (techId: string = 'default'): void => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.LEAVE_DRAFT, {});
    delete all[techId];
    setStorage(STORAGE_KEYS.LEAVE_DRAFT, all);
  },

  getManualAttendanceDraft: (): any => {
    return getStorage(STORAGE_KEYS.MANUAL_ATTENDANCE_DRAFT, null);
  },
  saveManualAttendanceDraft: (draft: any): void => {
    setStorage(STORAGE_KEYS.MANUAL_ATTENDANCE_DRAFT, draft);
  },
  clearManualAttendanceDraft: (): void => {
    setStorage(STORAGE_KEYS.MANUAL_ATTENDANCE_DRAFT, null);
  },

  getMasterDataDraft: (tab: string): any => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.MASTER_DATA_DRAFT, {});
    return all[tab] || null;
  },
  saveMasterDataDraft: (tab: string, draft: any): void => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.MASTER_DATA_DRAFT, {});
    all[tab] = draft;
    setStorage(STORAGE_KEYS.MASTER_DATA_DRAFT, all);
  },
  clearMasterDataDraft: (tab: string): void => {
    const all = getStorage<Record<string, any>>(STORAGE_KEYS.MASTER_DATA_DRAFT, {});
    delete all[tab];
    setStorage(STORAGE_KEYS.MASTER_DATA_DRAFT, all);
  },

  getPlanningDraft: (): any => {
    return getStorage(STORAGE_KEYS.PLANNING_DRAFT, null);
  },
  savePlanningDraft: (draft: any): void => {
    setStorage(STORAGE_KEYS.PLANNING_DRAFT, draft);
  },
  clearPlanningDraft: (): void => {
    setStorage(STORAGE_KEYS.PLANNING_DRAFT, null);
  },

  getQuickJobModalOpen: (): boolean => {
    return Boolean(getStorage(STORAGE_KEYS.QUICK_JOB_MODAL_OPEN, false));
  },
  saveQuickJobModalOpen: (isOpen: boolean): void => {
    setStorage(STORAGE_KEYS.QUICK_JOB_MODAL_OPEN, isOpen);
  }
};
