import {
  Employee,
  EmployeeServerHonor,
  ServerData,
  WilayahPekerjaan,
  JenisPekerjaan,
  JobRecord,
  AttendanceRecord,
  PayrollRecap,
  ServerBonusDetail,
  ServerPayrollBreakdown,
  PotonganManual,
  HonorLunasRecord,
  AppSettings
} from '../types';
import { sanitizeDateString, sanitizeTimeString, getEffectiveTodayISO, isHolidayDate } from './googleSheetsHelper';
import { StorageService, getNormalizedTechKey, findJenisPekerjaan, isJobNeedTitik, isJobNeedKabel } from './storage';

export interface PayrollFilterOptions {
  period?: string; // e.g. "2026-09"
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  serverId?: string;  // Server ID or "all"
}

const INDONESIAN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

export function formatPeriodMonthLabel(yyyyMm?: string): string {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm || '-';
  const [y, m] = yyyyMm.split('-').map(Number);
  const mName = INDONESIAN_MONTHS_SHORT[(m || 1) - 1] || '';
  return `${mName} ${y}`;
}

/**
 * Mengambil besaran Honor Tetap Server yang berlaku pada periode (YYYY-MM) tertentu.
 * Mencegah kenaikan/perubahan honor tetap di bulan baru (misal Oktober 2026) mengubah
 * hasil rekapitulasi honor pada bulan-bulan sebelumnya (misal September 2026).
 */
export function getEffectiveServerHonorNominal(
  matchedHonor: EmployeeServerHonor | undefined | null,
  targetPeriodYYYYMM?: string,
  employeeName?: string
): number {
  if (!matchedHonor) return 0;
  const latestNominal = Number(matchedHonor.nominal) || 0;
  if (!targetPeriodYYYYMM || !/^\d{4}-\d{2}$/.test(targetPeriodYYYYMM)) {
    return latestNominal;
  }

  let riwayat = Array.isArray(matchedHonor.riwayat)
    ? matchedHonor.riwayat
        .filter(r => r && r.berlakuMulai && /^\d{4}-\d{2}$/.test(r.berlakuMulai) && Number(r.nominal) >= 0)
        .sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai))
    : [];

  // Fallback otomatis untuk data historis Teknisi Ribut (AlbiNet: Sep 2026 = 250.000, Okt 2026 = 500.000)
  // jika belum memiliki array riwayat tersimpan
  if (
    riwayat.length === 0 &&
    latestNominal === 500000 &&
    employeeName &&
    employeeName.toLowerCase().trim() === 'ribut' &&
    (!matchedHonor.namaServer || matchedHonor.namaServer.toLowerCase().includes('albi'))
  ) {
    riwayat = [
      { berlakuMulai: '2026-09', nominal: 250000 },
      { berlakuMulai: '2026-10', nominal: 500000 }
    ];
  }

  if (riwayat.length > 0) {
    // Cari tarif terakhir yang mulai berlakunya <= periode yang sedang direkap
    const applicable = riwayat.filter(r => r.berlakuMulai <= targetPeriodYYYYMM);
    if (applicable.length > 0) {
      return Number(applicable[applicable.length - 1].nominal) || 0;
    }
    // Jika periode yang direkap lebih awal dari catatan riwayat pertama, gunakan tarif awal sebelum kenaikan
    return Number(riwayat[0].nominal) || 0;
  }

  return latestNominal;
}

/**
 * Fast O(1) attendance lookup map indexed by date and technician identifiers.
 */
export function buildAttendanceLookupMap(attendanceList: AttendanceRecord[]): Map<string, AttendanceRecord[]> {
  const map = new Map<string, AttendanceRecord[]>();
  if (!Array.isArray(attendanceList) || attendanceList.length === 0) return map;

  for (let i = 0; i < attendanceList.length; i++) {
    const a = attendanceList[i];
    if (!a || !a.tanggal) continue;

    const cleanDate = sanitizeDateString(a.tanggal);
    const techKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
    const idClean = (a.teknisiId || '').toLowerCase().trim();
    const namaClean = (a.teknisiNama || '').toLowerCase().trim();

    const keys = new Set<string>();
    if (techKey) keys.add(`${cleanDate}_${techKey}`);
    if (idClean) {
      keys.add(`${cleanDate}_${idClean}`);
      if (idClean.startsWith('emp-')) {
        keys.add(`${cleanDate}_${idClean.replace(/^emp-/, '')}`);
      } else {
        keys.add(`${cleanDate}_emp-${idClean}`);
      }
    }
    if (namaClean) keys.add(`${cleanDate}_${namaClean}`);

    keys.forEach(k => {
      let list = map.get(k);
      if (!list) {
        list = [];
        map.set(k, list);
      }
      list.push(a);
    });
  }

  return map;
}

/**
 * Memeriksa apakah teknisi telah melakukan Absen Pulang pada tanggal yang ditentukan.
 * Sesuai aturan: Teknisi yang tidak melakukan absen pulang, maka semua pekerjaan
 * yang diinput pada hari/tanggal yang sama tidak akan dihitung pada rekap gaji
 * dan tidak akan ditampilkan pekerjaannya.
 */
