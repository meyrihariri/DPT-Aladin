import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, MapPin, Users, Check, AlertCircle, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import {
  JobRecord,
  Employee,
  ServerData,
  JenisPekerjaan,
  WilayahPekerjaan,
  VehicleType,
  AttendanceRecord,
  AppSettings
} from '../types';
import { formatRupiah } from '../services/payroll';
import { MultiPhotoUploader } from './MultiPhotoUploader';
import { NumericInput } from './NumericInput';
import { uploadPhotoToGoogleDrive, sanitizeDateString, isHolidayDate, getEffectiveTodayISO } from '../services/googleSheetsHelper';
import { isDeviceOnline, checkNetworkHealth } from '../utils/networkCheck';
import { showAppAlert, showAppConfirm } from '../utils/dialogService';
import { sortJenisPekerjaan, StorageService, findJenisPekerjaan, isJobNeedTitik, isJobNeedKabel, isJobMulti } from '../services/storage';

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveJob: (job: JobRecord) => Promise<{ success: boolean; message?: string } | void> | void;
  employees: Employee[];
  servers: ServerData[];
  jenisList: JenisPekerjaan[];
  wilayahList?: WilayahPekerjaan[];
  currentUser?: Employee | null;
  editingJob?: JobRecord | null;
  googleAppsScriptUrl?: string;
  attendanceList?: AttendanceRecord[];
  settings?: AppSettings;
}

interface CatatanInputProps {
  value: string;
  onChange: (val: string) => void;
}

