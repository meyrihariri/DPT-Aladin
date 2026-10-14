import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  Calendar,
  Clock,
  Server,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Save,
  RotateCcw,
  Search,
  Filter,
  Trash2,
  Edit3,
  ShieldCheck,
  HelpCircle,
  Info,
  RefreshCw,
  Zap,
  Check,
  CalendarCheck,
  AlertCircle
} from 'lucide-react';
import { Employee, ServerData, AttendanceRecord, JobRecord, AbsensiStatus } from '../types';
import { sanitizeDateString, getEffectiveTodayISO } from '../services/googleSheetsHelper';
import { getNormalizedTechKey, StorageService } from '../services/storage';
import { checkTechnicianHasPulang, checkTechnicianAttendanceApproved, buildAttendanceLookupMap } from '../services/payroll';
import { showAppAlert, showAppConfirm } from '../utils/dialogService';
import { EditPresensiModal } from '../components/EditPresensiModal';

export type AbsenManualTab = 'form' | 'deteksi_masalah' | 'riwayat';

interface AbsenManualViewProps {
  initialTab?: AbsenManualTab;
  onSelectTab?: (tab: AbsenManualTab) => void;
  employees: Employee[];
  servers: ServerData[];
  attendanceList: AttendanceRecord[];
  jobs: JobRecord[];
  currentUser: Employee | null;
  onSaveAttendance: (
    record: Partial<AttendanceRecord> & { id?: string; tanggal: string; teknisiId: string; teknisiNama?: string }
  ) => Promise<{ success: boolean; message?: string }> | void;
  onDeleteAttendance?: (id: string) => void;
  isSyncing?: boolean;
  isSheetConnected?: boolean;
  onSyncDatabase?: () => void;
}