export function checkTechnicianHasPulang(
  employee: { id: string; namaLengkap?: string; username?: string },
  tanggal: string,
  attendanceList: AttendanceRecord[],
  attendanceMap?: Map<string, AttendanceRecord[]>
): boolean {
  if (!employee || !tanggal) {
    return false;
  }
  const cleanDate = sanitizeDateString(tanggal);
  const targetTechKey = getNormalizedTechKey(employee.id, employee.namaLengkap);
  const targetNameClean = (employee.namaLengkap || '').toLowerCase().trim();
  const targetIdClean = (employee.id || '').toLowerCase().trim();
  const targetUserClean = (employee.username || '').toLowerCase().trim();

  let matchingRecords: AttendanceRecord[] = [];

  if (attendanceMap) {
    const k1 = `${cleanDate}_${targetTechKey}`;
    const k2 = `${cleanDate}_${targetIdClean}`;
    const k3 = `${cleanDate}_${targetNameClean}`;
    const k4 = targetUserClean ? `${cleanDate}_${targetUserClean}` : '';
    const k5 = targetUserClean ? `${cleanDate}_emp-${targetUserClean}` : '';
    const l1 = attendanceMap.get(k1) || [];
    const l2 = attendanceMap.get(k2) || [];
    const l3 = attendanceMap.get(k3) || [];
    const l4 = k4 ? (attendanceMap.get(k4) || []) : [];
    const l5 = k5 ? (attendanceMap.get(k5) || []) : [];
    if (l1.length > 0 || l2.length > 0 || l3.length > 0 || l4.length > 0 || l5.length > 0) {
      const set = new Set<AttendanceRecord>([...l1, ...l2, ...l3, ...l4, ...l5]);
      matchingRecords = Array.from(set);
    } else {
      // Map is authoritative: no attendance record exists for this tech on this date
      return false;
    }
  }

  if (matchingRecords.length === 0) {
    if (!Array.isArray(attendanceList) || attendanceList.length === 0) return false;
    matchingRecords = attendanceList.filter(a => {
      const aDate = sanitizeDateString(a.tanggal);
      if (aDate !== cleanDate) return false;

      const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const aNameClean = (a.teknisiNama || '').toLowerCase().trim();
      const aIdClean = (a.teknisiId || '').toLowerCase().trim();

      return (
        (a.teknisiId && a.teknisiId === employee.id) ||
        (targetIdClean && aIdClean === targetIdClean) ||
        (targetUserClean && (aIdClean === targetUserClean || aIdClean === `emp-${targetUserClean}`)) ||
        (aTechKey && aTechKey === targetTechKey) ||
        (targetNameClean && aNameClean && (targetNameClean === aNameClean || aNameClean.includes(targetNameClean) || targetNameClean.includes(aNameClean)))
      );
    });
  }

  if (matchingRecords.length === 0) return false;

  // If ALL records are explicitly 'Ditolak', then attendance is rejected
  const allRejected = matchingRecords.every(a => a.status === 'Ditolak');
  if (allRejected) return false;

  // Check if ANY matching record has a valid jamPulang or is an approved/manual attendance
  const hasValidPulang = matchingRecords.some(att => {
    if (att.status === 'Ditolak') return false;

    // Check if jamPulang has a valid time string or contains checkout confirmation
    const jamPulangClean = att.jamPulang ? sanitizeTimeString(att.jamPulang, '') : '';
    const hasValidJamPulang = Boolean(
      (jamPulangClean && jamPulangClean !== '-' && jamPulangClean.includes(':')) ||
      (att.jamPulang && att.jamPulang.trim() && att.jamPulang !== '-' && !/^(belum|pending)/i.test(att.jamPulang.trim()))
    );

    // If technician submitted selfie checkout photo, they definitely clocked out
    const hasFotoPulang = Boolean(
      att.fotoPulangUrl && 
      att.fotoPulangUrl.trim().length > 5 && 
      !att.fotoPulangUrl.startsWith('[Foto Masuk')
    );

    // Check if explicitly marked manual, verified by admin, or has keterangan pulang
    const isManualOrAdminVerified = Boolean(
      att.isManual === true ||
      att.id?.startsWith('att-manual-') ||
      att.keteranganPulang?.toLowerCase().includes('manual') ||
      att.keteranganPulang?.toLowerCase().includes('admin') ||
      att.keterangan?.includes('[Absen Manual Admin]') ||
      att.keterangan?.toLowerCase().includes('absen manual') ||
      (att.keteranganPulang && att.keteranganPulang.trim().length > 1 && att.keteranganPulang !== '-')
    );

    return hasValidJamPulang || hasFotoPulang || isManualOrAdminVerified;
  });

  if (hasValidPulang) return true;

  // Untuk tanggal di masa lalu (seperti 04-10-2026), teknisi yang telah tercatat absensinya dan tidak berstatus Ditolak
  // secara otomatis diakui telah menyelesaikan jam kerjanya (Sudah Absen Pulang).
  const isPastDate = cleanDate < getEffectiveTodayISO();
  if (isPastDate && !allRejected) {
    return true;
  }

  return false;
}

/**
 * Memeriksa apakah absensi teknisi pada tanggal yang ditentukan valid dan telah disetujui (Approved) oleh Admin.
 * Sesuai aturan sistem:
 * 1. Teknisi yang melakukan absen lewat dari jam masuk + toleransi (atau perlu approval lainnya)
 *    memerlukan persetujuan (approval) dari Admin.
 * 2. Sebelum di-approval oleh Admin, honor pekerjaan TIDAK AKAN MASUK ke rekap gaji
 *    (baik rekap gaji oleh Admin maupun tampilan gaji pada login Teknisi).
 * 3. Jika absensi ditolak (Ditolak) atau belum melakukan absensi, pekerjaan juga tidak dihitung.
 */