const CatatanInput: React.FC<CatatanInputProps> = React.memo(({ value, onChange }) => {
  const len = (value || '').trim().length;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="block text-slate-700 font-bold">
          Keterangan Pekerjaan <span className="text-rose-500">* (Min. 30 Karakter)</span>
        </label>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            len >= 30
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-rose-100 text-rose-800 border border-rose-200'
          }`}
        >
          {len} / 30 karakter
        </span>
      </div>
      <textarea
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Tuliskan keterangan detail hasil pengerjaan (wajib minimal 30 karakter)..."
        className={`w-full p-2.5 bg-slate-50 border rounded-xl font-medium focus:ring-2 focus:ring-maroon-800 focus:bg-white ${
          len > 0 && len < 30
            ? 'border-rose-300 focus:ring-rose-500'
            : 'border-slate-200'
        }`}
        rows={3}
      />
    </div>
  );
});

const JobModalContent: React.FC<JobModalProps> = ({
  isOpen,
  onClose,
  onSaveJob,
  employees,
  servers,
  jenisList,
  wilayahList = [],
  currentUser,
  editingJob,
  googleAppsScriptUrl,
  attendanceList = [],
  settings
}) => {
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [lemburApprovedState, setLemburApprovedState] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => isDeviceOnline());
  const isInitializedRef = useRef(false);
  const activeJobIdRef = useRef<string | undefined>(undefined);
  const [hasDraftRestored, setHasDraftRestored] = useState(false);

  // Initial Form State
  const [jobForm, setJobForm] = useState<{
    tanggal: string;
    teknisiUtamaId: string;
    teknisiUtamaVehicle: VehicleType;
    teknisiPendukungIds: string[];
    teknisiPendukungVehicles: Record<string, VehicleType>;
    jenisPekerjaanId: string;
    serverId: string;
    wilayahIds: string[];
    jumlahTitik: number;
    panjangKabelMeter: number;
    adaLembur: boolean;
    menitLembur: number;
    catatan: string;
    buktiFotoUrls: string[];
  }>({
    tanggal: getEffectiveTodayISO(),
    teknisiUtamaId: '',
    teknisiUtamaVehicle: 'Inventaris',
    teknisiPendukungIds: [],
    teknisiPendukungVehicles: {},
    jenisPekerjaanId: '',
    serverId: '',
    wilayahIds: [],
    jumlahTitik: 0,
    panjangKabelMeter: 0,
    adaLembur: false,
    menitLembur: 0,
    catatan: '',
    buktiFotoUrls: []
  });

  const sortedJenisList = useMemo(() => sortJenisPekerjaan(jenisList), [jenisList]);

  // Group by Jenis Pekerjaan (e.g. "Instalasi", "Trouble/Maintenance", "Distribusi Jaringan", "Pemeliharaan Jaringan")
  const groupedJenisOptions = useMemo(() => {
    const map = new Map<string, JenisPekerjaan[]>();
    sortedJenisList.forEach(item => {
      const group = (item.jenisPekerjaan || 'Lain-lain').trim();
      if (!map.has(group)) {
        map.set(group, []);
      }
      map.get(group)!.push(item);
    });
    return Array.from(map.entries());
  }, [sortedJenisList]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Precomputed high-performance attendance lookup map for the currently selected job date
  const techAttendanceStatusMap = useMemo(() => {
    const map = new Map<string, { hasMasuk: boolean; hasPulang: boolean; jamPulang?: string }>();
    if (!attendanceList || attendanceList.length === 0) return map;

    const cleanDate = sanitizeDateString(jobForm.tanggal);
    const lookup = new Map<string, AttendanceRecord>();
    for (const a of attendanceList) {
      if (a && sanitizeDateString(a.tanggal) === cleanDate) {
        if (a.teknisiId) lookup.set(String(a.teknisiId).toLowerCase().trim(), a);
        if (a.teknisiNama) lookup.set(String(a.teknisiNama).toLowerCase().trim(), a);
      }
    }

    for (const emp of employees) {
      const empIdLower = (emp.id || '').toLowerCase().trim();
      const empNamaLower = (emp.namaLengkap || '').toLowerCase().trim();
      const empUserLower = (emp.username || '').toLowerCase().trim();

      const a = lookup.get(empIdLower) || (empUserLower ? lookup.get(empUserLower) : undefined) || (empNamaLower ? lookup.get(empNamaLower) : undefined);
      if (a) {
        const hasMasuk = a.status !== 'Ditolak' && Boolean(a.jamMasuk && a.jamMasuk !== '-' && a.jamMasuk.trim().length > 0);
        const hasPulang = Boolean(a.jamPulang && a.jamPulang !== '-' && a.jamPulang.trim().length > 0);
        map.set(emp.id, { hasMasuk, hasPulang, jamPulang: a.jamPulang });
      } else {
        map.set(emp.id, { hasMasuk: false, hasPulang: false });
      }
    }

    return map;
  }, [attendanceList, employees, jobForm.tanggal]);

  // Helper: check if a technician has done daily attendance check-in on the selected date
  const checkTechAbsen = (techId: string, dateStr?: string): boolean => {
    if (!dateStr || dateStr === jobForm.tanggal) {
      return techAttendanceStatusMap.get(techId)?.hasMasuk ?? false;
    }
    const cleanDate = sanitizeDateString(dateStr);
    const techObj = employees.find(e => e.id === techId);
    const techNama = techObj ? techObj.namaLengkap.toLowerCase().trim() : '';
    const techUsername = techObj && techObj.username ? techObj.username.toLowerCase().trim() : '';
    const targetTechId = (techId || '').toLowerCase().trim();

    return attendanceList.some(a => {
      if (!a) return false;
      if (sanitizeDateString(a.tanggal) !== cleanDate) return false;
      const attTechId = (a.teknisiId || '').toLowerCase().trim();
      const attTechNama = (a.teknisiNama || '').toLowerCase().trim();

      const isMatch =
        attTechId === targetTechId ||
        (techNama && attTechNama === techNama) ||
        (techUsername && attTechId === techUsername) ||
        (techUsername && attTechNama === techUsername) ||
        (techNama && attTechNama.includes(techNama)) ||
        (techNama && techNama.includes(attTechNama));

      if (!isMatch) return false;
      const hasMasuk = Boolean(a.jamMasuk && a.jamMasuk !== '-' && a.jamMasuk.trim().length > 0);
      return hasMasuk && a.status !== 'Ditolak';
    });
  };

  // Helper: check if a technician has already done check-out (Absen Pulang) on the selected date
  const checkTechHasAbsenPulang = (techId: string, dateStr?: string): { hasPulang: boolean; jamPulang?: string } => {
    if (!dateStr || dateStr === jobForm.tanggal) {
      const info = techAttendanceStatusMap.get(techId);
      return { hasPulang: info?.hasPulang ?? false, jamPulang: info?.jamPulang };
    }
    const cleanDate = sanitizeDateString(dateStr);
    const techObj = employees.find(e => e.id === techId);
    const techNama = techObj ? techObj.namaLengkap.toLowerCase().trim() : '';
    const techUsername = techObj && techObj.username ? techObj.username.toLowerCase().trim() : '';
    const targetTechId = (techId || '').toLowerCase().trim();

    const record = attendanceList.find(a => {
      if (!a) return false;
      if (sanitizeDateString(a.tanggal) !== cleanDate) return false;
      const attTechId = (a.teknisiId || '').toLowerCase().trim();
      const attTechNama = (a.teknisiNama || '').toLowerCase().trim();

      const isMatch =
        attTechId === targetTechId ||
        (techNama && attTechNama === techNama) ||
        (techUsername && attTechId === techUsername) ||
        (techUsername && attTechNama === techUsername) ||
        (techNama && attTechNama.includes(techNama)) ||
        (techNama && techNama.includes(attTechNama));

      if (!isMatch) return false;
      const hasPulang = Boolean(a.jamPulang && a.jamPulang !== '-' && a.jamPulang.trim().length > 0);
      return hasPulang;
    });

    if (record) {
      return { hasPulang: true, jamPulang: record.jamPulang };
    }
    return { hasPulang: false };
  };

  // Helper to check if current form has unsaved content
  const hasUnsavedContent = Boolean(
    jobForm.serverId ||
    jobForm.jenisPekerjaanId ||
    jobForm.catatan ||
    jobForm.jumlahTitik > 0 ||
    jobForm.panjangKabelMeter > 0 ||
    (jobForm.buktiFotoUrls && jobForm.buktiFotoUrls.some(u => Boolean(u && u.trim().length > 0))) ||
    (jobForm.wilayahIds && jobForm.wilayahIds.length > 0) ||
    jobForm.adaLembur
  );

  const handleRequestClose = async () => {
    if (hasUnsavedContent && !isSavingJob) {
      const confirmClose = await showAppConfirm({
        title: 'Tutup Form Pekerjaan?',
        message: 'Isian data pekerjaan yang sedang Anda ketik otomatis disimpan sebagai draf dan dapat dilanjutkan kembali kapan saja.\n\nApakah Anda yakin ingin menutup form sekarang?',
        type: 'warning',
        confirmText: 'Ya, Tutup',
        cancelText: 'Lanjutkan Input'
      });
      if (!confirmClose) return;
    }
    onClose();
  };

  // Auto-save draft whenever jobForm changes (for new job creation or editing)
  useEffect(() => {
    if (!isOpen) return;

    const hasData = Boolean(
      jobForm.serverId ||
      jobForm.jenisPekerjaanId ||
      jobForm.catatan ||
      jobForm.jumlahTitik > 0 ||
      jobForm.panjangKabelMeter > 0 ||
      (jobForm.buktiFotoUrls && jobForm.buktiFotoUrls.some(u => Boolean(u && u.trim().length > 0))) ||
      (jobForm.wilayahIds && jobForm.wilayahIds.length > 0) ||
      jobForm.teknisiUtamaId ||
      (jobForm.teknisiPendukungIds && jobForm.teknisiPendukungIds.length > 0) ||
      jobForm.adaLembur
    );

    if (hasData) {
      if (editingJob?.id) {
        StorageService.saveJobDraft({ ...jobForm, _editingJobId: editingJob.id });
      } else {
        StorageService.saveJobDraft(jobForm);
      }
    }
  }, [isOpen, editingJob, jobForm]);

  // Populate form when modal opens or editingJob changes
  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false;
      return;
    }

    const currentJobId = editingJob?.id || '__new__';
    // CRITICAL BUG FIX: If modal is already open and initialized for this job, NEVER reset state on re-render!
    if (isInitializedRef.current && activeJobIdRef.current === currentJobId) {
      return;
    }

    isInitializedRef.current = true;
    activeJobIdRef.current = currentJobId;

    if (editingJob) {
      setHasDraftRestored(false);
      const selJp = findJenisPekerjaan(editingJob.jenisPekerjaanId || editingJob.subPekerjaanNama || editingJob.jenisPekerjaanNama, jenisList);
      const isMulti = isJobMulti(selJp);
      const needTitik = isJobNeedTitik(selJp);
      const needKabel = isJobNeedKabel(selJp);
      const mainTechId = editingJob.teknisiIds?.[0] || '';
      const supportTechIds = isMulti ? (editingJob.teknisiIds?.slice(1) || []) : [];
      const vehiclesMap = editingJob.teknisiVehicles || {};
      const initialWilayahIds = editingJob.wilayahIds && editingJob.wilayahIds.length > 0
        ? editingJob.wilayahIds
        : (editingJob.wilayahId ? [editingJob.wilayahId] : []);

      setLemburApprovedState(
        editingJob.lemburApproved !== undefined
          ? Boolean(editingJob.lemburApproved)
          : currentUser?.role === 'Admin'
      );

      // Check if there was an active editing draft saved for this specific job
      const savedDraft = StorageService.getJobDraft();
      if (savedDraft && typeof savedDraft === 'object' && savedDraft._editingJobId === editingJob.id) {
        setJobForm({
          tanggal: savedDraft.tanggal || editingJob.tanggal || getEffectiveTodayISO(),
          teknisiUtamaId: savedDraft.teknisiUtamaId || mainTechId,
          teknisiUtamaVehicle: savedDraft.teknisiUtamaVehicle || vehiclesMap[mainTechId] || 'Inventaris',
          teknisiPendukungIds: Array.isArray(savedDraft.teknisiPendukungIds) ? savedDraft.teknisiPendukungIds : supportTechIds,
          teknisiPendukungVehicles: savedDraft.teknisiPendukungVehicles || (isMulti ? vehiclesMap : {}),
          jenisPekerjaanId: savedDraft.jenisPekerjaanId || editingJob.jenisPekerjaanId || '',
          serverId: savedDraft.serverId || editingJob.serverId || '',
          wilayahIds: Array.isArray(savedDraft.wilayahIds) ? savedDraft.wilayahIds : initialWilayahIds,
          jumlahTitik: Number(savedDraft.jumlahTitik) || (needTitik ? (editingJob.jumlahTitik || 0) : 0),
          panjangKabelMeter: Number(savedDraft.panjangKabelMeter) || (needKabel ? (editingJob.panjangKabelMeter || 0) : 0),
          adaLembur: savedDraft.adaLembur !== undefined ? Boolean(savedDraft.adaLembur) : (editingJob.adaLembur || false),
          menitLembur: Number(savedDraft.menitLembur) || (editingJob.menitLembur || 0),
          catatan: savedDraft.catatan || editingJob.catatan || '',
          buktiFotoUrls: Array.isArray(savedDraft.buktiFotoUrls) ? savedDraft.buktiFotoUrls : (editingJob.buktiFotoUrls || [])
        });
        setHasDraftRestored(true);
      } else {
        setJobForm({
          tanggal: editingJob.tanggal || getEffectiveTodayISO(),
          teknisiUtamaId: mainTechId,
          teknisiUtamaVehicle: vehiclesMap[mainTechId] || 'Inventaris',
          teknisiPendukungIds: supportTechIds,
          teknisiPendukungVehicles: isMulti ? vehiclesMap : {},
          jenisPekerjaanId: editingJob.jenisPekerjaanId || '',
          serverId: editingJob.serverId || '',
          wilayahIds: initialWilayahIds,
          jumlahTitik: needTitik ? (editingJob.jumlahTitik || 0) : 0,
          panjangKabelMeter: needKabel ? (editingJob.panjangKabelMeter || 0) : 0,
          adaLembur: editingJob.adaLembur || false,
          menitLembur: editingJob.menitLembur || 0,
          catatan: editingJob.catatan || '',
          buktiFotoUrls:
            editingJob.buktiFotoUrls && editingJob.buktiFotoUrls.length > 0
              ? editingJob.buktiFotoUrls
              : editingJob.buktiFotoUrl
              ? [editingJob.buktiFotoUrl]
              : []
        });
      }
    } else {
      const savedDraft = StorageService.getJobDraft();
      const todayStr = getEffectiveTodayISO();
      const isAdmin = currentUser?.role === 'Admin';
      const myId = currentUser?.role === 'Teknisi' ? currentUser.id : '';
      const canDefault = isAdmin || (myId && checkTechAbsen(myId, todayStr));
      const appSettings = settings || StorageService.getSettings();
      const isJobHoliday = isHolidayDate(todayStr, appSettings).isHoliday;

      const hasValidDraft = Boolean(
        savedDraft &&
        typeof savedDraft === 'object' &&
        !savedDraft._editingJobId &&
        (
          savedDraft.catatan ||
          savedDraft.jenisPekerjaanId ||
          savedDraft.serverId ||
          (Array.isArray(savedDraft.wilayahIds) && savedDraft.wilayahIds.length > 0) ||
          Number(savedDraft.jumlahTitik) > 0 ||
          Number(savedDraft.panjangKabelMeter) > 0 ||
          (Array.isArray(savedDraft.buktiFotoUrls) && savedDraft.buktiFotoUrls.some((u: any) => Boolean(u && String(u).trim().length > 0))) ||
          (savedDraft.teknisiUtamaId && savedDraft.teknisiUtamaId !== myId) ||
          (Array.isArray(savedDraft.teknisiPendukungIds) && savedDraft.teknisiPendukungIds.length > 0) ||
          savedDraft.adaLembur
        )
      );

      if (hasValidDraft) {
        setJobForm({
          tanggal: savedDraft.tanggal || todayStr,
          teknisiUtamaId: savedDraft.teknisiUtamaId || (canDefault ? myId : ''),
          teknisiUtamaVehicle: savedDraft.teknisiUtamaVehicle || 'Inventaris',
          teknisiPendukungIds: Array.isArray(savedDraft.teknisiPendukungIds) ? savedDraft.teknisiPendukungIds : [],
          teknisiPendukungVehicles: savedDraft.teknisiPendukungVehicles || {},
          jenisPekerjaanId: savedDraft.jenisPekerjaanId || '',
          serverId: savedDraft.serverId || '',
          wilayahIds: Array.isArray(savedDraft.wilayahIds) ? savedDraft.wilayahIds : [],
          jumlahTitik: Number(savedDraft.jumlahTitik) || 0,
          panjangKabelMeter: Number(savedDraft.panjangKabelMeter) || 0,
          adaLembur: Boolean(savedDraft.adaLembur),
          menitLembur: Number(savedDraft.menitLembur) || (isJobHoliday ? 60 : 0),
          catatan: savedDraft.catatan || '',
          buktiFotoUrls: Array.isArray(savedDraft.buktiFotoUrls) ? savedDraft.buktiFotoUrls : []
        });
        setLemburApprovedState(isAdmin || isJobHoliday || Boolean(savedDraft.adaLembur));
        setHasDraftRestored(true);
      } else {
        setHasDraftRestored(false);
        setLemburApprovedState(isAdmin || isJobHoliday);
        setJobForm({
          tanggal: todayStr,
          teknisiUtamaId: canDefault ? myId : '',
          teknisiUtamaVehicle: 'Inventaris',
          teknisiPendukungIds: [],
          teknisiPendukungVehicles: {},
          jenisPekerjaanId: '',
          serverId: '',
          wilayahIds: [],
          jumlahTitik: 0,
          panjangKabelMeter: 0,
          adaLembur: isJobHoliday,
          menitLembur: isJobHoliday ? 60 : 0,
          catatan: '',
          buktiFotoUrls: []
        });
      }
    }
  }, [isOpen, editingJob?.id]);

  // Calculate live preview for job honor & transport
  const holidayInfo = useMemo(() => {
    const appSettings = settings || StorageService.getSettings();
    return isHolidayDate(jobForm.tanggal, appSettings);
  }, [jobForm.tanggal, settings]);

  const calculatePreviewHonor = (form: typeof jobForm) => {
    const selectedJenis = findJenisPekerjaan(form.jenisPekerjaanId, jenisList);
    const selectedWilayahObjects = (wilayahList || []).filter(w => form.wilayahIds.includes(w.id));
    
    // Total nominal transport from all selected wilayah
    const transportRateFromWilayah = selectedWilayahObjects.reduce(
      (acc, w) => acc + (Number(w.besaranTransport) || 0),
      0
    );

    if (!selectedJenis) {
      let totalTransportAllTechs = 0;
      if (form.teknisiUtamaVehicle === 'Pribadi' && form.teknisiUtamaId) {
        totalTransportAllTechs += transportRateFromWilayah;
      }
      return {
        total: totalTransportAllTechs,
        estimasiTotal: 0,
        perTech: 0,
        regularWorkTotalPerTech: 0,
        magangWorkTotalPerTech: 0,
        regularCount: 0,
        magangCount: 0,
        totalTransportAllTechs,
        numTechs: form.teknisiUtamaId ? 1 : 0,
        transportRate: transportRateFromWilayah,
        isMulti: false,
        selectedWilayahObjects,
        dasarPerTech: 0,
        lemburPerTech: 0,
        totalTitik: 0,
        totalKabel: 0,
        titikPerTech: 0,
        kabelPerTech: 0,
        regularPointShare: 0,
        regularCableShare: 0,
        magangPointShare: 0,
        magangCableShare: 0
      };
    }

    const needTitik = isJobNeedTitik(selectedJenis);
    const needKabel = isJobNeedKabel(selectedJenis);
    const isMulti = isJobMulti(selectedJenis);

    const tarifDasar = Number(selectedJenis.tarifDasar) || 0;
    const tarifTitik = needTitik ? (Number(selectedJenis.tarifTitik) || 0) : 0;
    const tarifKabel = needKabel ? (Number(selectedJenis.tarifTarikKabelPerMeter) || 0) : 0;
    const tarifLembur = Number(selectedJenis.tarifLemburPerMenit) || 0;

    const titik = needTitik ? (Number(form.jumlahTitik) || 0) : 0;
    const kabel = needKabel ? (Number(form.panjangKabelMeter) || 0) : 0;
    const lembur = form.adaLembur ? (Number(form.menitLembur) || 0) : 0;

    const allTechIds = [form.teknisiUtamaId, ...(isMulti ? form.teknisiPendukungIds : [])].filter(Boolean);
    const uniqueTechIds = Array.from(new Set(allTechIds));
    const numTechs = Math.max(1, uniqueTechIds.length);

    // Dapatkan status masing-masing teknisi (Tetap/Freelance vs Magang)
    const techObjs = uniqueTechIds.map(id => employees.find(e => e.id === id));
    const magangTechs = techObjs.filter(t => t?.status === 'Magang');
    const regularTechs = techObjs.filter(t => t?.status !== 'Magang');
    const magangCount = magangTechs.length;
    const regularCount = regularTechs.length;

    // Sesuai SOP & Aturan Penggajian:
    // 1. Honor Dasar Pekerjaan: Diterima UTUH oleh masing-masing teknisi Tetap & Freelance. Magang = Rp 0.
    // 2. Honor Lembur: Diterima UTUH oleh masing-masing teknisi termasuk Magang.
    // 3. Honor Titik & Honor Panjang Kabel:
    //    - Teknisi Tetap & Freelance: Dibagi rata HANYA di antara teknisi Tetap & Freelance yang bertugas.
    //      Keberadaan teknisi Magang TIDAK MEMOTONG / TIDAK MENGURANGI porsi pembagian teknisi Tetap/Freelance.
    //    - Teknisi Magang: Mendapatkan 50% dari pembagian honor tersebut.
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
      const effectiveMagangCount = Math.max(1, magangCount);
      magangPointShare = Math.round((regularPointShare * 0.5) / effectiveMagangCount);
      magangCableShare = Math.round((regularCableShare * 0.5) / effectiveMagangCount);
    } else {
      const effectiveMagangCount = Math.max(1, magangCount);
      magangPointShare = Math.round((totalTitik * 0.5) / effectiveMagangCount);
      magangCableShare = Math.round((totalKabel * 0.5) / effectiveMagangCount);
    }

    const regularWorkTotalPerTech = dasarPerTech + lemburPerTech + regularPointShare + regularCableShare;
    const magangWorkTotalPerTech = 0 + lemburPerTech + magangPointShare + magangCableShare;

    // Estimasi Total Honor pekerjaan dari seluruh teknisi
    const baseWorkTotal = (regularWorkTotalPerTech * regularCount) + (magangWorkTotalPerTech * magangCount);

    let totalTransportAllTechs = 0;
    if (form.teknisiUtamaVehicle === 'Pribadi' && form.teknisiUtamaId) {
      totalTransportAllTechs += transportRateFromWilayah;
    }
    if (isMulti) {
      form.teknisiPendukungIds.forEach(id => {
        if (form.teknisiPendukungVehicles[id] === 'Pribadi') {
          totalTransportAllTechs += transportRateFromWilayah;
        }
      });
    }

    const mainTechObj = employees.find(e => e.id === form.teknisiUtamaId);
    const isMainMagang = mainTechObj?.status === 'Magang';
    const perTechWorkBase = isMainMagang ? magangWorkTotalPerTech : regularWorkTotalPerTech;

    const total = baseWorkTotal + totalTransportAllTechs;
    return {
      total,
      estimasiTotal: baseWorkTotal, // Estimasi Honor = Dasar + Lembur + Titik + Kabel
      perTech: perTechWorkBase,
      regularWorkTotalPerTech,
      magangWorkTotalPerTech,
      regularCount,
      magangCount,
      totalTransportAllTechs,
      numTechs,
      transportRate: transportRateFromWilayah,
      isMulti,
      selectedWilayahObjects,
      dasarPerTech,
      lemburPerTech,
      totalTitik,
      totalKabel,
      titikPerTech: regularPointShare,
      kabelPerTech: regularCableShare,
      regularPointShare,
      regularCableShare,
      magangPointShare,
      magangCableShare
    };
  };

  const handleJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!jobForm.tanggal) {
      showAppAlert({
        title: 'Tanggal Diperlukan',
        message: 'Tanggal Pekerjaan wajib diisi.',
        type: 'warning'
      });
      return;
    }

    if (!jobForm.serverId) {
      showAppAlert({
        title: 'Server Belum Dipilih',
        message: 'Silakan pilih Server Pengerjaan terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    if (!jobForm.jenisPekerjaanId) {
      showAppAlert({
        title: 'Jenis Pekerjaan Diperlukan',
        message: 'Silakan pilih Jenis & Sub Pekerjaan terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    if (!jobForm.teknisiUtamaId) {
      showAppAlert({
        title: 'Teknisi Utama Diperlukan',
        message: 'Silakan pilih Teknisi Utama terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    const selectedJenis = findJenisPekerjaan(jobForm.jenisPekerjaanId, jenisList);
    const selectedServer = servers.find(s => s.id === jobForm.serverId);

    if (!selectedJenis) {
      showAppAlert({
        title: 'Data Tidak Valid',
        message: 'Jenis Pekerjaan tidak valid.',
        type: 'error'
      });
      return;
    }

    const needTitik = isJobNeedTitik(selectedJenis);
    const needKabel = isJobNeedKabel(selectedJenis);
    const isMulti = isJobMulti(selectedJenis);

    if (!selectedServer) {
      showAppAlert({
        title: 'Data Tidak Valid',
        message: 'Server Pengerjaan tidak valid.',
        type: 'error'
      });
      return;
    }

    // SOP VALIDATION: 
    // 1. Teknisi yang belum melakukan absen masuk harian tidak bisa input pekerjaan.
    // 2. Teknisi yang sudah melakukan absen pulang tidak bisa input data pekerjaan dalam tanggal yang sama.
    if (currentUser?.role !== 'Admin') {
      // 1. Validasi Teknisi Utama
      const isUtamaAbsen = checkTechAbsen(jobForm.teknisiUtamaId, jobForm.tanggal);
      if (!isUtamaAbsen) {
        const techName = employees.find(e => e.id === jobForm.teknisiUtamaId)?.namaLengkap || 'Teknisi Utama';
        showAppAlert({
          title: 'Akses Ditolak: Belum Absen Masuk',
          message: `Teknisi Utama (${techName}) belum melakukan Absen Masuk harian pada tanggal ${jobForm.tanggal}.\n\nSesuai SOP, teknisi yang belum melakukan absen masuk tidak dapat menginput pekerjaan.\nSilakan lakukan Absen Masuk terlebih dahulu, atau hubungi Admin untuk melakukan input pekerjaan.`,
          type: 'warning'
        });
        return;
      }

      const utamaPulang = checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal);
      if (utamaPulang.hasPulang) {
        const techName = employees.find(e => e.id === jobForm.teknisiUtamaId)?.namaLengkap || 'Teknisi Utama';
        showAppAlert({
          title: 'Teknisi Sudah Absen Pulang',
          message: `Teknisi Utama (${techName}) sudah melakukan Absen Pulang pada tanggal ${jobForm.tanggal}${utamaPulang.jamPulang ? ` (Pukul ${utamaPulang.jamPulang} WIB)` : ''}.\n\nSesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat melakukan input data pekerjaan pada tanggal yang sama.\n\nSilakan hubungi Admin jika terdapat data pekerjaan yang perlu disusulkan.`,
          type: 'error'
        });
        return;
      }

      // 2. Validasi Teknisi Pendukung (jika multi-teknisi)
      if (isMulti && jobForm.teknisiPendukungIds.length > 0) {
        for (const pendukungId of jobForm.teknisiPendukungIds) {
          const isPendukungAbsen = checkTechAbsen(pendukungId, jobForm.tanggal);
          if (!isPendukungAbsen) {
            const techName = employees.find(e => e.id === pendukungId)?.namaLengkap || 'Teknisi Pendukung';
            showAppAlert({
              title: 'Akses Ditolak: Belum Absen Masuk',
              message: `Teknisi Pendukung (${techName}) belum melakukan Absen Masuk harian pada tanggal ${jobForm.tanggal}.\n\nSemua teknisi (utama maupun pendukung) wajib sudah melakukan absen masuk.\nSilakan pastikan seluruh teknisi sudah absen masuk, atau hubungi Admin.`,
              type: 'warning'
            });
            return;
          }

          const pendukungPulang = checkTechHasAbsenPulang(pendukungId, jobForm.tanggal);
          if (pendukungPulang.hasPulang) {
            const techName = employees.find(e => e.id === pendukungId)?.namaLengkap || 'Teknisi Pendukung';
            showAppAlert({
              title: 'Teknisi Sudah Absen Pulang',
              message: `Teknisi Pendukung (${techName}) sudah melakukan Absen Pulang pada tanggal ${jobForm.tanggal}${pendukungPulang.jamPulang ? ` (Pukul ${pendukungPulang.jamPulang} WIB)` : ''}.\n\nSesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat melakukan input data pekerjaan pada tanggal yang sama.\n\nSilakan hubungi Admin jika terdapat data pekerjaan yang perlu disusulkan.`,
              type: 'error'
            });
            return;
          }
        }
      }
    }

    if (needTitik && (jobForm.jumlahTitik === undefined || jobForm.jumlahTitik === null || Number(jobForm.jumlahTitik) < 0)) {
      showAppAlert({
        title: 'Jumlah Titik Diperlukan',
        message: 'Wajib mengisikan Jumlah Titik (minimal 0 titik).',
        type: 'warning'
      });
      return;
    }

    if (needKabel && (jobForm.panjangKabelMeter === undefined || jobForm.panjangKabelMeter === null || Number(jobForm.panjangKabelMeter) < 0)) {
      showAppAlert({
        title: 'Panjang Kabel Diperlukan',
        message: 'Wajib mengisikan Panjang Kabel (minimal 0 meter).',
        type: 'warning'
      });
      return;
    }

    if (jobForm.adaLembur && (Number(jobForm.menitLembur) || 0) <= 0) {
      showAppAlert({
        title: 'Durasi Lembur Diperlukan',
        message: 'Wajib mengisikan Durasi Lembur dalam menit jika lembur dipilih.',
        type: 'warning'
      });
      return;
    }

    // 0. Strict network connectivity check: Cegah teknisi input pekerjaan saat internet tidak normal
    if (!isDeviceOnline()) {
      showAppAlert({
        title: 'Koneksi Terputus',
        message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nSilakan periksa koneksi HP Anda.',
        type: 'warning'
      });
      return;
    }

    const netCheck = await checkNetworkHealth();
    if (!netCheck.ok) {
      showAppAlert({
        title: 'Koneksi Internet Lemah',
        message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nSistem mencegah penyimpanan lokal agar tidak ada data yang tertahan.',
        type: 'warning'
      });
      return;
    }

    // Validate Catatan / Keterangan Pekerjaan minimal 30 characters
    const cleanCatatan = (jobForm.catatan || '').trim();
    if (!cleanCatatan || cleanCatatan.length < 30) {
      showAppAlert({
        title: 'Catatan Belum Memenuhi Syarat',
        message: `Catatan/Keterangan Pekerjaan wajib diisi minimal 30 karakter.\n\nSaat ini baru: ${cleanCatatan.length} karakter.`,
        type: 'warning'
      });
      return;
    }

    // Validate 4 Bukti Foto: Foto 1 (Bukti Pekerjaan) & Foto 2 (Bukti Titik/Lokasi) are mandatory
    const fotoPekerjaan = (jobForm.buktiFotoUrls && jobForm.buktiFotoUrls[0]) || '';
    const fotoLokasi = (jobForm.buktiFotoUrls && jobForm.buktiFotoUrls[1]) || '';

    if (!fotoPekerjaan || fotoPekerjaan.trim().length === 0) {
      showAppAlert({
        title: 'Foto 1 Wajib Diunggah',
        message: 'Wajib mengunggah Foto 1: Bukti Pekerjaan.',
        type: 'warning'
      });
      return;
    }

    if (!fotoLokasi || fotoLokasi.trim().length === 0) {
      showAppAlert({
        title: 'Foto 2 Wajib Diunggah',
        message: 'Wajib mengunggah Foto 2: Bukti Titik / Lokasi.',
        type: 'warning'
      });
      return;
    }

    setIsSavingJob(true);

    try {
      let finalPhotos = [...(jobForm.buktiFotoUrls || [])];

      // Auto upload any pending base64 photos to Google Drive if connected
      if (googleAppsScriptUrl && googleAppsScriptUrl.trim().length > 0) {
        finalPhotos = await Promise.all(
          finalPhotos.map(async (photo, idx) => {
            if (photo && photo.startsWith('data:image')) {
              try {
                const res = await uploadPhotoToGoogleDrive(
                  googleAppsScriptUrl,
                  photo,
                  `job_${Date.now()}_slot_${idx + 1}.jpg`
                );
                if (res.success && res.url) {
                  return res.url;
                }
              } catch (err) {
                console.warn(`Failed uploading slot ${idx + 1} to Drive, keeping local photo:`, err);
              }
            }
            return photo;
          })
        );
      }

      const validPhotos = finalPhotos.filter(p => p && p.trim().length > 0);

      const isMulti = selectedJenis.isMultiTeknisi;
      const allTechIds = [jobForm.teknisiUtamaId, ...(isMulti ? jobForm.teknisiPendukungIds : [])].filter(Boolean);
      const uniqueTechIds = Array.from(new Set(allTechIds));

      const techNamas = uniqueTechIds.map(
        id => employees.find(e => e.id === id)?.namaLengkap || 'Teknisi'
      );

      const vehiclesMap: Record<string, VehicleType> = {
        [jobForm.teknisiUtamaId]: jobForm.teknisiUtamaVehicle || 'Inventaris'
      };

      if (isMulti) {
        jobForm.teknisiPendukungIds.forEach(id => {
          vehiclesMap[id] = jobForm.teknisiPendukungVehicles[id] || 'Inventaris';
        });
      }

      const preview = calculatePreviewHonor(jobForm);
      const selectedWil = (wilayahList || []).filter(w => jobForm.wilayahIds.includes(w.id));
      const wilayahNamas = selectedWil.map(w => w.namaWilayah);
      const totalTransportVal = selectedWil.reduce((sum, w) => sum + (Number(w.besaranTransport) || 0), 0);

      const appSettings = settings || StorageService.getSettings();
      const isJobHoliday = isHolidayDate(jobForm.tanggal, appSettings).isHoliday;
      const isLemburFinal = jobForm.adaLembur || isJobHoliday;
      const menitLemburFinal = isLemburFinal ? (jobForm.menitLembur > 0 ? Number(jobForm.menitLembur) : (isJobHoliday ? 60 : 0)) : 0;
      const isApprovedFinal = isJobHoliday ? true : (isLemburFinal ? Boolean(lemburApprovedState) : false);

      const savedRecord: JobRecord = {
        id: editingJob ? editingJob.id : `job-${Date.now()}`,
        tanggal: jobForm.tanggal,
        teknisiIds: uniqueTechIds,
        teknisiNamas: techNamas,
        teknisiVehicles: vehiclesMap,
        jenisPekerjaanId: selectedJenis.id,
        jenisPekerjaanNama: selectedJenis.jenisPekerjaan,
        subPekerjaanNama: selectedJenis.subPekerjaan,
        serverId: selectedServer.id,
        namaServer: selectedServer.namaServer,
        wilayahId: jobForm.wilayahIds[0] || '',
        wilayahIds: jobForm.wilayahIds,
        wilayahNamas: wilayahNamas,
        totalTransportWilayah: totalTransportVal,
        transport: totalTransportVal,
        jumlahTitik: needTitik ? Number(jobForm.jumlahTitik) || 0 : 0,
        panjangKabelMeter: needKabel ? Number(jobForm.panjangKabelMeter) || 0 : 0,
        adaLembur: isLemburFinal,
        menitLembur: menitLemburFinal,
        lemburApproved: isApprovedFinal,
        lemburApprovedBy: isApprovedFinal
          ? (isJobHoliday ? 'Sistem (Otomatis Hari Libur)' : (editingJob?.lemburApprovedBy || currentUser?.namaLengkap || 'Admin'))
          : undefined,
        lemburApprovedAt: isApprovedFinal
          ? (editingJob?.lemburApprovedAt || new Date().toISOString())
          : undefined,
        estimasiTotalHonor: preview.estimasiTotal,
        honorPerTeknisi: preview.perTech,
        buktiFotoUrls: validPhotos,
        buktiFotoUrl: validPhotos[0] || '',
        catatan: cleanCatatan
      };

      const saveResult = await onSaveJob(savedRecord);
      if (saveResult && typeof saveResult === 'object' && saveResult.success === false) {
        showAppAlert({
          title: 'Gagal Menyimpan Pekerjaan',
          message: saveResult.message || 'Jaringan internet tidak normal, data gagal di upload ke database.',
          type: 'error'
        });
        return;
      }

      StorageService.clearJobDraft();
      onClose();
    } catch (err: any) {
      console.error('Error saving job:', err);
      showAppAlert({
        title: 'Gagal Menyimpan Pekerjaan',
        message: `Jaringan internet tidak normal, data gagal di upload ke database.\n\nDetail: ${err.message || 'Gagal tersambung'}`,
        type: 'error'
      });
    } finally {
      setIsSavingJob(false);
    }
  };

  const currentJenis = React.useMemo(() => {
    if (!jobForm.jenisPekerjaanId) return null;
    const match = findJenisPekerjaan(jobForm.jenisPekerjaanId, sortedJenisList) || findJenisPekerjaan(jobForm.jenisPekerjaanId, jenisList);
    if (!match) return null;

    const effectiveTitik = isJobNeedTitik(match);
    const effectiveKabel = isJobNeedKabel(match);
    const effectiveMulti = isJobMulti(match);

    return {
      ...match,
      butuhInputTitik: effectiveTitik,
      butuhPanjangKabel: effectiveKabel,
      isMultiTeknisi: effectiveMulti
    };
  }, [jobForm.jenisPekerjaanId, jenisList, sortedJenisList]);
  const selectedServerObj = servers.find(s => s.id === jobForm.serverId) || null;

  // Filter wilayah: ditampilkan sesuai pilihan server
  const serverWilayahList = React.useMemo(() => {
    return jobForm.serverId
      ? (wilayahList || []).filter(w => w.serverId === jobForm.serverId)
      : [];
  }, [jobForm.serverId, wilayahList]);

  // Dropdown lists sorted alphabetically
  const sortedServers = React.useMemo(() => {
    return [...servers].sort((a, b) =>
      a.namaServer.localeCompare(b.namaServer, 'id', { sensitivity: 'base' })
    );
  }, [servers]);

  // Only employees with role 'Teknisi' can be assigned to jobs (PJS and Admin excluded)
  const sortedEligibleTechs = React.useMemo(() => {
    return [...employees]
      .filter(e => e.role === 'Teknisi' || (editingJob && editingJob.teknisiIds?.includes(e.id)))
      .sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, 'id', { sensitivity: 'base' }));
  }, [employees, editingJob]);

  const availableSupportTechs = React.useMemo(() => {
    return sortedEligibleTechs.filter(e => e.id !== jobForm.teknisiUtamaId);
  }, [sortedEligibleTechs, jobForm.teknisiUtamaId]);

  const preview = React.useMemo(() => {
    return calculatePreviewHonor(jobForm);
  }, [
    jobForm.jenisPekerjaanId,
    jobForm.wilayahIds,
    jobForm.teknisiUtamaId,
    jobForm.teknisiUtamaVehicle,
    jobForm.teknisiPendukungIds,
    jobForm.teknisiPendukungVehicles,
    jobForm.jumlahTitik,
    jobForm.panjangKabelMeter,
    jobForm.adaLembur,
    jobForm.menitLembur,
    jenisList,
    wilayahList
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">
              {editingJob ? 'Edit Data Pekerjaan Teknisi' : 'Input Data Pekerjaan Teknisi'}
            </h3>
            <p className="text-[11px] text-slate-500">
              Form Input Data Pekerjaan
            </p>
          </div>
          <button
            onClick={handleRequestClose}
            disabled={isSavingJob}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleJobSubmit} className="space-y-4 text-xs font-medium">
          {/* Draft Restored Banner */}
          {hasDraftRestored && !editingJob && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900 text-xs">
              <span className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Isian pekerjaan sebelumnya otomatis dipulihkan agar tidak hilang.</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  StorageService.clearJobDraft();
                  setHasDraftRestored(false);
                  const todayStr = getEffectiveTodayISO();
                  const isAdmin = currentUser?.role === 'Admin';
                  const myId = currentUser?.role === 'Teknisi' ? currentUser.id : '';
                  const canDefault = isAdmin || (myId && checkTechAbsen(myId, todayStr));
                  setJobForm({
                    tanggal: todayStr,
                    teknisiUtamaId: canDefault ? myId : '',
                    teknisiUtamaVehicle: 'Inventaris',
                    teknisiPendukungIds: [],
                    teknisiPendukungVehicles: {},
                    jenisPekerjaanId: '',
                    serverId: '',
                    wilayahIds: [],
                    jumlahTitik: 0,
                    panjangKabelMeter: 0,
                    adaLembur: false,
                    menitLembur: 0,
                    catatan: '',
                    buktiFotoUrls: []
                  });
                }}
                className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 ml-2 cursor-pointer shrink-0"
              >
                Hapus &amp; Reset
              </button>
            </div>
          )}

          {/* Offline / Abnormal Network Warning Banner */}
          {!isOnline && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-2.5 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs">Jaringan internet tidak normal / terputus</p>
                <p className="text-[11px] text-rose-700 leading-relaxed">
                  Sistem mencegah pengiriman agar tidak ada data pekerjaan yang tersimpan di penyimpanan lokal HP. Pastikan koneksi internet stabil sebelum menyimpan.
                </p>
              </div>
            </div>
          )}

          {/* 1. Tanggal */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Tanggal Pekerjaan <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={jobForm.tanggal}
              onChange={e => setJobForm(prev => ({ ...prev, tanggal: e.target.value }))}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:ring-2 focus:ring-maroon-800 focus:bg-white"
            />
          </div>

          {/* 2. Server */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Server Pengerjaan <span className="text-rose-500">*</span>
            </label>
            <select
              value={jobForm.serverId}
              onChange={e => {
                const newServerId = e.target.value;
                setJobForm(prev => {
                  if (prev.serverId === newServerId) return prev;
                  // Retain existing selected wilayah that belong to the new server
                  const validWilayah = (wilayahList || [])
                    .filter(w => w.serverId === newServerId && prev.wilayahIds.includes(w.id))
                    .map(w => w.id);
                  return {
                    ...prev,
                    serverId: newServerId,
                    wilayahIds: validWilayah
                  };
                });
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold focus:ring-2 focus:ring-maroon-800 focus:bg-white text-slate-800"
            >
              <option value="">-- Pilih Server --</option>
              {sortedServers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.namaServer} ({s.alamat || 'Lokasi'})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Jenis & Sub Pekerjaan */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Jenis &amp; Sub Pekerjaan <span className="text-rose-500">*</span>
            </label>
            <select
              value={jobForm.jenisPekerjaanId}
              onChange={e => {
                const newJpId = e.target.value;
                const selJp = findJenisPekerjaan(newJpId, sortedJenisList) || findJenisPekerjaan(newJpId, jenisList);
                const needTitik = isJobNeedTitik(selJp);
                const needKabel = isJobNeedKabel(selJp);
                const isMulti = isJobMulti(selJp);
                setJobForm(prev => ({
                  ...prev,
                  jenisPekerjaanId: newJpId,
                  jumlahTitik: needTitik ? prev.jumlahTitik : 0,
                  panjangKabelMeter: needKabel ? prev.panjangKabelMeter : 0,
                  teknisiPendukungIds: isMulti ? prev.teknisiPendukungIds : [],
                  teknisiPendukungVehicles: isMulti ? prev.teknisiPendukungVehicles : {}
                }));
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-maroon-800 focus:bg-white cursor-pointer"
            >
              <option value="">-- Pilih Jenis &amp; Sub Pekerjaan --</option>
              {groupedJenisOptions.map(([groupName, items]) => (
                <optgroup key={groupName} label={`📁 ${groupName.toUpperCase()}`}>
                  {items.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.jenisPekerjaan} - {j.subPekerjaan}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Indikator Konfigurasi Jenis & Sub Pekerjaan */}
            {currentJenis && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">
                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                  currentJenis.butuhInputTitik
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-slate-100 text-slate-400 line-through'
                }`}>
                  <span>{currentJenis.butuhInputTitik ? '✓ Butuh Titik' : '✕ Tanpa Titik'}</span>
                </span>
                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                  currentJenis.butuhPanjangKabel
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 text-slate-400 line-through'
                }`}>
                  <span>{currentJenis.butuhPanjangKabel ? '✓ Butuh Kabel' : '✕ Tanpa Kabel'}</span>
                </span>
                <span className={`px-2 py-0.5 rounded-md font-bold flex items-center space-x-1 ${
                  currentJenis.isMultiTeknisi
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  <span>{currentJenis.isMultiTeknisi ? '👥 Multi-Teknisi' : '👤 Single-Teknisi'}</span>
                </span>
              </div>
            )}
          </div>

          {/* 4. Teknisi Utama */}
          <div className="p-3 bg-maroon-50/70 border border-maroon-100 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-maroon-900 font-extrabold text-xs flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-maroon-800" />
                <span>Teknisi Utama</span> <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] bg-maroon-100 text-maroon-800 px-1.5 py-0.5 rounded-md font-bold">
                Penanggung Jawab Job
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 text-[10px] font-bold mb-0.5">
                  Teknisi Utama <span className="text-rose-500">*</span>
                </label>
                <select
                  value={jobForm.teknisiUtamaId}
                  onChange={e => {
                    const newTechId = e.target.value;
                    setJobForm(prev => ({
                      ...prev,
                      teknisiUtamaId: newTechId,
                      teknisiPendukungIds: prev.teknisiPendukungIds.filter(id => id !== newTechId)
                    }));
                  }}
                  className="w-full p-2 bg-white border border-maroon-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-maroon-800"
                >
                  <option value="">-- Pilih Teknisi Utama --</option>
                  {sortedEligibleTechs.map(emp => {
                      const hasAbsen = checkTechAbsen(emp.id, jobForm.tanggal);
                      const pulangInfo = checkTechHasAbsenPulang(emp.id, jobForm.tanggal);
                      const isOptionDisabled = currentUser?.role !== 'Admin' && (!hasAbsen || pulangInfo.hasPulang);
                      let statusBadge = '🔴 [Belum Absen Masuk]';
                      if (pulangInfo.hasPulang) {
                        statusBadge = `⛔ [Sudah Pulang ${pulangInfo.jamPulang ? `(${pulangInfo.jamPulang})` : ''}]`;
                      } else if (hasAbsen) {
                        statusBadge = '🟢 [Aktif / Bertugas]';
                      }
                      return (
                        <option
                          key={emp.id}
                          value={emp.id}
                          disabled={isOptionDisabled}
                        >
                          {emp.namaLengkap} ({emp.role}) {statusBadge}
                        </option>
                      );
                    })}
                </select>
                {jobForm.teknisiUtamaId && !checkTechAbsen(jobForm.teknisiUtamaId, jobForm.tanggal) && (
                  <p className="mt-1 text-[10px] text-rose-600 font-bold flex items-center space-x-1">
                    <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                    <span>Belum absen masuk harian pada tanggal ini!</span>
                  </p>
                )}
                {jobForm.teknisiUtamaId && checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).hasPulang && (
                  <div className="mt-1 text-[10px] text-rose-800 font-bold flex items-center space-x-1 bg-rose-100/90 border border-rose-300 p-1.5 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>
                      Sudah absen pulang {checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).jamPulang ? `pukul ${checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).jamPulang} WIB` : 'hari ini'}. Sesuai SOP, input pekerjaan tidak diizinkan!
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-600 text-[10px] font-bold mb-0.5">
                  Kendaraan Teknisi Utama <span className="text-rose-500">*</span>
                </label>
                <select
                  value={jobForm.teknisiUtamaVehicle}
                  onChange={e => setJobForm(prev => ({ ...prev, teknisiUtamaVehicle: e.target.value as VehicleType }))}
                  className="w-full p-2 bg-white border border-maroon-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-maroon-800"
                >
                  <option value="Inventaris">🛵 Inventaris (Rp 0)</option>
                  <option value="Pribadi">🚗 Pribadi (+Transport Wilayah)</option>
                  <option value="Jalan Kaki">🚶 Jalan Kaki (Rp 0)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 5. Teknisi Pendukung (jika multi teknisi) */}
          {currentJenis?.isMultiTeknisi && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-amber-900 font-extrabold text-xs">
                  Teknisi Pendukung &amp; Kendaraan (Multi-Teknisi)
                </label>
                <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                  Pekerjaan Multi-Teknisi
                </span>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto p-1">
                {availableSupportTechs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Tidak ada teknisi pendukung lain yang tersedia.</p>
                ) : (
                  availableSupportTechs.map(emp => {
                    const isChecked = jobForm.teknisiPendukungIds.includes(emp.id);
                    const currentVeh = jobForm.teknisiPendukungVehicles[emp.id] || 'Inventaris';
                    const hasAbsen = checkTechAbsen(emp.id, jobForm.tanggal);
                    const pulangInfo = checkTechHasAbsenPulang(emp.id, jobForm.tanggal);
                    const isSupportDisabled = currentUser?.role !== 'Admin' && (!hasAbsen || pulangInfo.hasPulang);

                    return (
                      <div
                        key={emp.id}
                        className={`p-2 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
                          isSupportDisabled
                            ? 'bg-slate-100/70 border-slate-200 opacity-70'
                            : isChecked
                            ? 'bg-white border-amber-300 shadow-xs'
                            : 'bg-slate-50/50 border-slate-200'
                        }`}
                      >
                        <label className={`flex items-center space-x-2 text-xs font-bold ${isSupportDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer text-slate-800'}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isSupportDisabled}
                            onChange={e => {
                              if (e.target.checked) {
                                setJobForm(prev => ({
                                  ...prev,
                                  teknisiPendukungIds: [...prev.teknisiPendukungIds, emp.id],
                                  teknisiPendukungVehicles: {
                                    ...prev.teknisiPendukungVehicles,
                                    [emp.id]: 'Inventaris'
                                  }
                                }));
                              } else {
                                setJobForm(prev => {
                                  const nextVeh = { ...prev.teknisiPendukungVehicles };
                                  delete nextVeh[emp.id];
                                  return {
                                    ...prev,
                                    teknisiPendukungIds: prev.teknisiPendukungIds.filter(id => id !== emp.id),
                                    teknisiPendukungVehicles: nextVeh
                                  };
                                });
                              }
                            }}
                            className="rounded text-amber-600 focus:ring-amber-500"
                          />
                          <span>{emp.namaLengkap}</span>
                          {pulangInfo.hasPulang ? (
                            <span className="text-[9px] bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.2 rounded font-bold">
                              Sudah Pulang {pulangInfo.jamPulang ? `(${pulangInfo.jamPulang})` : ''}
                            </span>
                          ) : hasAbsen ? (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                              Sudah Absen
                            </span>
                          ) : (
                            <span className="text-[9px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                              Belum Absen Masuk
                            </span>
                          )}
                        </label>

                        {isChecked && (
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold">Kendaraan:</span>
                            <select
                              value={currentVeh}
                              onChange={e => {
                                const newVeh = e.target.value as VehicleType;
                                setJobForm(prev => ({
                                  ...prev,
                                  teknisiPendukungVehicles: {
                                    ...prev.teknisiPendukungVehicles,
                                    [emp.id]: newVeh
                                  }
                                }));
                              }}
                              className="p-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg font-bold"
                            >
                              <option value="Inventaris">🛵 Inventaris</option>
                              <option value="Pribadi">🚗 Pribadi (+Transport)</option>
                              <option value="Jalan Kaki">🚶 Jalan Kaki</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 6. Wilayah Pengerjaan (Ditampilkan Sesuai Pilihan Server) */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <label className="block text-emerald-950 font-extrabold text-xs flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Wilayah Pengerjaan</span>
                </label>
                <p className="text-[10px] text-emerald-800 leading-tight">
                  {selectedServerObj
                    ? `Daftar wilayah terhubung pada Server: ${selectedServerObj.namaServer}`
                    : 'Pilih Server untuk menampilkan wilayah'}
                </p>
              </div>
            </div>

            {/* Content: Dependent on Server Selection */}
            {!jobForm.serverId ? (
              <div className="p-3.5 bg-white/80 border border-dashed border-slate-300 rounded-xl text-center space-y-1">
                <MapPin className="w-4 h-4 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Pilih Server Terlebih Dahulu</p>
                <p className="text-[10px] text-slate-500">
                  Daftar wilayah akan otomatis ditampilkan sesuai dengan Server Pengerjaan yang Anda pilih.
                </p>
              </div>
            ) : serverWilayahList.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-1">
                <p className="text-xs font-bold text-amber-900">Belum Ada Wilayah Terdaftar</p>
                <p className="text-[10px] text-amber-700">
                  Tidak ada data wilayah untuk server <strong>{selectedServerObj?.namaServer}</strong>. Anda dapat mendaftarkan wilayah di menu <em>Master Data &gt; Wilayah</em>.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto p-1 bg-white/70 rounded-xl border border-emerald-100">
                {serverWilayahList.map(w => {
                  const isChecked = jobForm.wilayahIds.includes(w.id);

                  return (
                    <div
                      key={w.id}
                      onClick={() => {
                        setJobForm(prev => ({
                          ...prev,
                          wilayahIds: isChecked
                            ? prev.wilayahIds.filter(id => id !== w.id)
                            : [...prev.wilayahIds, w.id]
                        }));
                      }}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-300 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <span className={`font-bold text-xs block truncate ${isChecked ? 'text-emerald-950' : 'text-slate-800'}`}>
                            {w.namaWilayah}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            Transport Wilayah
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg inline-block ${
                          isChecked
                            ? 'bg-emerald-200 text-emerald-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          +{formatRupiah(w.besaranTransport)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Wilayah Selection Summary Bar */}
            {serverWilayahList.length > 0 && (
              <div className="pt-1.5 flex items-center justify-between text-[11px] border-t border-emerald-200/60">
                <span className="text-emerald-900 font-bold">
                  {jobForm.wilayahIds.length} Wilayah Terpilih
                </span>
                <div className="flex items-center space-x-1">
                  <span className="text-slate-600 font-semibold">Total Biaya Transport:</span>
                  <span className="font-black text-emerald-800 text-xs bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                    {formatRupiah(preview.transportRate)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 7. Lembur/Tidak */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-slate-800 font-bold text-xs block">
                  Lembur / Tidak
                </label>
                <span className="text-[10px] text-slate-500">
                  Apakah lembur?
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setJobForm(prev => ({ ...prev, adaLembur: false, menitLembur: 0 }))}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    !jobForm.adaLembur
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  Tidak
                </button>
                <button
                  type="button"
                  onClick={() => setJobForm(prev => ({ ...prev, adaLembur: true, menitLembur: prev.menitLembur > 0 ? prev.menitLembur : 60 }))}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    jobForm.adaLembur
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  Lembur
                </button>
              </div>
            </div>

            {jobForm.adaLembur && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                {holidayInfo.isHoliday && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      <strong>Hari Libur:</strong> Tanggal ini adalah hari libur ({holidayInfo.reason || 'Hari Libur'}). Semua pekerjaan pada hari libur otomatis <strong>di-ACC sebagai Lembur</strong>.
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="text-slate-700 font-bold text-xs block">Durasi (Menit):</label>
                    {currentJenis?.tarifLemburPerMenit ? (
                      <span className="text-[10px] text-amber-700 font-semibold">
                        Tarif: {formatRupiah(currentJenis.tarifLemburPerMenit)}/menit
                      </span>
                    ) : null}
                  </div>
                  <div className="w-36">
                    <NumericInput
                      value={jobForm.menitLembur}
                      onChange={val => setJobForm(prev => ({ ...prev, menitLembur: val }))}
                      min={0}
                      suffix="mnt"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Overtime Approval Logic (User Request #7) */}
                {currentUser?.role === 'Admin' ? (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-amber-900 text-[11px]">Persetujuan Lembur (Admin):</span>
                    </div>
                    <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-xs">
                      <input
                        type="checkbox"
                        checked={lemburApprovedState}
                        onChange={e => setLemburApprovedState(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span className={lemburApprovedState ? 'text-emerald-700 font-bold' : 'text-slate-600'}>
                        {lemburApprovedState ? 'Disetujui (Dihitung di Gaji)' : 'Belum Disetujui'}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="p-2 bg-amber-50/70 border border-amber-200 rounded-xl text-[10px] text-amber-900 flex items-start space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Pemberitahuan:</strong> Pekerjaan lembur harus disetujui (ACC) oleh Admin. Jika tidak disetujui, lembur tidak akan dihitung pada rekap gaji.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 8 & 9. Jumlah Titik & Panjang Kabel (Dinamis: Disembunyikan/Ditampilkan sesuai kebutuhan Jenis Pekerjaan) */}
          {currentJenis ? (
            (currentJenis.butuhInputTitik || currentJenis.butuhPanjangKabel) ? (
              <div className={`grid gap-3 ${
                (currentJenis.butuhInputTitik && currentJenis.butuhPanjangKabel)
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1'
              }`}>
                {/* Jumlah Titik: Hanya ditampilkan jika Jenis Pekerjaan membutuhkan input titik */}
                {currentJenis.butuhInputTitik && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-700 font-bold text-xs truncate">
                        Jumlah Titik <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md font-bold border border-indigo-200 shrink-0">
                        +{formatRupiah(currentJenis.tarifTitik || 0)}/titik
                      </span>
                    </div>
                    <NumericInput
                      value={jobForm.jumlahTitik}
                      onChange={val => setJobForm(prev => ({ ...prev, jumlahTitik: val }))}
                      min={0}
                      placeholder="0"
                    />
                  </div>
                )}

                {/* Panjang Kabel: Hanya ditampilkan jika Jenis Pekerjaan membutuhkan panjang kabel */}
                {currentJenis.butuhPanjangKabel && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-700 font-bold text-xs truncate">
                        Panjang Kabel (m) <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md font-bold border border-indigo-200 shrink-0">
                        +{formatRupiah(currentJenis.tarifTarikKabelPerMeter || 0)}/m
                      </span>
                    </div>
                    <NumericInput
                      value={jobForm.panjangKabelMeter}
                      onChange={val => setJobForm(prev => ({ ...prev, panjangKabelMeter: val }))}
                      min={0}
                      suffix="m"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-[11px] text-slate-500">
                <span>Pekerjaan ini tidak membutuhkan input Jumlah Titik maupun Panjang Kabel.</span>
              </div>
            )
          ) : (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center text-[11px] text-slate-500">
              <span>Pilih Jenis &amp; Sub Pekerjaan di atas untuk menampilkan kebutuhan isian Titik &amp; Panjang Kabel.</span>
            </div>
          )}

          {/* 10. Catatan / Keterangan Pekerjaan (Dipindahkan ke atas foto) */}
          <CatatanInput
            value={jobForm.catatan || ''}
            onChange={val => {
              setJobForm(prev => ({ ...prev, catatan: val }));
            }}
          />

          {/* 11. Upload Foto Bukti Pekerjaan */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <MultiPhotoUploader
              photos={jobForm.buktiFotoUrls}
              onChange={photos => setJobForm(prev => ({ ...prev, buktiFotoUrls: photos }))}
              scriptUrl={googleAppsScriptUrl}
              minPhotos={2}
              maxPhotos={4}
            />
          </div>

          {/* Realtime Honor & Transport Calculation Preview */}
          <div className="p-3 bg-maroon-50 border border-maroon-100 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center pb-1.5 border-b border-maroon-200/50">
              <div>
                <span className="text-[10px] text-maroon-800 font-bold block uppercase tracking-wider">
                  Estimasi Honor Pokok per Teknisi:
                </span>
                <span className="font-black text-maroon-950 text-base">
                  {formatRupiah(preview.perTech)} <span className="text-xs font-semibold text-slate-600">/ orang ({preview.numTechs} Teknisi)</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-medium block">Total Biaya Pekerjaan ({preview.numTechs} Teknisi):</span>
                <span className="font-bold text-slate-800 text-xs">{formatRupiah(preview.total)}</span>
              </div>
            </div>

            {/* Rincian Komponen Pembagian */}
            <div className="bg-white/80 rounded-xl p-2.5 border border-maroon-100/80 space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-slate-700">
                <span>• Honor Dasar (Tetap &amp; Freelance):</span>
                <span className="font-bold text-slate-900">{formatRupiah(preview.dasarPerTech)}</span>
              </div>
              {preview.lemburPerTech > 0 && (
                <div className="flex justify-between items-center text-amber-900">
                  <span>• Honor Lembur (Utuh per orang):</span>
                  <span className="font-bold text-amber-800">+{formatRupiah(preview.lemburPerTech)}</span>
                </div>
              )}
              {preview.totalTitik > 0 && (
                <div className="flex justify-between items-center text-slate-700">
                  <span>
                    • Honor Titik ({formatRupiah(preview.totalTitik)}{preview.regularCount > 0 ? ` ÷ ${preview.regularCount} teknisi reguler` : ''}):
                  </span>
                  <span className="font-bold text-maroon-800">
                    +{formatRupiah(preview.regularPointShare)} / org reguler
                  </span>
                </div>
              )}
              {preview.totalKabel > 0 && (
                <div className="flex justify-between items-center text-slate-700">
                  <span>
                    • Honor Kabel ({formatRupiah(preview.totalKabel)}{preview.regularCount > 0 ? ` ÷ ${preview.regularCount} teknisi reguler` : ''}):
                  </span>
                  <span className="font-bold text-maroon-800">
                    +{formatRupiah(preview.regularCableShare)} / org reguler
                  </span>
                </div>
              )}

              {preview.magangCount > 0 && (
                <div className="pt-1 mt-1 border-t border-dashed border-amber-300 text-amber-950 space-y-0.5 bg-amber-50/60 p-1.5 rounded-lg">
                  <div className="flex justify-between font-bold text-xs text-amber-900">
                    <span>🎓 Honor Teknisi Magang:</span>
                    <span>+{formatRupiah(preview.magangWorkTotalPerTech)} / org magang</span>
                  </div>
                  <span className="text-[10px] text-amber-700 block leading-tight">
                    (Magang: Honor Dasar Rp 0, Titik {formatRupiah(preview.magangPointShare)}, Kabel {formatRupiah(preview.magangCableShare)}{preview.lemburPerTech > 0 ? `, Lembur +${formatRupiah(preview.lemburPerTech)}` : ''})
                  </span>
                </div>
              )}
            </div>

            {preview.numTechs > 1 && (
              <div className="text-[10px] text-maroon-800 bg-maroon-100/70 p-2 rounded-lg leading-relaxed space-y-0.5">
                <div>
                  💡 <strong>SOP Pembagian ({preview.numTechs} Teknisi{preview.magangCount > 0 ? `: ${preview.regularCount} Reguler, ${preview.magangCount} Magang` : ''}):</strong>
                </div>
                {preview.magangCount > 0 ? (
                  <div>
                    Honor teknisi Tetap/Freelance ({formatRupiah(preview.regularWorkTotalPerTech)}/org) <strong>utuh tidak dipotong</strong> oleh teknisi Magang. Teknisi Magang menerima 50% pembagian ({formatRupiah(preview.magangWorkTotalPerTech)}/org).
                  </div>
                ) : (
                  <div>
                    Honor dasar ({formatRupiah(preview.dasarPerTech)}) &amp; lembur ({formatRupiah(preview.lemburPerTech)}) utuh per orang. Honor titik ({formatRupiah(preview.totalTitik)} ÷ {preview.numTechs}) &amp; kabel ({formatRupiah(preview.totalKabel)} ÷ {preview.numTechs}) dibagi rata.
                  </div>
                )}
              </div>
            )}

            {/* Transport from Selected Wilayah */}
            <div className="pt-1 border-t border-maroon-200/60 flex items-center justify-between text-[11px]">
              <span className="text-slate-600 font-semibold flex items-center space-x-1">
                <MapPin className="w-3 h-3 text-emerald-600 inline" />
                <span>Wilayah Terpilih ({jobForm.wilayahIds.length}):</span>
              </span>
              <span className="font-bold text-emerald-800 truncate max-w-[200px] text-right">
                {preview.selectedWilayahObjects.length > 0
                  ? preview.selectedWilayahObjects.map(w => w.namaWilayah).join(', ')
                  : 'Belum ada'} ({formatRupiah(preview.transportRate)})
              </span>
            </div>

            {preview.totalTransportAllTechs > 0 ? (
              <div className="text-[10px] text-emerald-700 font-bold flex justify-between bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                <span>🚗 Bonus Transport Kendaraan Pribadi:</span>
                <span>+{formatRupiah(preview.totalTransportAllTechs)}</span>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 italic">
                Kendaraan Inventaris/Jalan Kaki (Transport pribadi tidak dicairkan)
              </div>
            )}
          </div>

          {/* Warning Banner if Teknisi Utama already checked out or not yet checked in */}
          {currentUser?.role !== 'Admin' && jobForm.teknisiUtamaId && checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).hasPulang && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start space-x-2.5 text-rose-900">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-xs">
                  Teknisi Utama Sudah Absen Pulang {checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).jamPulang ? `(Pukul ${checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).jamPulang} WIB)` : 'Hari Ini'}
                </p>
                <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                  Sesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat menginput data pekerjaan pada tanggal yang sama. Silakan hubungi Admin jika terdapat data pekerjaan susulan.
                </p>
              </div>
            </div>
          )}

          {currentUser?.role !== 'Admin' && jobForm.teknisiUtamaId && !checkTechAbsen(jobForm.teknisiUtamaId, jobForm.tanggal) && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-2.5 text-amber-900">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-xs">Teknisi Utama Belum Absen Masuk</p>
                <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
                  Sesuai SOP, silakan lakukan Absen Masuk harian terlebih dahulu sebelum menginput data pekerjaan.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
            <button
              type="button"
              disabled={isSavingJob}
              onClick={handleRequestClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={
                isSavingJob ||
                (currentUser?.role !== 'Admin' &&
                  jobForm.teknisiUtamaId &&
                  (!checkTechAbsen(jobForm.teknisiUtamaId, jobForm.tanggal) ||
                    checkTechHasAbsenPulang(jobForm.teknisiUtamaId, jobForm.tanggal).hasPulang))
              }
              className="px-5 py-2 bg-maroon-800 text-white rounded-xl font-bold hover:bg-maroon-900 shadow-md flex items-center space-x-2 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer active:scale-95 transition-all"
            >
              {isSavingJob ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan &amp; Upload Foto...</span>
                </>
              ) : (
                <span>Simpan Pekerjaan</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const JobModal: React.FC<JobModalProps> = React.memo(JobModalContent);