const AbsenManualViewComponent: React.FC<AbsenManualViewProps> = ({
  initialTab = 'form',
  onSelectTab,
  employees,
  servers,
  attendanceList,
  jobs,
  currentUser,
  onSaveAttendance,
  onDeleteAttendance,
  isSyncing = false,
  isSheetConnected = false,
  onSyncDatabase
}) => {
  // Access Security Check: Only Admin can access
  const isAdmin = currentUser?.role === 'Admin';

  // Form States with draft protection
  const todayStr = useMemo(() => getEffectiveTodayISO(), []);
  const initialManualDraft = useMemo(() => {
    return StorageService.getManualAttendanceDraft() || null;
  }, []);

  const [selectedTeknisiId, setSelectedTeknisiId] = useState<string>(() => initialManualDraft?.selectedTeknisiId || '');
  const [tanggal, setTanggal] = useState<string>(() => initialManualDraft?.tanggal || todayStr);
  const [serverId, setServerId] = useState<string>(() => initialManualDraft?.serverId || '');
  const [jamMasuk, setJamMasuk] = useState<string>(() => initialManualDraft?.jamMasuk || '08:00');
  const [jamPulang, setJamPulang] = useState<string>(() => initialManualDraft?.jamPulang || '17:00');
  const [isPulangIncluded, setIsPulangIncluded] = useState<boolean>(() => initialManualDraft?.isPulangIncluded ?? true);
  const [statusKehadiran, setStatusKehadiran] = useState<AbsensiStatus>(() => initialManualDraft?.statusKehadiran || 'Hadir');
  const [kategoriAlasan, setKategoriAlasan] = useState<string>(() => initialManualDraft?.kategoriAlasan || 'Kendala Jaringan / Sinyal');
  const [catatanAlasan, setCatatanAlasan] = useState<string>(() => initialManualDraft?.catatanAlasan || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Auto-save draft
  React.useEffect(() => {
    const isTouched = Boolean(
      selectedTeknisiId ||
      catatanAlasan ||
      serverId ||
      statusKehadiran !== 'Hadir' ||
      jamMasuk !== '08:00' ||
      jamPulang !== '17:00'
    );
    if (isTouched) {
      StorageService.saveManualAttendanceDraft({
        selectedTeknisiId,
        tanggal,
        serverId,
        jamMasuk,
        jamPulang,
        isPulangIncluded,
        statusKehadiran,
        kategoriAlasan,
        catatanAlasan
      });
    }
  }, [selectedTeknisiId, tanggal, serverId, jamMasuk, jamPulang, isPulangIncluded, statusKehadiran, kategoriAlasan, catatanAlasan]);

  // Table & Filter States
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterTeknisi, setFilterTeknisi] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [activeTab, setActiveTab] = useState<AbsenManualTab>(initialTab);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: AbsenManualTab) => {
    setActiveTab(tab);
    onSelectTab?.(tab);
  };

  // Filter technicians (role: Teknisi or Penanggungjawab Server)
  const technicianList = useMemo(() => {
    return employees.filter(e => e.role === 'Teknisi' || e.role === 'Penanggungjawab Server');
  }, [employees]);

  // Selected technician object
  const selectedTech = useMemo(() => {
    return employees.find(e => e.id === selectedTeknisiId) || null;
  }, [employees, selectedTeknisiId]);

  // When technician changes, set default server based on technician's server if not set
  const handleTeknisiChange = (techId: string) => {
    setSelectedTeknisiId(techId);
    const tech = employees.find(e => e.id === techId);
    if (tech && tech.serverId) {
      setServerId(tech.serverId);
    } else if (servers.length > 0 && !serverId) {
      setServerId(servers[0].id);
    }
  };

  // Helper date presets
  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    setTanggal(getEffectiveTodayISO(d));
  };

  // Pre-indexed lookup maps for instant O(1) performance (Zero UI Freeze)
  const attLookupMap = useMemo(() => {
    return buildAttendanceLookupMap(attendanceList);
  }, [attendanceList]);

  const empMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) {
      map.set(e.id, e);
      if (e.username) {
        map.set(e.username, e);
        map.set(`emp-${e.username}`, e);
      }
    }
    return map;
  }, [employees]);

  // Smart Problem Detector: Detect jobs whose technicians haven't clocked in or out
  const problemJobs = useMemo(() => {
    const list: Array<{
      job: JobRecord;
      tech: Employee;
      cleanTanggal: string;
      reason: string;
      existingRecord?: AttendanceRecord;
    }> = [];

    if (!Array.isArray(jobs) || jobs.length === 0) return list;

    // Sort jobs descending by date
    const sortedJobs = [...jobs].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    const appSettings = StorageService.getSettings();

    for (let i = 0; i < sortedJobs.length; i++) {
      const job = sortedJobs[i];
      if (!job.teknisiIds || job.teknisiIds.length === 0) continue;
      const cleanTgl = sanitizeDateString(job.tanggal);

      for (let j = 0; j < job.teknisiIds.length; j++) {
        const tId = job.teknisiIds[j];
        const tech = empMap.get(tId);
        if (!tech) continue;

        const hasPulang = checkTechnicianHasPulang(tech, cleanTgl, attendanceList, attLookupMap);
        const attApproval = checkTechnicianAttendanceApproved(tech, cleanTgl, attendanceList, appSettings, attLookupMap);

        if (!hasPulang || !attApproval.isEligible) {
          // Find if there's any existing attendance for this technician on this day via O(1) lookup
          const targetKey = getNormalizedTechKey(tech.id, tech.namaLengkap);
          const targetIdClean = (tech.id || '').toLowerCase().trim();
          const targetUserClean = (tech.username || '').toLowerCase().trim();
          const targetNameClean = (tech.namaLengkap || '').toLowerCase().trim();

          const matches = attLookupMap.get(`${cleanTgl}_${targetKey}`) ||
                          attLookupMap.get(`${cleanTgl}_${targetIdClean}`) ||
                          (targetUserClean ? attLookupMap.get(`${cleanTgl}_${targetUserClean}`) : undefined) ||
                          (targetUserClean ? attLookupMap.get(`${cleanTgl}_emp-${targetUserClean}`) : undefined) ||
                          attLookupMap.get(`${cleanTgl}_${targetNameClean}`);
          const existing = matches && matches.length > 0 ? matches[0] : undefined;

          // Double check if existing record actually has clock-out or manual approval
          if (existing && (
            (existing.jamPulang && existing.jamPulang !== '-' && existing.jamPulang.trim().length > 0) ||
            existing.isManual === true ||
            existing.isApproved === true ||
            (existing.status === 'Hadir' && existing.needsApproval === false)
          )) {
            continue;
          }

          let reason = 'Belum ada data absen masuk & pulang sama sekali';
          if (existing) {
            if (existing.status === 'Ditolak') {
              reason = 'Data absensi ditolak oleh sistem/admin';
            } else if (!hasPulang) {
              reason = `Sudah absen masuk (${existing.jamMasuk || '-'}), namun belum absen pulang`;
            } else if (!attApproval.isEligible) {
              reason = attApproval.reason || 'Absen masuk terlambat dan belum disetujui (Pending Approval) Admin';
            }
          }

          list.push({
            job,
            tech,
            cleanTanggal: cleanTgl,
            reason,
            existingRecord: existing
          });
        }
      }
    }

    return list;
  }, [jobs, empMap, attendanceList, attLookupMap]);

  // Quick Resolve: Auto-fill form from a problematic job item
  const handleQuickResolve = (item: typeof problemJobs[0]) => {
    setSelectedTeknisiId(item.tech.id);
    setTanggal(item.cleanTanggal);
    setServerId(item.job.serverId || item.tech.serverId || (servers[0]?.id || ''));
    setJamMasuk(item.existingRecord?.jamMasuk && item.existingRecord.jamMasuk !== '-' ? item.existingRecord.jamMasuk : '08:00');
    setJamPulang('17:00');
    setIsPulangIncluded(true);
    setStatusKehadiran('Hadir');
    setKategoriAlasan('Kendala Jaringan / Sinyal');
    setCatatanAlasan(`Koreksi Admin: Mengatasi kendala absen pada pekerjaan ${item.job.subPekerjaanNama || item.job.jenisPekerjaanNama} agar honor masuk.`);
    setActiveTab('form');

    // Scroll to form smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTeknisiId) {
      showAppAlert({
        title: 'Pilih Teknisi',
        message: 'Silakan pilih teknisi yang akan dibuatkan absen manual.',
        type: 'warning'
      });
      return;
    }

    if (!tanggal) {
      showAppAlert({
        title: 'Pilih Tanggal',
        message: 'Silakan tentukan tanggal kehadiran.',
        type: 'warning'
      });
      return;
    }

    const tech = employees.find(e => e.id === selectedTeknisiId);
    if (!tech) return;

    const targetServer = servers.find(s => s.id === serverId) || servers[0];
    const finalJamPulang = isPulangIncluded ? (jamPulang || '17:00') : '-';

    // Find existing attendance if any for this day & tech to update in place
    const cleanTgl = sanitizeDateString(tanggal);
    const targetKey = getNormalizedTechKey(tech.id, tech.namaLengkap);
    const existing = attendanceList.find(a => {
      const aDate = sanitizeDateString(a.tanggal);
      const aKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      return aDate === cleanTgl && (a.teknisiId === tech.id || aKey === targetKey);
    });

    const fullAlasan = `[Absen Manual Admin] ${kategoriAlasan}${catatanAlasan ? ` - ${catatanAlasan}` : ''}`;

    setIsSubmitting(true);
    try {
      await onSaveAttendance({
        id: existing?.id || `att-manual-${Date.now()}`,
        tanggal: cleanTgl,
        teknisiId: tech.id,
        teknisiNama: tech.namaLengkap,
        jamMasuk: jamMasuk || '08:00',
        jamPulang: finalJamPulang,
        serverId: targetServer ? targetServer.id : '',
        serverNama: targetServer ? targetServer.namaServer : 'Server Utama',
        status: statusKehadiran,
        isApproved: statusKehadiran !== 'Ditolak',
        needsApproval: false,
        isWithinRadius: true,
        distanceMeter: 10,
        potonganOtomatis: 0,
        isManual: true,
        keterangan: fullAlasan,
        keteranganPulang: isPulangIncluded ? 'Absen pulang diverifikasi Admin (Manual)' : '-'
      });

      setSuccessBanner(
        `Absen manual untuk ${tech.namaLengkap} pada tanggal ${cleanTgl} berhasil disimpan dan disetujui! Data pekerjaan pada tanggal tersebut kini valid untuk perhitungan rekap honor.`
      );

      // Reset form but keep date for consecutive entries
      StorageService.clearManualAttendanceDraft();
      setCatatanAlasan('');
    } catch (err: any) {
      console.error('Error saving manual attendance:', err);
      showAppAlert({
        title: 'Gagal Menyimpan',
        message: `Terjadi kendala saat menyimpan absensi manual: ${err?.message || 'Silakan coba lagi.'}`,
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form handler
  const handleResetForm = () => {
    setSelectedTeknisiId('');
    setTanggal(todayStr);
    setJamMasuk('08:00');
    setJamPulang('17:00');
    setIsPulangIncluded(true);
    setStatusKehadiran('Hadir');
    setCatatanAlasan('');
    setSuccessBanner(null);
  };

  // Filtered attendance records for Table View (only computed on riwayat tab)
  const filteredAttendance = useMemo(() => {
    if (activeTab !== 'riwayat' || !Array.isArray(attendanceList) || attendanceList.length === 0) return [];

    const cleanFilterDate = filterDate ? sanitizeDateString(filterDate) : '';
    const q = searchTerm ? searchTerm.toLowerCase().trim() : '';

    return attendanceList
      .filter(a => {
        if (cleanFilterDate && sanitizeDateString(a.tanggal) !== cleanFilterDate) {
          return false;
        }
        if (filterTeknisi !== 'all' && a.teknisiId !== filterTeknisi) {
          return false;
        }
        if (q) {
          const matchName = (a.teknisiNama || '').toLowerCase().includes(q);
          const matchServer = (a.serverNama || '').toLowerCase().includes(q);
          const matchKet = (a.keterangan || '').toLowerCase().includes(q);
          if (!matchName && !matchServer && !matchKet) return false;
        }
        return true;
      })
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  }, [activeTab, attendanceList, filterDate, filterTeknisi, searchTerm]);

  // Prompt delete attendance record
  const handlePromptDelete = async (record: AttendanceRecord) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Data Absensi',
      message: `Apakah Anda yakin ingin menghapus data absensi ${record.teknisiNama} tanggal ${record.tanggal}?`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });
    if (confirmed && onDeleteAttendance) {
      onDeleteAttendance(record.id);
    }
  };

  // Non-admin block
  if (!isAdmin) {
    return (
      <div className="max-w-2xl my-8 p-6 bg-white border border-rose-200 rounded-2xl shadow-xs text-left space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Akses Terbatas Khusus Administrator</h2>
          <p className="text-sm text-slate-600 leading-relaxed mt-1">
            Menu <strong>Absen Manual</strong> hanya dapat diakses oleh akun dengan peran <strong>Admin</strong>.
            Hal ini ditujukan untuk menjaga keakuratan, otentikasi, dan integritas data honor teknisi pada rekapitulasi gaji.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs text-left">
        <div className="text-left">
          <div className="flex items-center space-x-2 text-left">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-maroon-100 text-maroon-900 border border-maroon-200">
              Khusus Administrator
            </span>
            {isSheetConnected && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Sheets Terhubung
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1.5 flex items-center gap-2 text-left">
            <UserCheck className="w-6 h-6 text-maroon-800 shrink-0" />
            <span>Absen Manual Teknisi</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onSyncDatabase && (
            <button
              onClick={onSyncDatabase}
              disabled={isSyncing}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sync Database'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-semibold flex items-start justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start space-x-2.5 text-left">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="font-bold text-emerald-950">Berhasil Disimpan!</p>
              <p className="mt-0.5 text-emerald-800">{successBanner}</p>
            </div>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold px-2 py-1 text-xs"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-start gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-left">
        <button
          onClick={() => handleTabChange('form')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'form'
              ? 'bg-maroon-800 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Form Absen Manual</span>
        </button>

        <button
          onClick={() => handleTabChange('deteksi_masalah')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'deteksi_masalah'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Pekerjaan Tanpa Absen ({problemJobs.length})</span>
          {problemJobs.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => handleTabChange('riwayat')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'riwayat'
              ? 'bg-maroon-800 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Riwayat Absensi ({attendanceList.length})</span>
        </button>
      </div>

      {/* TAB 1: FORM INPUT ABSEN MANUAL */}
      {activeTab === 'form' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 Cols) */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-600" />
                <span>Formulir Input Absen Manual</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Data kehadiran yang diinputkan oleh Admin otomatis berstatus <strong>Hadir</strong>, disetujui (Approved), dan langsung terhitung ke honor.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 1. Pilih Teknisi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Pilih Teknisi <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedTeknisiId}
                  onChange={e => handleTeknisiChange(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:bg-white transition-all cursor-pointer"
                >
                  <option value="">-- Pilih Nama Teknisi --</option>
                  {technicianList.map(tech => (
                    <option key={tech.id} value={tech.id}>
                      {tech.namaLengkap} - ({tech.status || 'Freelance'}) {tech.namaServer ? `[${tech.namaServer}]` : ''}
                    </option>
                  ))}
                </select>
                {selectedTech && (
                  <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{selectedTech.namaLengkap}</span>
                      <span className="text-slate-500 ml-2">Status: <strong className="text-maroon-800">{selectedTech.status}</strong></span>
                    </div>
                    <span className="text-slate-500 text-[11px]">Server: <strong>{selectedTech.namaServer || 'Semua Server'}</strong></span>
                  </div>
                )}
              </div>

              {/* 2. Tanggal Kehadiran */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Tanggal Kehadiran <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="date"
                    value={tanggal}
                    onChange={e => setTanggal(e.target.value)}
                    required
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:bg-white transition-all"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuickDate(0)}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Hari Ini
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(1)}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Kemarin
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(2)}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      2 Hari Lalu
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Server Penugasan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  3. Server Lokasi / Penugasan
                </label>
                <select
                  value={serverId}
                  onChange={e => setServerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:bg-white transition-all cursor-pointer"
                >
                  <option value="">-- Pilih Server --</option>
                  {servers.map(srv => (
                    <option key={srv.id} value={srv.id}>
                      {srv.namaServer} ({srv.alamatLokasi || 'Lokasi'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Jam Masuk & Jam Pulang */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Jam Masuk
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold">Standard 08:00</span>
                  </div>
                  <input
                    type="time"
                    value={jamMasuk}
                    onChange={e => setJamMasuk(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                  />
                  <div className="flex gap-1 mt-1.5">
                    {['07:30', '08:00', '08:30'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setJamMasuk(t)}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                          jamMasuk === t ? 'bg-maroon-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Jam Pulang
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold">Standard 17:00</span>
                  </div>
                  <input
                    type="time"
                    value={jamPulang}
                    onChange={e => setJamPulang(e.target.value)}
                    disabled={!isPulangIncluded}
                    required={isPulangIncluded}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 disabled:bg-slate-200 disabled:text-slate-400"
                  />
                  <div className="flex gap-1 mt-1.5">
                    {['16:30', '17:00', '17:30', '18:00'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setIsPulangIncluded(true);
                          setJamPulang(t);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                          jamPulang === t && isPulangIncluded ? 'bg-maroon-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2 pt-1 border-t border-slate-200">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPulangIncluded}
                      onChange={e => setIsPulangIncluded(e.target.checked)}
                      className="w-4 h-4 text-maroon-800 rounded-md border-slate-300 focus:ring-maroon-800 cursor-pointer"
                    />
                    <span>
                      Sertakan <strong>Jam Pulang</strong> (Sangat Disarankan: Syarat mutlak agar pekerjaan teknisi terhitung di Rekap Honor)
                    </span>
                  </label>
                </div>
              </div>

              {/* 5. Status Kehadiran & Alasan Kendala */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    5. Status Kehadiran
                  </label>
                  <select
                    value={statusKehadiran}
                    onChange={e => setStatusKehadiran(e.target.value as AbsensiStatus)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:bg-white cursor-pointer"
                  >
                    <option value="Hadir">Hadir (Disetujui Penuh)</option>
                    <option value="Izin">Izin</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Cuti">Cuti</option>
                    <option value="Terlambat">Terlambat</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    6. Kategori Kendala Absen
                  </label>
                  <select
                    value={kategoriAlasan}
                    onChange={e => setKategoriAlasan(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:bg-white cursor-pointer"
                  >
                    <option value="Kendala Jaringan / Sinyal">Kendala Jaringan / Sinyal Internet</option>
                    <option value="HP Teknisi Error / Baterai Habis">HP Teknisi Error / Baterai Habis</option>
                    <option value="Kendala GPS / Di Luar Radius">Kendala GPS / Radius Server</option>
                    <option value="Teknisi Lupa Absen Pulang">Teknisi Lupa Absen Pulang</option>
                    <option value="Teknisi Lupa Absen Masuk">Teknisi Lupa Absen Masuk</option>
                    <option value="Koreksi Admin (Pekerjaan Valid)">Koreksi Admin (Pekerjaan Valid Lapangan)</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              {/* 7. Catatan / Keterangan Tambahan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  7. Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={catatanAlasan}
                  onChange={e => setCatatanAlasan(e.target.value)}
                  placeholder="Contoh: Pekerjaan penarikan kabel selesai jam 16:30, teknisi tidak dapat absen karena HP drop..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:bg-white transition-all"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-4 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Form</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedTeknisiId}
                  className="px-6 py-2.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Absen Manual'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Information & Quick Help Panel (1 Col) */}
          <div className="space-y-4">
            {/* Direct Problem Resolver Card */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-5 rounded-2xl shadow-sm space-y-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-amber-200" />
                <h4 className="font-extrabold text-sm uppercase tracking-wider text-amber-100">
                  Solusi Cepat Rekap Honor
                </h4>
              </div>
              <p className="text-xs text-white/90 leading-relaxed">
                Di sistem DPT-AlaDin, teknisi <strong>wajib memiliki data Absen Pulang</strong> pada tanggal pekerjaan agar honor pekerjaan (pokok, titik, kabel, & lembur) terhitung.
              </p>
              <div className="p-3 bg-black/15 rounded-xl text-[11px] space-y-1">
                <p className="font-bold text-amber-100">Aturan Otomatis Absen Manual Admin:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-white/80">
                  <li>Otomatis disetujui (Status: Hadir)</li>
                  <li>Bebas potongan denda radius & keterlambatan</li>
                  <li>Langsung disinkronkan ke Google Sheets</li>
                </ul>
              </div>
            </div>

            {/* Quick Summary of Pending Problem Jobs */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Pekerjaan Perlu Absen</span>
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900">
                  {problemJobs.length} Kasus
                </span>
              </div>

              {problemJobs.length === 0 ? (
                <div className="p-3 bg-emerald-50 rounded-xl text-left space-y-1">
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-xs font-bold text-emerald-900">Semua Lengkap</p>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Seluruh pekerjaan teknisi sudah memiliki data absensi pulang yang valid.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 text-xs">
                  {problemJobs.slice(0, 5).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 hover:bg-amber-50/60 border border-slate-200 rounded-xl transition-colors space-y-1 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{item.tech.namaLengkap}</span>
                        <span className="text-[10px] font-semibold text-slate-500">{item.cleanTanggal}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate">
                        Job: {item.job.subPekerjaanNama || item.job.jenisPekerjaanNama}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleQuickResolve(item)}
                        className="w-full mt-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Absenkan Sekarang</span>
                      </button>
                    </div>
                  ))}
                  {problemJobs.length > 5 && (
                    <button
                      onClick={() => setActiveTab('deteksi_masalah')}
                      className="w-full text-left text-xs font-bold text-maroon-800 hover:underline py-1"
                    >
                      Lihat Semua ({problemJobs.length} Pekerjaan) &rarr;
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DETEKSI PEKERJAAN TANPA ABSEN */}
      {activeTab === 'deteksi_masalah' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start space-x-3 text-xs text-amber-900 text-left">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-amber-950">
                Pekerjaan yang Honornya Belum Terhitung Akibat Tidak Ada Absen Pulang
              </h4>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                Daftar di bawah ini mendeteksi pekerjaan yang diinput oleh teknisi tetapi tidak memiliki data Absen Pulang yang sah pada tanggal tersebut.
                Klik tombol <strong>"Input Absen Sekarang"</strong> untuk mengisi form secara otomatis.
              </p>
            </div>
          </div>

          {problemJobs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-left space-y-3">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Semua Pekerjaan Memiliki Absen Lengkap</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tidak ditemukan pekerjaan teknisi yang tertahan honornya karena kendala absensi. Seluruh teknisi telah absen pulang dengan benar.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {problemJobs.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:border-amber-300 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{item.tech.namaLengkap}</h4>
                      <p className="text-xs text-slate-500">
                        Tanggal: <strong>{item.cleanTanggal}</strong> | Status: <span className="text-maroon-800 font-bold">{item.tech.status}</span>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      Honor Tertahan
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                    <p className="text-slate-700 font-medium">
                      <strong>Pekerjaan:</strong> {item.job.subPekerjaanNama || item.job.jenisPekerjaanNama}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      Server: {item.job.namaServer || 'Server'} | Titik: {item.job.jumlahTitik} | Kabel: {item.job.panjangKabelMeter}m
                    </p>
                    <p className="text-amber-800 font-semibold text-[11px] pt-1 border-t border-slate-200">
                      Kendala: {item.reason}
                    </p>
                  </div>

                  <button
                    onClick={() => handleQuickResolve(item)}
                    className="w-full py-2 bg-maroon-800 hover:bg-maroon-900 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Input Absen Sekarang (Masuk 08:00 & Pulang 17:00)</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RIWAYAT & DATA ABSENSI */}
      {activeTab === 'riwayat' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between pb-4 border-b border-slate-200">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari nama teknisi, server..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="text-xs text-rose-600 font-bold px-2 py-1 hover:underline"
                >
                  Reset Tanggal
                </button>
              )}

              <select
                value={filterTeknisi}
                onChange={e => setFilterTeknisi(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
              >
                <option value="all">Semua Teknisi</option>
                {technicianList.map(t => (
                  <option key={t.id} value={t.id}>{t.namaLengkap}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Riwayat Absensi List: Responsive Mobile Cards & Desktop Table */}
          {filteredAttendance.length === 0 ? (
            <div className="py-10 px-4 text-center text-slate-400 text-xs">
              <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600">Tidak ada data absensi yang sesuai filter.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Coba ubah kata kunci pencarian atau filter teknisi.</p>
            </div>
          ) : (
            <div>
              {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
              <div className="block md:hidden divide-y divide-slate-100">
                {filteredAttendance.map(att => {
                  const isManual = (att.keterangan || '').includes('Absen Manual Admin') || (att.keteranganPulang || '').includes('Manual');
                  const hasValidPulang = Boolean(att.jamPulang && att.jamPulang !== '-' && att.jamPulang.includes(':'));

                  return (
                    <div key={att.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                      {/* Top Header: Date & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{sanitizeDateString(att.tanggal)}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                            att.status === 'Hadir'
                              ? 'bg-emerald-100 text-emerald-800'
                              : att.status === 'Ditolak'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {att.status}
                        </span>
                      </div>

                      {/* Technician & Server */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-slate-900 text-sm">{att.teknisiNama}</p>
                          <div className="flex items-center space-x-1 text-slate-500 text-xs mt-0.5">
                            <Server className="w-3 h-3 text-slate-400" />
                            <span>{att.serverNama || '-'}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={() => setEditingRecord(att)}
                            className="p-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                            title="Edit Jam Masuk / Pulang"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {onDeleteAttendance && (
                            <button
                              onClick={() => handlePromptDelete(att)}
                              className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Hapus Data Absensi"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Time Details Grid */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2 rounded-xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Jam Masuk</span>
                          <span className="font-mono font-extrabold text-indigo-700">{att.jamMasuk || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Jam Pulang</span>
                          {hasValidPulang ? (
                            <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block">
                              {att.jamPulang}
                            </span>
                          ) : (
                            <span className="font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-[11px] inline-block">
                              Belum Pulang
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes / Tag */}
                      {(isManual || att.keterangan) && (
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          {isManual && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Manual Admin
                            </span>
                          )}
                          {att.keterangan && (
                            <span className="text-slate-500 italic text-[11px]">{att.keterangan}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <th className="py-3 px-3">Tanggal</th>
                      <th className="py-3 px-3">Teknisi</th>
                      <th className="py-3 px-3">Server</th>
                      <th className="py-3 px-3">Jam Masuk</th>
                      <th className="py-3 px-3">Jam Pulang</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Keterangan / Tipe</th>
                      <th className="py-3 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttendance.map(att => {
                      const isManual = (att.keterangan || '').includes('Absen Manual Admin') || (att.keteranganPulang || '').includes('Manual');
                      const hasValidPulang = Boolean(att.jamPulang && att.jamPulang !== '-' && att.jamPulang.includes(':'));

                      return (
                        <tr key={att.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-900 whitespace-nowrap">
                            {sanitizeDateString(att.tanggal)}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-bold text-slate-900">{att.teknisiNama}</p>
                            <span className="text-[10px] text-slate-400">{att.teknisiId}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {att.serverNama || '-'}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">
                            {att.jamMasuk || '-'}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold">
                            {hasValidPulang ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                {att.jamPulang}
                              </span>
                            ) : (
                              <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                Belum Pulang
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                att.status === 'Hadir'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : att.status === 'Ditolak'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {att.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 max-w-xs truncate text-slate-600">
                            {isManual && (
                              <span className="mr-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Manual Admin
                              </span>
                            )}
                            <span className="text-slate-500">{att.keterangan || '-'}</span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => setEditingRecord(att)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Jam Masuk / Pulang"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              {onDeleteAttendance && (
                                <button
                                  onClick={() => handlePromptDelete(att)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Hapus Data Absensi"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Presensi Modal (Reused) */}
      {editingRecord && (
        <EditPresensiModal
          record={editingRecord}
          isOpen={Boolean(editingRecord)}
          onClose={() => setEditingRecord(null)}
          onSave={async updated => {
            await onSaveAttendance(updated);
            setEditingRecord(null);
          }}
        />
      )}
    </div>
  );
};

export const AbsenManualView: React.FC<AbsenManualViewProps> = React.memo(AbsenManualViewComponent);