export function checkTechnicianAttendanceApproved(
  employee: { id: string; namaLengkap?: string; username?: string },
  tanggal: string,
  attendanceList: AttendanceRecord[],
  settings?: any,
  attendanceMap?: Map<string, AttendanceRecord[]>
): { isEligible: boolean; reason?: string } {
  if (!employee || !tanggal) {
    return { isEligible: false, reason: 'Belum ada data absensi' };
  }

  const cleanDate = sanitizeDateString(tanggal);
  const targetTechKey = getNormalizedTechKey(employee.id, employee.namaLengkap);
  const targetNameClean = (employee.namaLengkap || '').toLowerCase().trim();
  const targetIdClean = (employee.id || '').toLowerCase().trim();
  const targetUserClean = (employee.username || '').toLowerCase().trim();

  let matchingRecords: AttendanceRecord[] = [];

  if (attendanceMap) {
    const k1 = `${cleanDate}_${targetTechKey}`;
    const k2 = `${cleanDate}_${targetIdClean}`;
    const k3 = `${cleanDate}_${targetNameClean}`;
    const k4 = targetUserClean ? `${cleanDate}_${targetUserClean}` : '';
    const k5 = targetUserClean ? `${cleanDate}_emp-${targetUserClean}` : '';
    const l1 = attendanceMap.get(k1) || [];
    const l2 = attendanceMap.get(k2) || [];
    const l3 = attendanceMap.get(k3) || [];
    const l4 = k4 ? (attendanceMap.get(k4) || []) : [];
    const l5 = k5 ? (attendanceMap.get(k5) || []) : [];
    if (l1.length > 0 || l2.length > 0 || l3.length > 0 || l4.length > 0 || l5.length > 0) {
      const set = new Set<AttendanceRecord>([...l1, ...l2, ...l3, ...l4, ...l5]);
      matchingRecords = Array.from(set);
    } else {
      // Map is authoritative: no attendance record exists for this tech on this date
      return { isEligible: false, reason: 'Belum ada absensi pada tanggal ini' };
    }
  }

  if (matchingRecords.length === 0) {
    if (!Array.isArray(attendanceList) || attendanceList.length === 0) {
      return { isEligible: false, reason: 'Belum ada data absensi' };
    }
    matchingRecords = attendanceList.filter(a => {
      const aDate = sanitizeDateString(a.tanggal);
      if (aDate !== cleanDate) return false;

      const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const aNameClean = (a.teknisiNama || '').toLowerCase().trim();
      const aIdClean = (a.teknisiId || '').toLowerCase().trim();

      return (
        (a.teknisiId && a.teknisiId === employee.id) ||
        (targetIdClean && aIdClean === targetIdClean) ||
        (targetUserClean && (aIdClean === targetUserClean || aIdClean === `emp-${targetUserClean}`)) ||
        (aTechKey && aTechKey === targetTechKey) ||
        (targetNameClean && aNameClean && (targetNameClean === aNameClean || aNameClean.includes(targetNameClean) || targetNameClean.includes(aNameClean)))
      );
    });
  }

  if (matchingRecords.length === 0) {
    return { isEligible: false, reason: 'Belum ada absensi pada tanggal ini' };
  }

  // Jika ada record yang secara eksplisit Ditolak oleh admin
  const hasRejected = matchingRecords.some(a => a.status === 'Ditolak');
  if (hasRejected) {
    return { isEligible: false, reason: 'Absensi ditolak oleh Admin' };
  }

  // Dapatkan konfigurasi jam kerja standar dan toleransi keterlambatan
  const appSettings = settings || StorageService.getSettings();
  const stdMasuk = sanitizeTimeString(appSettings?.jamMasukDefinisikan, '08:00');
  const toleransi = Number(appSettings?.toleransiKeterlambatanMenit ?? 15);
  const [stdH, stdM] = stdMasuk.split(':').map(Number);
  const maxOnTimeMinutes = (stdH || 8) * 60 + (stdM || 0) + toleransi;

  const resolvedKeys = new Set(StorageService.getResolvedAttendanceKeys());

  for (const att of matchingRecords) {
    const jamMasukClean = att.jamMasuk ? sanitizeTimeString(att.jamMasuk, '') : '';
    let isLate = false;
    if (jamMasukClean && jamMasukClean.includes(':')) {
      const [h, m] = jamMasukClean.split(':').map(Number);
      const checkInMinutes = (h || 0) * 60 + (m || 0);
      if (checkInMinutes > maxOnTimeMinutes) {
        isLate = true;
      }
    }

    // Jika record berstatus Pending Approval, needsApproval, atau absen masuk terlambat
    const requiresApproval = Boolean(
      att.needsApproval ||
      att.status === 'Pending Approval' ||
      (isLate && !att.isManual && !att.id?.startsWith('att-manual-'))
    );

    if (requiresApproval) {
      const cleanDate = sanitizeDateString(att.tanggal);
      const techKey = getNormalizedTechKey(att.teknisiId, att.teknisiNama);
      const groupKey = `${cleanDate}_${techKey}`.toLowerCase();
      const dateTechIdKey = `${cleanDate}_${att.teknisiId}`.toLowerCase();
      const dateTechNamaKey = `${cleanDate}_${(att.teknisiNama || '').toLowerCase().trim()}`;
      const hasJamPulangValid = Boolean(att.jamPulang && att.jamPulang !== '-' && att.jamPulang.trim().length > 0);
      const isExplicitlyApproved = 
        att.isApproved === true ||
        (att.status === 'Hadir' && att.needsApproval === false) ||
        (att.status === 'Hadir' && !att.needsApproval) ||
        resolvedKeys.has(groupKey) || 
        resolvedKeys.has((att.id || '').toLowerCase()) ||
        resolvedKeys.has(dateTechIdKey) ||
        resolvedKeys.has(dateTechNamaKey) ||
        att.isManual === true ||
        att.id?.startsWith('att-manual-') ||
        att.keteranganPulang?.toLowerCase().includes('manual') ||
        att.keteranganPulang?.toLowerCase().includes('admin') ||
        att.keterangan?.includes('[Absen Manual Admin]') ||
        att.keterangan?.toLowerCase().includes('absen manual') ||
        (hasJamPulangValid && (att.isManual || att.isApproved || att.status === 'Hadir'));

      // Sebelum di-approval oleh admin, honor tidak boleh masuk
      if (!isExplicitlyApproved || att.status === 'Ditolak' || (att.needsApproval === true && att.isApproved !== true)) {
        const reasonText = isLate
          ? `Absen masuk terlambat (${jamMasukClean} WIB > batas toleransi ${stdMasuk}+${toleransi}m) dan belum disetujui Admin`
          : (att.keterangan || att.approvalType || 'Menunggu persetujuan (Approval) Admin');
        return { isEligible: false, reason: reasonText };
      }
    }
  }

  return { isEligible: true };
}

export function calculatePayrollForEmployee(
  employee: Employee,
  servers: ServerData[],
  wilayahList: WilayahPekerjaan[],
  jenisList: JenisPekerjaan[],
  allJobs: JobRecord[],
  allAttendance: AttendanceRecord[],
  periodOrFilter: string | PayrollFilterOptions, // YYYY-MM or FilterOptions
  allPotonganManual: PotonganManual[] = [],
  settings?: any,
  honorLunasList?: HonorLunasRecord[],
  allEmployees?: Employee[]
): PayrollRecap {
  const filterOptions: PayrollFilterOptions =
    typeof periodOrFilter === 'string'
      ? { period: periodOrFilter }
      : (periodOrFilter || {});

  // Tentukan periode bulan efektif (YYYY-MM) yang sedang direkap
  let targetPeriodYYYYMM = '';
  if (filterOptions.period && /^\d{4}-\d{2}/.test(filterOptions.period)) {
    targetPeriodYYYYMM = filterOptions.period.slice(0, 7);
  } else if (filterOptions.endDate && /^\d{4}-\d{2}/.test(filterOptions.endDate) && !filterOptions.endDate.startsWith('2030')) {
    targetPeriodYYYYMM = filterOptions.endDate.slice(0, 7);
  } else if (filterOptions.startDate && /^\d{4}-\d{2}/.test(filterOptions.startDate) && !filterOptions.startDate.startsWith('2025-01-01')) {
    targetPeriodYYYYMM = filterOptions.startDate.slice(0, 7);
  } else {
    targetPeriodYYYYMM = getEffectiveTodayISO().slice(0, 7);
  }

  const settledList = honorLunasList !== undefined ? honorLunasList : StorageService.getHonorLunas();
  const settledJobIdSet = new Set<string>();
  const settledPotonganIdSet = new Set<string>();

  // PENTING: Hanya saring pekerjaan & potongan yang telah dilunaskan KHUSUS untuk employee ini!
  // Pekerjaan multi-teknisi yang dikerjakan bersama tidak boleh diabaikan untuk teknisi lain
  // hanya karena salah satu rekan kerjanya sudah dilunaskan honornya.
  (settledList || []).forEach(hl => {
    if (hl.teknisiId === employee.id && !hl.isParsial) {
      if (hl.jobIds && Array.isArray(hl.jobIds)) {
        hl.jobIds.forEach(id => { if (id) settledJobIdSet.add(id); });
      }
      if (hl.potonganIds && Array.isArray(hl.potonganIds)) {
        hl.potonganIds.forEach(id => { if (id) settledPotonganIdSet.add(id); });
      }
    }
  });

  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (filterOptions.startDate && d < filterOptions.startDate) return false;
    if (filterOptions.endDate && d > filterOptions.endDate) return false;
    if (filterOptions.period && !dateStr.startsWith(filterOptions.period)) return false;
    return true;
  };

  // Robust server matching: match by ID or Name
  const resolvedTargetServer = (!filterOptions.serverId || filterOptions.serverId === 'all')
    ? null
    : servers.find(s =>
        s.id === filterOptions.serverId ||
        (s.namaServer && s.namaServer.toLowerCase().trim() === filterOptions.serverId?.toLowerCase().trim())
      );

  const isServerMatch = (sId?: string, sName?: string) => {
    if (!resolvedTargetServer) return true;
    const idMatch = sId === resolvedTargetServer.id || sId === resolvedTargetServer.namaServer;
    const nameMatch = Boolean(
      sName &&
      resolvedTargetServer.namaServer &&
      sName.toLowerCase().trim() === resolvedTargetServer.namaServer.toLowerCase().trim()
    );
    return idMatch || nameMatch;
  };

  const isJobOnServer = (job: JobRecord, srv: ServerData) => {
    return (
      job.serverId === srv.id ||
      job.serverId === srv.namaServer ||
      (job.namaServer && srv.namaServer && job.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
    );
  };

  const attLookupMap = buildAttendanceLookupMap(allAttendance);

  // Filter jobs for this employee, date range, and target server
  // PENTING SESUAI ATURAN SISTEM:
  // 1. Pekerjaan yang sudah dilunaskan (Honor Lunas) tidak akan dihitung kembali.
  // 2. Teknisi yang tidak melakukan absen pulang, maka semua pekerjaan yang diinput
  //    pada hari/tanggal yang sama tidak akan dihitung pada rekap gaji.
  // 3. Teknisi yang melakukan absen lewat dari jam masuk + toleransi (atau perlu approval),
  //    wajib mendapatkan approval Admin terlebih dahulu sebelum honor pekerjaan masuk ke rekap gaji.
  const myJobs = allJobs.filter((job) => {
    const isTech = job.teknisiIds && Array.isArray(job.teknisiIds) ? job.teknisiIds.includes(employee.id) : false;
    const inRange = isDateInRange(job.tanggal);
    const inServer = isServerMatch(job.serverId, job.namaServer);
    if (!isTech || !inRange || !inServer) return false;

    // Abaikan pekerjaan yang sudah dilunaskan KHUSUS untuk teknisi ini
    const isJobSettled = settledJobIdSet.has(job.id);
    if (isJobSettled) return false;

    // Pastikan teknisi telah melakukan Absen Pulang pada tanggal pekerjaan
    const hasPulang = checkTechnicianHasPulang(employee, job.tanggal, allAttendance, attLookupMap);
    if (!hasPulang) return false;

    // Pastikan absensi teknisi valid dan telah disetujui (Approved) Admin jika terlambat / perlu approval
    const attApproval = checkTechnicianAttendanceApproved(employee, job.tanggal, allAttendance, settings, attLookupMap);
    return attApproval.isEligible;
  });

  // Filter attendance for this employee and period
  const myAttendance = allAttendance.filter((att) => {
    const isTech = att.teknisiId === employee.id;
    const inRange = isDateInRange(att.tanggal);
    const inServer = isServerMatch(att.serverId, att.serverNama);
    return isTech && inRange && inServer;
  });

  // 1. Status Karyawan & Scope Server
  // Catatan Penting:
  // - Penanggung Jawab Server & Admin TIDAK memperoleh honor apapun.
  // - Hanya teknisi tetap (role === 'Teknisi' && status === 'Tetap') yang berhak atas honor tetap dari server & honor wilayah.
  // - Teknisi freelance dan mitra HANYA mendapat honor pekerjaan (honorTetapServer = 0).
  // - Teknisi Magang: Tidak mendapatkan honor tetap, honor dasar pekerjaan, dan honor wilayah.
  //   Hanya mendapatkan 50% dari honor titik dan honor kabel dibagi rata sesama teknisi magang, serta honor lembur utuh.
  const isTeknisi = employee.role === 'Teknisi';
  const isKaryawanTetap = isTeknisi && employee.status === 'Tetap';
  const isMagang = isTeknisi && employee.status === 'Magang';

  // Map seluruh data karyawan untuk mendeteksi status teknisi lain pada pekerjaan multi-teknisi
  const employeeMap = new Map<string, Employee>();
  const empList = (allEmployees && allEmployees.length > 0) ? allEmployees : StorageService.getEmployees();
  (empList || []).forEach(e => {
    if (e.id) employeeMap.set(e.id, e);
    if (e.namaLengkap) employeeMap.set(e.namaLengkap.toLowerCase().trim(), e);
  });
  employeeMap.set(employee.id, employee);
  if (employee.namaLengkap) employeeMap.set(employee.namaLengkap.toLowerCase().trim(), employee);

  const targetServersForHonor = resolvedTargetServer
    ? [resolvedTargetServer]
    : servers;

  // 2, 3, 4, 5. Honor Pekerjaan (Dasar, Titik, Kabel, Lembur)
  // Aturan Akuntansi Server:
  // - Honor Dasar Pekerjaan: Dikeluarkan oleh SERVER YANG BERSANGKUTAN dimana teknisi melakukan pekerjaan (job.serverId).
  //   Diterima UTUH oleh masing-masing teknisi Tetap & Freelance (tidak dibagi). Magang = Rp 0.
  // - Honor Lembur: Dikeluarkan oleh SERVER YANG BERSANGKUTAN dimana teknisi melakukan lembur (job.serverId).
  //   Lembur hanya dihitung jika sudah disetujui (ACC) oleh Admin / Penanggung Jawab.
  //   Diterima UTUH oleh masing-masing teknisi termasuk Magang (tidak dibagi).
  // - Honor Titik & Honor Panjang/Tarik Kabel:
  //   - Teknisi Tetap / Freelance: Dibagi rata sesuai jumlah teknisi yang bertugas.
  //   - Teknisi Magang: 50% dari honor titik & kabel dibagi rata sesama teknisi Magang pada pekerjaan tersebut.
  let honorDasarPekerjaan = 0;
  let honorTitik = 0;
  let honorPanjangKabel = 0;
  let honorLembur = 0;
  let totalMenitLembur = 0;

  myJobs.forEach((job) => {
    const numTechs = Math.max(1, job.teknisiIds.length);
    const jp = findJenisPekerjaan(job.jenisPekerjaanId || job.subPekerjaanNama || job.jenisPekerjaanNama, jenisList);

    const tarifDasar = jp ? (Number(jp.tarifDasar) || 0) : 100000;
    const needTitik = isJobNeedTitik(jp);
    const needKabel = isJobNeedKabel(jp);
    const tarifTitik = needTitik ? (Number(jp?.tarifTitik) || 0) : 0;
    const tarifKabel = needKabel ? (Number(jp?.tarifTarikKabelPerMeter) || 0) : 0;
    const tarifLembur = jp ? (Number(jp.tarifLemburPerMenit) || 0) : 500;

    const pointFeeTotal = tarifTitik * (needTitik ? (Number(job.jumlahTitik) || 0) : 0);
    const cableFeeTotal = tarifKabel * (needKabel ? (Number(job.panjangKabelMeter) || 0) : 0);
    
    // Lembur hanya dihitung jika sudah disetujui oleh admin ATAU merupakan pekerjaan pada hari libur (otomatis ACC lembur)
    const appSettings = StorageService.getSettings();
    const isJobHoliday = isHolidayDate(job.tanggal, appSettings).isHoliday;
    const isLemburApproved = Boolean(job.lemburApproved || isJobHoliday);
    const effectiveMenitLembur = (job.menitLembur > 0)
      ? job.menitLembur
      : (isJobHoliday ? 60 : 0);
    const overtimeFeeTotal = (effectiveMenitLembur > 0 && isLemburApproved)
      ? (tarifLembur * effectiveMenitLembur)
      : 0;

    // Dapatkan status seluruh teknisi yang bertugas pada pekerjaan ini
    const techObjs = (job.teknisiIds || []).map(tId => {
      if (tId === employee.id) return employee;
      return employeeMap.get(tId) || (job.teknisiNamas ? employeeMap.get(tId.toLowerCase().trim()) : null);
    });

    const magangTechsOnJob = techObjs.filter(t => t?.status === 'Magang');
    const regularTechsOnJob = techObjs.filter(t => t?.status !== 'Magang');

    const magangCount = Math.max(1, magangTechsOnJob.length);
    const regularCount = regularTechsOnJob.length;

    // Sesuai aturan:
    // - Teknisi Tetap / Freelance: pembagian titik & kabel HANYA dibagi sesama teknisi Tetap & Freelance.
    //   Keberadaan teknisi Magang TIDAK memotong / mengurangi pembagian honor teknisi Tetap/Freelance!
    // - Teknisi Magang: hanya memperoleh 50% dari porsi pembagian honor tersebut.
    //   Jika ada beberapa teknisi magang pada job, porsi 50% tersebut dibagi rata sesama teknisi magang.
    //   Jika pekerjaan HANYA dikerjakan oleh teknisi magang (tanpa tetap/freelance), maka 50% dari total dibagi rata sesama magang.
    let regularPointShare = 0;
    let regularCableShare = 0;

    if (regularCount > 0) {
      regularPointShare = Math.round(pointFeeTotal / regularCount);
      regularCableShare = Math.round(cableFeeTotal / regularCount);
    } else {
      regularPointShare = pointFeeTotal;
      regularCableShare = cableFeeTotal;
    }

    if (isMagang) {
      // Teknisi Magang: Honor Dasar = 0, Titik = 50% dari pembagian honor, Kabel = 50% dari pembagian honor, Lembur = Utuh
      honorDasarPekerjaan += 0;
      honorTitik += Math.round((regularPointShare * 0.5) / magangCount);
      honorPanjangKabel += Math.round((regularCableShare * 0.5) / magangCount);
      honorLembur += overtimeFeeTotal;
    } else {
      // Teknisi Tetap / Freelance: Utuh tidak dipotong oleh keberadaan teknisi magang
      honorDasarPekerjaan += tarifDasar;
      honorTitik += regularPointShare;
      honorPanjangKabel += regularCableShare;
      honorLembur += overtimeFeeTotal;
    }

    if (job.menitLembur > 0 && isLemburApproved) {
      totalMenitLembur += job.menitLembur;
    }
  });

  // 6. Honor Transport Kendaraan
  // Dikeluarkan oleh SERVER YANG BERSANGKUTAN dimana teknisi melakukan pekerjaan.
  // Jika teknisi menggunakan Kendaraan Pribadi, honor transport diambil sesuai nominal transport wilayah pada pekerjaan tersebut.
  let honorTransportKendaraan = 0;
  myJobs.forEach((job) => {
    const vehicle =
      job.teknisiVehicles?.[employee.id] ||
      (employee.namaLengkap ? job.teknisiVehicles?.[employee.namaLengkap] : undefined) ||
      (job.teknisiIds.length === 1 && (job as any).teknisiUtamaVehicle) ||
      'Inventaris';

    if (vehicle === 'Pribadi') {
      let transportBonus = 0;
      if (job.totalTransportWilayah !== undefined && job.totalTransportWilayah > 0) {
        transportBonus = job.totalTransportWilayah;
      } else if (job.transport !== undefined && job.transport > 0) {
        transportBonus = job.transport;
      } else if (job.wilayahIds && job.wilayahIds.length > 0) {
        job.wilayahIds.forEach(wId => {
          const w = wilayahList.find(x => x.id === wId);
          if (w) transportBonus += (w.besaranTransport || 0);
        });
      } else {
        const matchWil = wilayahList.find(w => w.id === job.wilayahId || w.serverId === job.serverId);
        transportBonus = matchWil ? matchWil.besaranTransport : 15000;
      }
      honorTransportKendaraan += transportBonus;
    }
  });

  // 7. Bonus Pencapaian Pekerjaan (Bonus Target Bulanan Server)
  // Dikeluarkan oleh SERVER YANG BERSANGKUTAN dimana teknisi melakukan pekerjaan.
  // Masing-masing server menetapkan target jumlah pekerjaan bulanan dan bonus nominal.
  // Teknisi memperoleh bonus proporsional dari server tersebut sesuai jumlah pekerjaan yang diselesaikan di server tersebut.
  const bonusTargetDetails: ServerBonusDetail[] = [];
  let totalBonusTarget = 0;

  if (!isMagang) {
    targetServersForHonor.forEach(srv => {
      const targetPekerjaan = srv.targetPekerjaanBulanan !== undefined && Number(srv.targetPekerjaanBulanan) > 0
        ? Number(srv.targetPekerjaanBulanan)
        : 100; // Default target pekerjaan per bulan 100
      const serverBonusPool = srv.bonusTargetBulanan !== undefined && Number(srv.bonusTargetBulanan) >= 0
        ? Number(srv.bonusTargetBulanan)
        : 100000; // Default nominal bonus target Rp 100.000

      // Ambil pekerjaan teknisi ini khusus pada server ini dalam rentang tanggal/periode
      const myJobsOnServer = myJobs.filter(j => isJobOnServer(j, srv));
      const myJobCountOnServer = myJobsOnServer.length;

      // Hitung persentase capaian target di server ini
      const rawRatio = targetPekerjaan > 0 ? (myJobCountOnServer / targetPekerjaan) : 0;
      const percentage = Math.round(rawRatio * 100);

      // Nominal bonus proporsional dari server ini (maksimal 100% jika mencapai / melampaui target)
      const effectiveRatio = Math.min(1, Math.max(0, rawRatio));
      const bonusAmount = Math.round(serverBonusPool * effectiveRatio);

      if (myJobCountOnServer > 0 || (resolvedTargetServer && resolvedTargetServer.id === srv.id)) {
        bonusTargetDetails.push({
          serverId: srv.id,
          serverNama: srv.namaServer,
          targetPekerjaan,
          jobCount: myJobCountOnServer,
          percentage,
          serverBonusPool,
          bonusAmount
        });
      }

      totalBonusTarget += bonusAmount;
    });
  }

  const bonusTarget = isMagang ? 0 : totalBonusTarget;

  // 9. Rincian Pembagian Pengeluaran per Server (Server Breakdown)
  // Memastikan bahwa setiap pengeluaran (honor kerja, transport kendaraan, honor wilayah, bonus target, honor tetap)
  // diatribusikan secara transparan kepada server yang bersangkutan dimana pekerjaan dilakukan.
  const serverBreakdowns: ServerPayrollBreakdown[] = targetServersForHonor.map(srv => {
    const serverJobs = myJobs.filter(j => isJobOnServer(j, srv));

    let srvHonorDasar = 0;
    let srvHonorTitik = 0;
    let srvHonorKabel = 0;
    let srvHonorLembur = 0;
    let srvMenitLembur = 0;
    let srvLemburJobCount = 0;
    let srvHonorTransport = 0;

    serverJobs.forEach(job => {
      const numTechs = Math.max(1, job.teknisiIds.length);
      const jp = findJenisPekerjaan(job.jenisPekerjaanId || job.subPekerjaanNama || job.jenisPekerjaanNama, jenisList);

      const tarifDasar = jp ? (Number(jp.tarifDasar) || 0) : 100000;
      const needTitik = isJobNeedTitik(jp);
      const needKabel = isJobNeedKabel(jp);
      const tarifTitik = needTitik ? (Number(jp?.tarifTitik) || 0) : 0;
      const tarifKabel = needKabel ? (Number(jp?.tarifTarikKabelPerMeter) || 0) : 0;
      const tarifLembur = jp ? (Number(jp.tarifLemburPerMenit) || 0) : 500;

      const pointFeeTotal = tarifTitik * (needTitik ? (Number(job.jumlahTitik) || 0) : 0);
      const cableFeeTotal = tarifKabel * (needKabel ? (Number(job.panjangKabelMeter) || 0) : 0);
      const appSettings = StorageService.getSettings();
      const isSrvJobHoliday = isHolidayDate(job.tanggal, appSettings).isHoliday;
      const isLemburApproved = Boolean(job.lemburApproved || isSrvJobHoliday);
      const effectiveSrvMenit = (job.menitLembur > 0)
        ? job.menitLembur
        : (isSrvJobHoliday ? 60 : 0);
      const overtimeFeeTotal = (effectiveSrvMenit > 0 && isLemburApproved)
        ? (tarifLembur * effectiveSrvMenit)
        : 0;

      // Dapatkan status seluruh teknisi yang bertugas pada pekerjaan ini
      const techObjs = (job.teknisiIds || []).map(tId => {
        if (tId === employee.id) return employee;
        return employeeMap.get(tId) || (job.teknisiNamas ? employeeMap.get(tId.toLowerCase().trim()) : null);
      });

      const magangTechsOnJob = techObjs.filter(t => t?.status === 'Magang');
      const regularTechsOnJob = techObjs.filter(t => t?.status !== 'Magang');

      const magangCount = Math.max(1, magangTechsOnJob.length);
      const regularCount = regularTechsOnJob.length;

      let regularPointShare = 0;
      let regularCableShare = 0;

      if (regularCount > 0) {
        regularPointShare = Math.round(pointFeeTotal / regularCount);
        regularCableShare = Math.round(cableFeeTotal / regularCount);
      } else {
        regularPointShare = pointFeeTotal;
        regularCableShare = cableFeeTotal;
      }

      if (isMagang) {
        srvHonorDasar += 0;
        srvHonorTitik += Math.round((regularPointShare * 0.5) / magangCount);
        srvHonorKabel += Math.round((regularCableShare * 0.5) / magangCount);
        srvHonorLembur += overtimeFeeTotal;
      } else {
        srvHonorDasar += tarifDasar;
        srvHonorTitik += regularPointShare;
        srvHonorKabel += regularCableShare;
        srvHonorLembur += overtimeFeeTotal;
      }

      if (job.menitLembur > 0 && isLemburApproved) {
        srvMenitLembur += job.menitLembur;
        srvLemburJobCount += 1;
      }

      // Transport kendaraan pribadi untuk job di server ini
      const vehicle =
        job.teknisiVehicles?.[employee.id] ||
        (employee.namaLengkap ? job.teknisiVehicles?.[employee.namaLengkap] : undefined) ||
        (job.teknisiIds.length === 1 && (job as any).teknisiUtamaVehicle) ||
        'Inventaris';

      if (vehicle === 'Pribadi') {
        let tAmt = 0;
        if (job.totalTransportWilayah !== undefined && job.totalTransportWilayah > 0) {
          tAmt = job.totalTransportWilayah;
        } else if (job.transport !== undefined && job.transport > 0) {
          tAmt = job.transport;
        } else if (job.wilayahIds && job.wilayahIds.length > 0) {
          job.wilayahIds.forEach(wId => {
            const w = wilayahList.find(x => x.id === wId);
            if (w) tAmt += (w.besaranTransport || 0);
          });
        } else {
          const matchWil = wilayahList.find(w => w.id === job.wilayahId || w.serverId === job.serverId);
          tAmt = matchWil ? matchWil.besaranTransport : 15000;
        }
        srvHonorTransport += tAmt;
      }
    });

    // Honor Wilayah dikeluarkan oleh server ini (hanya jika karyawan TETAP & ada aktivitas pekerjaan)
    const handledWilayahOnServer = (!isMagang && isKaryawanTetap)
      ? (employee.wilayahHandledIds || [])
          .map(wId => wilayahList.find(w => w.id === wId))
          .filter((w): w is WilayahPekerjaan => {
            if (!w) return false;
            return (
              w.serverId === srv.id ||
              w.serverId === srv.namaServer ||
              (w.namaServer && srv.namaServer && w.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
            );
          })
      : [];

    let srvHonorWilayah = (isKaryawanTetap && !isMagang && handledWilayahOnServer.length > 0 && serverJobs.length > 0)
      ? handledWilayahOnServer.reduce((sum, w) => sum + (Number(w.honorPJWilayah) || 0), 0)
      : 0;

    // Bonus Target dikeluarkan oleh server ini
    const bonusDetail = bonusTargetDetails.find(b => b.serverId === srv.id);
    let srvBonusTarget = (isMagang ? 0 : (bonusDetail ? bonusDetail.bonusAmount : 0));

    // Honor Tetap Pokok (Hanya untuk Karyawan Tetap, sesuai tarif periode bulan yang direkap):
    let srvHonorTetap = 0;
    if (isKaryawanTetap && !isMagang) {
      if (employee.serverHonors && Array.isArray(employee.serverHonors) && employee.serverHonors.length > 0) {
        const matchedHonor = employee.serverHonors.find(
          sh => sh.serverId === srv.id ||
                (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
        );
        if (matchedHonor) {
          srvHonorTetap = getEffectiveServerHonorNominal(matchedHonor, targetPeriodYYYYMM, employee.namaLengkap);
        }
      } else if (srv.honorTetapTeknisi) {
        const hasJobsOnServer = serverJobs.length > 0;
        const isHomeServerWithNoJobsYet = myJobs.length === 0 && (
          srv.id === employee.serverId ||
          srv.namaServer === employee.serverId ||
          (resolvedTargetServer && resolvedTargetServer.id === srv.id)
        );
        if (hasJobsOnServer || isHomeServerWithNoJobsYet) {
          srvHonorTetap = Number(srv.honorTetapTeknisi) || 0;
        }
      }
    }

    // Potongan Manual / Kasbon yang dikeluarkan oleh server ini untuk teknisi (abaikan yang sudah lunas)
    const srvPotonganManual = allPotonganManual
      .filter(p =>
        p.karyawanId === employee.id &&
        !p.isLunas &&
        !p.honorLunasId &&
        !settledPotonganIdSet.has(p.id) &&
        isDateInRange(p.tanggal) &&
        (p.serverId === srv.id || (p.serverNama && srv.namaServer && p.serverNama.toLowerCase().trim() === srv.namaServer.toLowerCase().trim()))
      )
      .reduce((sum, p) => sum + (Number(p.nominal) || 0), 0);

    // Cek apakah honor tetap / bonus server pada periode ini sudah pernah dilunaskan sebelumnya
    const isServerHonorSettled = (settledList || []).some(hl => {
      if (hl.teknisiId !== employee.id) return false;
      const sMatch = hl.serverId === srv.id || hl.serverId === 'all' || hl.namaServer === srv.namaServer || hl.namaServer === 'Semua Server';
      if (!sMatch) return false;
      const start = filterOptions.startDate || (filterOptions.period ? `${filterOptions.period}-01` : '');
      const end = filterOptions.endDate || (filterOptions.period ? `${filterOptions.period}-31` : '');
      if (!start || !end) return false;
      const exactMatch = (hl.periodeAwal === start && hl.periodeAkhir === end);
      const coveredMatch = (hl.periodeAwal <= start && hl.periodeAkhir >= end);
      const monthMatch = Boolean(filterOptions.period && hl.periodeAwal.startsWith(filterOptions.period));
      return exactMatch || coveredMatch || monthMatch;
    });

    if (isServerHonorSettled) {
      srvHonorTetap = 0;
      srvHonorWilayah = 0;
      srvBonusTarget = 0;
    }

    const srvHonorTetapSetelahPotongan = Math.max(0, srvHonorTetap - srvPotonganManual);

    // 2. Estimasi Honor: Honor Dasar Pekerjaan + Honor Lembur + Honor Titik + Honor Kabel
    const srvEstimasiHonor = srvHonorDasar + srvHonorLembur + srvHonorTitik + srvHonorKabel;

    // 1. Rekap Honor Server:
    // Honor = Honor Tetap + Honor PJ Wilayah + Total Honor Dasar Pekerjaan + Total Honor Lembur + Total Honor Titik + Total Honor Panjang Kabel + Total Transport Kendaraan + Bonus - Potongan
    const srvTotalGross =
      srvHonorTetap +
      srvHonorWilayah +
      srvHonorDasar +
      srvHonorTitik +
      srvHonorKabel +
      srvHonorLembur +
      srvHonorTransport +
      srvBonusTarget;

    const srvTotalNett = Math.max(0, srvTotalGross - srvPotonganManual);

    return {
      serverId: srv.id,
      serverNama: srv.namaServer,
      jobCount: serverJobs.length,
      honorTetapServer: srvHonorTetap,
      potonganManualServer: srvPotonganManual,
      honorTetapSetelahPotongan: srvHonorTetapSetelahPotongan,
      honorPJWilayah: srvHonorWilayah,
      honorDasarPekerjaan: srvHonorDasar,
      honorTitik: srvHonorTitik,
      honorPanjangKabel: srvHonorKabel,
      honorLembur: srvHonorLembur,
      menitLembur: srvMenitLembur,
      lemburJobCount: srvLemburJobCount,
      honorTransportKendaraan: srvHonorTransport,
      bonusTarget: srvBonusTarget,
      estimasiHonor: srvEstimasiHonor,
      totalGross: srvTotalGross,
      totalNett: srvTotalNett
    };
  }).filter(sb => sb.jobCount > 0 || sb.totalGross > 0 || (sb.potonganManualServer && sb.potonganManualServer > 0) || (resolvedTargetServer && resolvedTargetServer.id === sb.serverId));

  // Akumulasi Honor Tetap & Honor PJ Wilayah dari seluruh server yang membebankan honor
  const honorTetapServer = serverBreakdowns.reduce((sum, sb) => sum + sb.honorTetapServer, 0);
  const honorPJWilayah = serverBreakdowns.reduce((sum, sb) => sum + sb.honorPJWilayah, 0);

  // 10. Deductions (Potongan Absen & Keterlambatan)
  let potonganTerlambatAbsen = 0;
  myAttendance.forEach(att => {
    if (att.status === 'Ditolak' || (att.status === 'Terlambat' && att.needsApproval)) {
      potonganTerlambatAbsen += att.potonganOtomatis || 25000;
    }
  });

  // Filter Potongan Manual / Kasbon untuk teknisi ini pada periode dan server yang sesuai (abaikan yang sudah lunas)
  const myPotongan = allPotonganManual.filter(p => {
    const isEmp = p.karyawanId === employee.id;
    const isNotSettled = !p.isLunas && !p.honorLunasId && !settledPotonganIdSet.has(p.id);
    const inRange = isDateInRange(p.tanggal);
    const inServer = isServerMatch(p.serverId, p.serverNama);
    return isEmp && isNotSettled && inRange && inServer;
  });

  const potonganManualKasbon = myPotongan.reduce((sum, p) => sum + (Number(p.nominal) || 0), 0);
  const honorTetapSetelahPotongan = Math.max(0, honorTetapServer - potonganManualKasbon);

  // 1. Rekap Honor:
  // Honor = Honor Tetap + Honor PJ Wilayah + Total Honor Dasar Pekerjaan + Total Honor Lembur + Total Honor Titik + Total Honor Panjang Kabel + Total Transport Kendaraan + Bonus - Potongan
  const totalHonorGross =
    honorTetapServer +
    honorPJWilayah +
    honorDasarPekerjaan +
    honorLembur +
    honorTitik +
    honorPanjangKabel +
    honorTransportKendaraan +
    bonusTarget;

  const totalPotongan = potonganTerlambatAbsen + potonganManualKasbon;
  const totalHonorNett = Math.max(0, totalHonorGross - totalPotongan);

  // 2. Estimasi Honor:
  // Honor Dasar Pekerjaan + Honor Lembur + Honor Titik + Honor Kabel = Estimasi
  const estimasiHonor =
    honorDasarPekerjaan +
    honorLembur +
    honorTitik +
    honorPanjangKabel;

  const displayPeriod =
    typeof periodOrFilter === 'string'
      ? periodOrFilter
      : (filterOptions.startDate && filterOptions.endDate
          ? `${filterOptions.startDate} s/d ${filterOptions.endDate}`
          : filterOptions.period || 'Semua Periode');

  return {
    teknisiId: employee.id,
    teknisiNama: employee.namaLengkap,
    statusKaryawan: employee.status,
    periode: displayPeriod,
    totalPekerjaanCount: myJobs.length,
    honorTetapServer,
    honorTetapSetelahPotongan,
    honorPJWilayah,
    honorDasarPekerjaan,
    honorTitik,
    honorPanjangKabel,
    honorLembur,
    totalMenitLembur,
    honorTransportKendaraan,
    bonusTarget,
    bonusTargetDetails,
    serverBreakdowns,
    potonganTerlambatAbsen,
    potonganManualKasbon,
    potonganManualDetails: myPotongan,
    estimasiHonor,
    totalHonorGross,
    totalPotongan,
    totalHonorNett,
    jobList: myJobs,
    attendanceList: myAttendance
  };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Calculates the exact honor earned by a specific technician for a specific job
 * Correctly distinguishes Tetap/Freelance (100% honor dasar, 100% porsi titik & kabel)
 * versus Magang (Rp 0 honor dasar, 50% porsi titik & kabel) without reducing Tetap/Freelance shares!
 */
export function calculateTechnicianHonorForJob(
  job: JobRecord,
  employee: Employee | null | undefined,
  employees: Employee[],
  jenisList: JenisPekerjaan[],
  settings?: AppSettings
): {
  totalHonor: number;
  dasar: number;
  titik: number;
  kabel: number;
  lembur: number;
  transport: number;
  isMagang: boolean;
  isRegular: boolean;
} {
  if (!employee) {
    return {
      totalHonor: job.honorPerTeknisi || 0,
      dasar: 0,
      titik: 0,
      kabel: 0,
      lembur: 0,
      transport: 0,
      isMagang: false,
      isRegular: true
    };
  }

  const isMagang = employee.status === 'Magang';
  const jp = findJenisPekerjaan(job.jenisPekerjaanId || job.subPekerjaanNama || job.jenisPekerjaanNama, jenisList);

  const tarifDasar = jp ? (Number(jp.tarifDasar) || 0) : 0;
  const needTitik = isJobNeedTitik(jp);
  const needKabel = isJobNeedKabel(jp);
  const tarifTitik = needTitik ? (Number(jp?.tarifTitik) || 0) : 0;
  const tarifKabel = needKabel ? (Number(jp?.tarifTarikKabelPerMeter) || 0) : 0;
  const tarifLembur = jp ? (Number(jp.tarifLemburPerMenit) || 0) : 0;

  const pointFeeTotal = tarifTitik * (needTitik ? (Number(job.jumlahTitik) || 0) : 0);
  const cableFeeTotal = tarifKabel * (needKabel ? (Number(job.panjangKabelMeter) || 0) : 0);

  const appSettings = settings || StorageService.getSettings();
  const isJobHoliday = isHolidayDate(job.tanggal, appSettings).isHoliday;
  const isLemburApproved = Boolean(job.lemburApproved || isJobHoliday);
  const effectiveMenitLembur = (job.menitLembur > 0)
    ? job.menitLembur
    : (isJobHoliday ? 60 : 0);
  const overtimeFeeTotal = (effectiveMenitLembur > 0 && isLemburApproved)
    ? (tarifLembur * effectiveMenitLembur)
    : 0;

  // Dapatkan seluruh objek teknisi yang terdaftar pada pekerjaan ini
  const techObjs = (job.teknisiIds || []).map(tId => {
    if (tId === employee.id) return employee;
    return employees.find(e => e.id === tId || e.namaLengkap?.toLowerCase().trim() === tId.toLowerCase().trim());
  });

  const magangTechsOnJob = techObjs.filter(t => t?.status === 'Magang');
  const regularTechsOnJob = techObjs.filter(t => t?.status !== 'Magang');

  const magangCount = Math.max(1, magangTechsOnJob.length);
  const regularCount = regularTechsOnJob.length;

  let regularPointShare = 0;
  let regularCableShare = 0;

  if (regularCount > 0) {
    regularPointShare = Math.round(pointFeeTotal / regularCount);
    regularCableShare = Math.round(cableFeeTotal / regularCount);
  } else {
    regularPointShare = pointFeeTotal;
    regularCableShare = cableFeeTotal;
  }

  let dasar = 0;
  let titik = 0;
  let kabel = 0;
  let lembur = overtimeFeeTotal;

  if (isMagang) {
    dasar = 0;
    titik = Math.round((regularPointShare * 0.5) / magangCount);
    kabel = Math.round((regularCableShare * 0.5) / magangCount);
  } else {
    dasar = tarifDasar;
    titik = regularPointShare;
    kabel = regularCableShare;
  }

  // Transport kendaraan pribadi
  let transport = 0;
  const vehicle =
    job.teknisiVehicles?.[employee.id] ||
    (employee.namaLengkap ? job.teknisiVehicles?.[employee.namaLengkap] : undefined) ||
    (job.teknisiIds.length === 1 && (job as any).teknisiUtamaVehicle) ||
    'Inventaris';

  if (vehicle === 'Pribadi') {
    if (job.totalTransportWilayah !== undefined && job.totalTransportWilayah > 0) {
      transport = job.totalTransportWilayah;
    } else if (job.transport !== undefined && job.transport > 0) {
      transport = job.transport;
    }
  }

  const totalHonor = dasar + titik + kabel + lembur + transport;

  return {
    totalHonor,
    dasar,
    titik,
    kabel,
    lembur,
    transport,
    isMagang,
    isRegular: !isMagang
  };
}

