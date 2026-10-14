import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  HardHat,
  MapPin,
  Camera,
  CheckCircle,
  Clock,
  FileSpreadsheet,
  Calendar,
  AlertCircle,
  Send,
  XCircle,
  RefreshCw,
  ShieldAlert,
  Plus,
  ChevronRight,
  Sparkles,
  Bell,
  Home,
  ClipboardList,
  Wallet,
  CalendarCheck,
  TrendingUp,
  CheckSquare,
  History,
  UserCheck,
  FileText,
  Eye,
  Award,
  Activity,
  Filter,
  Search,
  ExternalLink,
  Users,
  Briefcase,
  WifiOff,
  Layers
} from 'lucide-react';
import {
  Employee,
  AttendanceRecord,
  JobRecord,
  PlanningTask,
  ServerData,
  JenisPekerjaan,
  WilayahPekerjaan,
  LeaveRequest,
  AppSettings,
  PotonganManual
} from '../types';
import { formatRupiah, calculatePayrollForEmployee, calculateTechnicianHonorForJob, checkTechnicianHasPulang, checkTechnicianAttendanceApproved, buildAttendanceLookupMap } from '../services/payroll';
import {
  sanitizeTimeString,
  sanitizeDateString,
  getEffectiveTodayISO,
  evaluateAttendanceApproval,
  uploadPhotoToGoogleDrive
} from '../services/googleSheetsHelper';
import { compressImage } from '../services/imageCompressor';
import { PhotoCacheService } from '../services/photoCache';
import { NotificationService } from '../services/notificationService';
import { SafeImage } from '../components/SafeImage';
import { isValidPhotoUrl } from '../utils/imageHelper';
import { isDeviceOnline, useNetworkStatus } from '../utils/networkCheck';
import { StorageService, getNormalizedTechKey } from '../services/storage';
import { HonorCalculator } from '../components/HonorCalculator';
import { showAppAlert } from '../utils/dialogService';
import { InternetStatusBadge } from '../components/InternetStatusBadge';

// Haversine formula to compute distance in meters between two coordinates
function calculateDistanceMeter(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Live Direct Camera Modal for Smartphone
const DirectCameraModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Img: string) => void;
  title: string;
}> = ({ isOpen, onClose, onCapture, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  React.useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async (mode: 'user' | 'environment') => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Kamera tidak dapat dibuka langsung. Anda bisa menggunakan alternatif file camera di bawah.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleTakeSnapshot = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;
      // Scale down to max 800px on canvas to prevent high RAM usage and freezing on low-end smartphones
      const maxDim = 800;
      let targetW = vWidth;
      let targetH = vHeight;
      if (vWidth > maxDim || vHeight > maxDim) {
        if (vWidth >= vHeight) {
          targetW = maxDim;
          targetH = Math.round((vHeight * maxDim) / vWidth);
        } else {
          targetH = maxDim;
          targetW = Math.round((vWidth * maxDim) / vHeight);
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        onCapture(dataUrl);
        stopCamera();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#1a040b] border border-maroon-900/60 text-white rounded-2xl max-w-sm w-full p-4 shadow-2xl relative space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-maroon-900/40">
          <h4 className="font-extrabold text-sm text-rose-100 flex items-center space-x-2">
            <Camera className="w-4 h-4 text-rose-400" />
            <span>{title}</span>
          </h4>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-full bg-maroon-950 text-rose-300 hover:text-white cursor-pointer"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {cameraError ? (
          <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-200 text-xs space-y-2">
            <p className="font-semibold">{cameraError}</p>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    onCapture(reader.result as string);
                    onClose();
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="block w-full text-xs text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-maroon-800 file:text-white"
            />
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-3/4 border border-maroon-800/40 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 px-3">
              <button
                type="button"
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="p-2.5 bg-slate-900/80 text-white rounded-full border border-white/20 hover:bg-slate-800 cursor-pointer"
                title="Ganti Kamera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleTakeSnapshot}
                className="px-5 py-2.5 bg-maroon-800 hover:bg-maroon-700 text-white font-extrabold text-xs rounded-full shadow-lg flex items-center space-x-1.5 border border-maroon-600 cursor-pointer active:scale-95 transition-all"
              >
                <Camera className="w-4 h-4 text-white" />
                <span>AMBIL FOTO</span>
              </button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-center text-rose-300/70">
          Arahkan kamera ke wajah dan tekan tombol <strong>AMBIL FOTO</strong>
        </p>
      </div>
    </div>
  );
};

export type TeknisiMainTab = 'beranda' | 'planning' | 'absensi' | 'gaji';

interface TeknisiDashboardViewProps {
  currentUser: Employee;
  employees?: Employee[];
  attendanceList: AttendanceRecord[];
  jobs: JobRecord[];
  planningTasks: PlanningTask[];
  servers: ServerData[];
  jenisList: JenisPekerjaan[];
  wilayahList?: WilayahPekerjaan[];
  settings?: AppSettings;
  activeMainTab?: TeknisiMainTab;
  onMainTabChange?: (tab: TeknisiMainTab) => void;
  onCheckIn: (att: Partial<AttendanceRecord>) => void;
  onOpenQuickAddJob: () => void;
  onRequestLeave: (leave: Partial<LeaveRequest>) => void;
  leaveRequests?: LeaveRequest[];
  potonganManualList?: PotonganManual[];
  onlineTechniciansFromHeartbeat?: Array<{ id: string; namaLengkap: string; role?: string; serverId?: string; namaServer?: string }>;
  onNavigateToPekerjaanDaftar?: () => void;
}

const TeknisiDashboardViewComponent: React.FC<TeknisiDashboardViewProps> = ({
  currentUser,
  employees = [],
  attendanceList,
  jobs,
  planningTasks,
  servers,
  jenisList,
  wilayahList = [],
  settings,
  activeMainTab,
  onMainTabChange,
  onCheckIn,
  onOpenQuickAddJob,
  onRequestLeave,
  leaveRequests = [],
  potonganManualList = [],
  onlineTechniciansFromHeartbeat = [],
  onNavigateToPekerjaanDaftar
}) => {
  const todayStr = getEffectiveTodayISO();
  const todayAttendanceRecords = useMemo(() => {
    const curTechKey = getNormalizedTechKey(currentUser.id, currentUser.namaLengkap);
    return attendanceList.filter(a => {
      const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const isTech =
        (curTechKey && aTechKey && curTechKey === aTechKey) ||
        a.teknisiId === currentUser.id ||
        (a.teknisiNama && currentUser.namaLengkap && a.teknisiNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim()) ||
        (currentUser.username && a.teknisiId?.toLowerCase().trim() === currentUser.username.toLowerCase().trim());
      const isToday = sanitizeDateString(a.tanggal) === todayStr;
      return isTech && isToday;
    });
  }, [attendanceList, currentUser, todayStr]);

  const todayAttendance = useMemo(() => {
    if (todayAttendanceRecords.length === 0) return undefined;
    return todayAttendanceRecords.find(a => (a.jamPulang && a.jamPulang !== '-' && a.jamPulang.trim().length > 0) || isValidPhotoUrl(a.fotoPulangUrl)) || todayAttendanceRecords[0];
  }, [todayAttendanceRecords]);

  const hasAbsenMasuk = Boolean(
    todayAttendanceRecords.some(a => a.jamMasuk && a.jamMasuk !== '-' && a.jamMasuk.trim().length > 0 && a.status !== 'Ditolak')
  );
  const hasAbsenPulang = Boolean(
    checkTechnicianHasPulang(currentUser, todayStr, attendanceList) ||
    todayAttendanceRecords.some(a => 
      (a.jamPulang && a.jamPulang !== '-' && a.jamPulang.trim().length > 0 && !/^(belum|pending)/i.test(a.jamPulang)) ||
      isValidPhotoUrl(a.fotoPulangUrl)
    )
  );

  // Active Tab: Can be driven by props (BottomNav) or internal state
  const [internalTab, setInternalTab] = useState<TeknisiMainTab>(() => {
    return activeMainTab || (hasAbsenMasuk ? 'beranda' : 'absensi');
  });

  // Real-time Internet Connection status (3-state quality detection & status badge)
  const { status: networkStatus, isOnline, rtt: networkRtt, checkNow: checkNetworkNow } = useNetworkStatus({ enableAlertPopup: false });

  const activeTab: TeknisiMainTab = activeMainTab || internalTab;

  const handleSelectTab = (tab: TeknisiMainTab) => {
    if (onMainTabChange) {
      onMainTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Sub-tabs for Absensi view (Menu Absensi, Izin/Cuti, Status Absensi Harian, Riwayat Absensi)
  const [absensiSubTab, setAbsensiSubTab] = useState<'absen' | 'izin' | 'status' | 'riwayat'>('absen');

  // Filter for Planning tasks
  const [planningFilter, setPlanningFilter] = useState<'Semua' | 'Belum' | 'Selesai'>('Belum');

  // Search keyword for monthly jobs in Gaji tab
  const [jobSearchTerm, setJobSearchTerm] = useState('');

  // Modal full photo preview
  const [selectedPhotoModal, setSelectedPhotoModal] = useState<{ url: string; title: string } | null>(null);

  // Check-in / GPS State with persistent draft protection
  const initialAttDraft = useMemo(() => {
    return StorageService.getAttendanceDraft(currentUser.id) || null;
  }, [currentUser.id]);

  const [isLocating, setIsLocating] = useState(false);
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number } | null>(
    () => initialAttDraft?.currentGps || null
  );
  const [selectedServerId, setSelectedServerId] = useState(
    () => initialAttDraft?.selectedServerId || todayAttendance?.serverId || servers[0]?.id || ''
  );

  // Sync selectedServerId with todayAttendance only if technician has already clocked in
  useEffect(() => {
    if (todayAttendance?.serverId && hasAbsenMasuk) {
      setSelectedServerId(todayAttendance.serverId);
    }
  }, [todayAttendance?.serverId, hasAbsenMasuk]);

  // Photos state with persistent draft protection
  const [localMasukPreview, setLocalMasukPreview] = useState<string>(
    () => initialAttDraft?.localMasukPreview || initialAttDraft?.selfieMasukPhoto || todayAttendance?.fotoProofUrl || ''
  );
  const [selfieMasukPhoto, setSelfieMasukPhoto] = useState<string>(
    () => initialAttDraft?.selfieMasukPhoto || todayAttendance?.fotoProofUrl || ''
  );

  const initialPulangDraft = useMemo(() => {
    return StorageService.getAttendanceDraft(`${currentUser.id}_pulang`) || null;
  }, [currentUser.id]);

  const [localPulangPreview, setLocalPulangPreview] = useState<string>(
    () => initialPulangDraft?.localPulangPreview || initialPulangDraft?.selfiePulangPhoto || todayAttendance?.fotoPulangUrl || ''
  );
  const [selfiePulangPhoto, setSelfiePulangPhoto] = useState<string>(
    () => initialPulangDraft?.selfiePulangPhoto || todayAttendance?.fotoPulangUrl || ''
  );

  // Notification permission banner state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    () => NotificationService.getPermissionStatus()
  );

  const handleEnableNotification = async () => {
    const res = await NotificationService.requestPermission();
    setNotifPermission(res);
    if (res === 'granted') {
      NotificationService.playChimeSound();
      await NotificationService.sendSystemNotification('✅ Notifikasi Tugas Aktif!', {
        body: 'Anda sekarang akan menerima notifikasi otomatis ketika ada tugas planning baru.',
        tag: 'planning-welcome'
      });
    }
  };

  // Direct Live Camera Modal State
  const [isDirectCameraOpen, setIsDirectCameraOpen] = useState(false);
  const [directCameraType, setDirectCameraType] = useState<'masuk' | 'pulang'>('masuk');

  const [absenNote, setAbsenNote] = useState(() => initialAttDraft?.absenNote || '');
  const [absenPulangNote, setAbsenPulangNote] = useState(() => initialPulangDraft?.absenPulangNote || '');
  const [radiusError, setRadiusError] = useState<string | null>(null);

  // Auto-save Absen Masuk draft
  useEffect(() => {
    if (hasAbsenMasuk) return;
    if (currentGps || selfieMasukPhoto || localMasukPreview || absenNote || selectedServerId) {
      StorageService.saveAttendanceDraft({
        currentGps,
        selfieMasukPhoto,
        localMasukPreview,
        absenNote,
        selectedServerId
      }, currentUser.id);
    }
  }, [currentGps, selfieMasukPhoto, localMasukPreview, absenNote, selectedServerId, hasAbsenMasuk, currentUser.id]);

  // Auto-save Absen Pulang draft
  useEffect(() => {
    if (!hasAbsenMasuk || hasAbsenPulang) return;
    if (selfiePulangPhoto || localPulangPreview || absenPulangNote) {
      StorageService.saveAttendanceDraft({
        selfiePulangPhoto,
        localPulangPreview,
        absenPulangNote
      }, `${currentUser.id}_pulang`);
    }
  }, [selfiePulangPhoto, localPulangPreview, absenPulangNote, hasAbsenMasuk, hasAbsenPulang, currentUser.id]);

  // Leave Form state with draft restoration
  const initialLeaveDraft = useMemo(() => {
    return StorageService.getLeaveDraft(currentUser.id) || null;
  }, [currentUser.id]);

  const [leaveType, setLeaveType] = useState<'Izin' | 'Cuti' | 'Sakit'>(
    () => initialLeaveDraft?.leaveType || 'Izin'
  );
  const [leaveReason, setLeaveReason] = useState(() => initialLeaveDraft?.leaveReason || '');
  const [leaveDate, setLeaveDate] = useState(() => initialLeaveDraft?.leaveDate || todayStr);

  // Auto-save Leave draft
  useEffect(() => {
    if (leaveReason) {
      StorageService.saveLeaveDraft({
        leaveType,
        leaveReason,
        leaveDate
      }, currentUser.id);
    }
  }, [leaveType, leaveReason, leaveDate, currentUser.id]);

  // Helper to format date in Indonesian standard (e.g. 08 Okt 2026)
  const formatDisplayDateIndo = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.slice(0, 10).split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // SOP Cuti Karyawan / Teknisi Calculations:
  // 1. Karyawan/Teknisi memperoleh cuti sebanyak 1 kali dalam 1 bulan atau 12 hari dalam 1 tahun.
  // 2. Cuti tidak boleh diambil sekaligus. Maksimal cuti dalam 1 bulan adalah 2 hari.
  const cutiStats = useMemo(() => {
    let selectedYear = new Date().getFullYear();
    let selectedMonth = new Date().getMonth() + 1; // 1-12
    if (leaveDate) {
      const parts = leaveDate.slice(0, 10).split('-');
      if (parts.length === 3 && !isNaN(Number(parts[0]))) {
        selectedYear = Number(parts[0]);
        selectedMonth = Number(parts[1]);
      }
    }

    const curTechId = (currentUser.id || '').toLowerCase().trim();
    const curTechName = (currentUser.namaLengkap || '').toLowerCase().trim();

    // Seluruh riwayat cuti karyawan ini di tahun yang dipilih (yang tidak ditolak)
    const yearlyCutiList = (leaveRequests || []).filter(l => {
      const matchTech =
        (l.teknisiId && l.teknisiId.toLowerCase().trim() === curTechId) ||
        (l.teknisiNama && l.teknisiNama.toLowerCase().trim() === curTechName);
      if (!matchTech) return false;
      if (l.jenis !== 'Cuti') return false;
      if (l.status === 'Rejected') return false;

      const lDateStr = (l.tanggal || '').slice(0, 10);
      const lYear = Number(lDateStr.split('-')[0]);
      return lYear === selectedYear;
    });

    // Cuti di bulan yang dipilih
    const monthlyCutiList = yearlyCutiList.filter(l => {
      const lDateStr = (l.tanggal || '').slice(0, 10);
      const lMonth = Number(lDateStr.split('-')[1]);
      return lMonth === selectedMonth;
    });

    const totalCutiTahunan = Number(settings?.totalCutiPerTahun) || 12; // Acuan SOP: Total cuti per tahun
    const cutiTerpakaiTahun = yearlyCutiList.length;
    const sisaCutiTahun = Math.max(0, totalCutiTahunan - cutiTerpakaiTahun);

    const maxCutiBulanan = Number(settings?.jumlahCutiMaksimalPerBulan) || 2; // Acuan SOP: Maksimal cuti dalam 1 bulan
    const cutiTerpakaiBulan = monthlyCutiList.length;
    const sisaCutiBulan = Math.max(0, maxCutiBulanan - cutiTerpakaiBulan);

    const namaBulanIndoList = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const namaBulanIndo = namaBulanIndoList[selectedMonth - 1] || 'Bulan Terpilih';

    return {
      selectedYear,
      selectedMonth,
      namaBulanIndo,
      totalCutiTahunan,
      cutiTerpakaiTahun,
      sisaCutiTahun,
      maxCutiBulanan,
      cutiTerpakaiBulan,
      sisaCutiBulan,
      isTahunExceeded: sisaCutiTahun <= 0,
      isBulanExceeded: cutiTerpakaiBulan >= maxCutiBulanan,
      yearlyCutiList,
      monthlyCutiList
    };
  }, [leaveRequests, currentUser, leaveDate, settings]);

  // Planning tasks assigned to this technician
  const allMyPlanningTasks = useMemo(() => {
    return planningTasks.filter(p => p.targetTeknisiIds.includes(currentUser.id));
  }, [planningTasks, currentUser.id]);

  const myPlanningTasks = useMemo(() => {
    return allMyPlanningTasks.filter(p => p.status !== 'Selesai');
  }, [allMyPlanningTasks]);

  const myCompletedPlanningTasks = useMemo(() => {
    return allMyPlanningTasks.filter(p => p.status === 'Selesai');
  }, [allMyPlanningTasks]);

  const filteredPlanningTasks = useMemo(() => {
    if (planningFilter === 'Belum') return myPlanningTasks;
    if (planningFilter === 'Selesai') return myCompletedPlanningTasks;
    return allMyPlanningTasks;
  }, [planningFilter, myPlanningTasks, myCompletedPlanningTasks, allMyPlanningTasks]);

  // All jobs completed by this technician (untuk pencatatan pekerjaan hari ini, bulan ini, total & riwayat)
  const myJobs = useMemo(() => {
    const curIdClean = (currentUser.id || '').toLowerCase().trim();
    const curNameClean = (currentUser.namaLengkap || '').toLowerCase().trim();
    const curUserClean = (currentUser.username || '').toLowerCase().trim();

    return jobs
      .filter(j => {
        if (!j) return false;
        // 1. Direct ID in teknisiIds array
        if (j.teknisiIds && Array.isArray(j.teknisiIds)) {
          if (j.teknisiIds.includes(currentUser.id)) return true;
          if (curIdClean && j.teknisiIds.some(id => String(id).toLowerCase().trim() === curIdClean)) return true;
          if (curUserClean && j.teknisiIds.some(id => String(id).toLowerCase().trim() === curUserClean || String(id).toLowerCase().trim() === `emp-${curUserClean}`)) return true;
        }
        // 2. Singular teknisiId
        if ((j as any).teknisiId) {
          const sId = String((j as any).teknisiId).toLowerCase().trim();
          if (sId === curIdClean || (curUserClean && (sId === curUserClean || sId === `emp-${curUserClean}`))) return true;
        }
        // 3. Name in teknisiNamas array
        if (j.teknisiNamas && Array.isArray(j.teknisiNamas)) {
          if (curNameClean && j.teknisiNamas.some(n => {
            const nClean = String(n || '').toLowerCase().trim();
            return nClean === curNameClean || nClean.includes(curNameClean) || curNameClean.includes(nClean);
          })) {
            return true;
          }
          if (curUserClean && j.teknisiNamas.some(n => String(n || '').toLowerCase().trim() === curUserClean)) return true;
        }
        // 4. Singular teknisiNama
        if ((j as any).teknisiNama) {
          const sNama = String((j as any).teknisiNama).toLowerCase().trim();
          if (sNama === curNameClean || sNama.includes(curNameClean) || curNameClean.includes(sNama)) return true;
        }
        return false;
      })
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  }, [jobs, currentUser]);

  // Current month period and localized month name
  const currentMonthPeriod = todayStr.substring(0, 7); // "YYYY-MM"
  const currentMonthName = useMemo(() => {
    try {
      const d = new Date();
      return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } catch {
      return currentMonthPeriod;
    }
  }, [currentMonthPeriod]);

  // Jobs this month (bulan berjalan)
  const myMonthlyJobs = useMemo(() => {
    return myJobs.filter(j => sanitizeDateString(j.tanggal).startsWith(currentMonthPeriod));
  }, [myJobs, currentMonthPeriod]);

  const attLookupMap = useMemo(() => buildAttendanceLookupMap(attendanceList), [attendanceList]);

  // Pekerjaan bulan ini yang honornya tertahan (belum masuk ke hitungan gaji) karena belum Absen Pulang atau menunggu Approval Admin
  const unverifiedJobsCount = useMemo(() => {
    return myMonthlyJobs.filter(j => {
      const hasPulang = checkTechnicianHasPulang(currentUser, j.tanggal, attendanceList, attLookupMap);
      const attApproval = checkTechnicianAttendanceApproved(currentUser, j.tanggal, attendanceList, settings, attLookupMap);
      return !hasPulang || !attApproval.isEligible;
    }).length;
  }, [myMonthlyJobs, currentUser, attendanceList, settings, attLookupMap]);

  // Search state for 20 latest jobs on Technician main dashboard
  const [recentJobSearchTerm, setRecentJobSearchTerm] = useState('');

  // 20 Latest jobs of the current month (bulan berjalan) for this technician
  const myRecent20Jobs = useMemo(() => {
    let list = myMonthlyJobs;
    if (recentJobSearchTerm.trim()) {
      const term = recentJobSearchTerm.toLowerCase().trim();
      list = list.filter(
        j =>
          (j.jenisPekerjaanNama || '').toLowerCase().includes(term) ||
          (j.subPekerjaanNama || '').toLowerCase().includes(term) ||
          (j.namaServer || '').toLowerCase().includes(term) ||
          (j.catatan || (j as any).keterangan || '').toLowerCase().includes(term) ||
          (j.teknisiNamas || []).some(n => n.toLowerCase().includes(term)) ||
          (j.tanggal || '').includes(term)
      );
    }
    return list.slice(0, 20);
  }, [myMonthlyJobs, recentJobSearchTerm]);

  // Filtered monthly jobs for search in Tab Riwayat/Gaji
  const filteredMonthlyJobs = useMemo(() => {
    if (!jobSearchTerm.trim()) return myMonthlyJobs;
    const term = jobSearchTerm.toLowerCase().trim();
    return myMonthlyJobs.filter(
      j =>
        j.jenisPekerjaanNama?.toLowerCase().includes(term) ||
        j.subPekerjaanNama?.toLowerCase().includes(term) ||
        j.namaServer?.toLowerCase().includes(term) ||
        j.catatan?.toLowerCase().includes(term)
    );
  }, [myMonthlyJobs, jobSearchTerm]);

  // Progress metrics calculation based on total target across all servers
  const completedJobsCount = myMonthlyJobs.length;
  const inProgressJobsCount = myMonthlyJobs.filter(j => j.adaLembur || (j.menitLembur !== undefined && Number(j.menitLembur) > 0)).length;
  const monthlyJobTarget = useMemo(() => {
    if (!servers || servers.length === 0) return 100;
    const total = servers.reduce((sum, s) => {
      const target = s.targetPekerjaanBulanan !== undefined && Number(s.targetPekerjaanBulanan) > 0
        ? Number(s.targetPekerjaanBulanan)
        : 100;
      return sum + target;
    }, 0);
    return total > 0 ? total : 100;
  }, [servers]);

  const jobProgressPct = monthlyJobTarget > 0 ? Math.min(100, Math.round((myMonthlyJobs.length / monthlyJobTarget) * 100)) : 0;

  // Compute my personal earned honor estimation for current month (with approval check)
  const myPayrollRecap = useMemo(() => {
    return calculatePayrollForEmployee(
      currentUser,
      servers,
      wilayahList,
      jenisList,
      myMonthlyJobs,
      attendanceList,
      currentMonthPeriod,
      potonganManualList,
      settings
    );
  }, [
    currentUser,
    servers,
    wilayahList,
    jenisList,
    myMonthlyJobs,
    attendanceList,
    currentMonthPeriod,
    potonganManualList,
    settings
  ]);

  // Jobs today for current technician
  const myTodayJobs = useMemo(() => {
    return myJobs.filter(j => sanitizeDateString(j.tanggal) === todayStr);
  }, [myJobs, todayStr]);

  // Estimasi Honor hari ini untuk teknisi
  const myTodayEstimatedHonor = useMemo(() => {
    return myTodayJobs.reduce((sum, j) => {
      const base = j.honorPerTeknisi || j.estimasiHonorPerTeknisi || 0;
      const lembur = j.honorLemburPerTeknisi || 0;
      const titik = j.honorTitikPerTeknisi || 0;
      const kabel = j.honorKabelPerTeknisi || 0;
      return sum + (base + lembur + titik + kabel);
    }, 0);
  }, [myTodayJobs]);

  // Breakdown Estimasi Honor per Server untuk teknisi (AlbiNet, DindaNet, AlviNet, dst.)
  const myServerHonorBreakdown = useMemo(() => {
    const map = new Map<string, { id: string; namaServer: string; totalHonor: number }>();

    servers.forEach(s => {
      map.set(s.id, { id: s.id, namaServer: s.namaServer, totalHonor: 0 });
    });

    myMonthlyJobs.forEach(j => {
      let sObj = servers.find(s => s.id === j.serverId);
      if (!sObj && j.namaServer) {
        sObj = servers.find(s => s.namaServer.toLowerCase().trim() === j.namaServer.toLowerCase().trim());
      }
      const sId = sObj ? sObj.id : (j.namaServer || 'Lainnya');
      const sName = sObj ? sObj.namaServer : (j.namaServer || 'Lainnya');

      if (!map.has(sId)) {
        map.set(sId, { id: sId, namaServer: sName, totalHonor: 0 });
      }

      const base = j.honorPerTeknisi || j.estimasiHonorPerTeknisi || 0;
      const lembur = j.honorLemburPerTeknisi || 0;
      const titik = j.honorTitikPerTeknisi || 0;
      const kabel = j.honorKabelPerTeknisi || 0;
      const totalJobHonor = (base + lembur + titik + kabel) || (j.estimasiTotalHonor || 0);

      const entry = map.get(sId)!;
      entry.totalHonor += totalJobHonor;
    });

    return Array.from(map.values());
  }, [servers, myMonthlyJobs]);

  // Online technicians computation for the technician view
  const activeOnlineTechnicians = useMemo(() => {
    const activeMap = new Map<string, { id: string; namaLengkap: string }>();

    (onlineTechniciansFromHeartbeat || []).forEach(h => {
      if (!h || !h.namaLengkap) return;
      const roleStr = String(h.role || '').toLowerCase().trim();
      if (!roleStr || roleStr === 'teknisi') {
        const key = (h.id || h.namaLengkap).toLowerCase().trim();
        activeMap.set(key, h);
      }
    });

    if (currentUser) {
      const key = (currentUser.id || currentUser.namaLengkap).toLowerCase().trim();
      activeMap.set(key, { id: currentUser.id, namaLengkap: currentUser.namaLengkap });
    }

    return Array.from(activeMap.values());
  }, [onlineTechniciansFromHeartbeat, currentUser]);

  const totalTechniciansCount = useMemo(() => {
    const count = employees.filter(e => String(e.role || '').toLowerCase().trim() === 'teknisi').length;
    return count > 0 ? count : 1;
  }, [employees]);

  const onlineTechniciansCount = activeOnlineTechnicians.length;

  // Semua teknisi dan status absensi masuk/pulang hari ini untuk card simpel di beranda
  const todayAllAttendance = useMemo(() => {
    // Kumpulkan daftar teknisi (dari master employees role Teknisi/Admin, atau fallback currentUser)
    const rawTechs = (employees && employees.length > 0)
      ? employees.filter(e => e.role === 'Teknisi' || e.role === 'Admin')
      : [currentUser];

    // Catatan absensi hari ini
    const todayRecords = attendanceList.filter(a => sanitizeDateString(a.tanggal) === todayStr);

    const mapByTechId = new Map<string, AttendanceRecord>();
    const mapByName = new Map<string, AttendanceRecord>();

    todayRecords.forEach(rec => {
      if (rec.teknisiId) mapByTechId.set(rec.teknisiId.toLowerCase().trim(), rec);
      if (rec.teknisiNama) mapByName.set(rec.teknisiNama.toLowerCase().trim(), rec);
    });

    const leaveByTechId = new Map<string, LeaveRequest>();
    const leaveByName = new Map<string, LeaveRequest>();
    (leaveRequests || []).filter(l => sanitizeDateString(l.tanggal) === todayStr && l.status === 'Approved').forEach(l => {
      if (l.teknisiId) leaveByTechId.set(l.teknisiId.toLowerCase().trim(), l);
      if (l.teknisiNama) leaveByName.set(l.teknisiNama.toLowerCase().trim(), l);
    });

    const list: Array<{
      id: string;
      nama: string;
      isCurrentUser: boolean;
      jamMasuk: string;
      jamPulang: string;
      status: string;
      statusType: 'hadir' | 'terlambat' | 'aktif' | 'izin' | 'belum';
    }> = [];

    const processedNames = new Set<string>();

    rawTechs.forEach(emp => {
      const keyId = emp.id?.toLowerCase().trim();
      const keyUsername = emp.username?.toLowerCase().trim();
      const keyName = emp.namaLengkap?.toLowerCase().trim();

      const rec = (keyId && mapByTechId.get(keyId)) ||
                  (keyUsername && mapByTechId.get(keyUsername)) ||
                  (keyName && mapByName.get(keyName));

      const approvedLeave = (keyId && leaveByTechId.get(keyId)) ||
                            (keyUsername && leaveByTechId.get(keyUsername)) ||
                            (keyName && leaveByName.get(keyName));

      const isCurrent = emp.id === currentUser.id ||
        (emp.namaLengkap && currentUser.namaLengkap && emp.namaLengkap.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim());

      if (keyName) processedNames.add(keyName);

      const hasIn = Boolean(rec && rec.jamMasuk && rec.jamMasuk !== '-' && rec.jamMasuk.trim().length > 0 && rec.status !== 'Ditolak');
      const hasOut = Boolean(rec && rec.jamPulang && rec.jamPulang !== '-' && rec.jamPulang.trim().length > 0);

      let statusType: 'hadir' | 'terlambat' | 'aktif' | 'izin' | 'belum' = 'belum';
      let statusLabel = 'Belum Absen';

      if (approvedLeave) {
        statusType = 'izin';
        statusLabel = approvedLeave.jenis || 'Izin/Cuti';
      } else if (rec) {
        if (rec.status === 'Izin' || rec.status === 'Cuti') {
          statusType = 'izin';
          statusLabel = rec.status;
        } else if (hasIn && hasOut) {
          statusType = rec.status === 'Terlambat' ? 'terlambat' : 'hadir';
          statusLabel = rec.status === 'Terlambat' ? 'Pulang (Telat)' : 'Selesai';
        } else if (hasIn) {
          statusType = rec.status === 'Terlambat' ? 'terlambat' : 'aktif';
          statusLabel = rec.status === 'Terlambat' ? 'Masuk (Telat)' : 'Aktif';
        }
      }

      list.push({
        id: emp.id,
        nama: emp.namaLengkap,
        isCurrentUser: isCurrent,
        jamMasuk: hasIn && rec ? sanitizeTimeString(rec.jamMasuk, '08:00') : '-',
        jamPulang: hasOut && rec ? sanitizeTimeString(rec.jamPulang, '17:00') : '-',
        status: statusLabel,
        statusType
      });
    });

    // Tambah record absensi yang namanya belum terdaftar di master employees
    todayRecords.forEach(rec => {
      const keyName = rec.teknisiNama?.toLowerCase().trim();
      if (keyName && !processedNames.has(keyName)) {
        processedNames.add(keyName);
        const isCurrent = rec.teknisiId === currentUser.id ||
          (currentUser.namaLengkap && keyName === currentUser.namaLengkap.toLowerCase().trim());
        const hasIn = Boolean(rec.jamMasuk && rec.jamMasuk !== '-' && rec.jamMasuk.trim().length > 0 && rec.status !== 'Ditolak');
        const hasOut = Boolean(rec.jamPulang && rec.jamPulang !== '-' && rec.jamPulang.trim().length > 0);

        let statusType: 'hadir' | 'terlambat' | 'aktif' | 'izin' | 'belum' = 'belum';
        let statusLabel = 'Belum Absen';

        if (rec.status === 'Izin' || rec.status === 'Cuti') {
          statusType = 'izin';
          statusLabel = rec.status;
        } else if (hasIn && hasOut) {
          statusType = rec.status === 'Terlambat' ? 'terlambat' : 'hadir';
          statusLabel = rec.status === 'Terlambat' ? 'Pulang (Telat)' : 'Selesai';
        } else if (hasIn) {
          statusType = rec.status === 'Terlambat' ? 'terlambat' : 'aktif';
          statusLabel = rec.status === 'Terlambat' ? 'Masuk (Telat)' : 'Aktif';
        }

        list.push({
          id: rec.id || rec.teknisiId,
          nama: rec.teknisiNama,
          isCurrentUser: isCurrent,
          jamMasuk: hasIn ? sanitizeTimeString(rec.jamMasuk, '08:00') : '-',
          jamPulang: hasOut ? sanitizeTimeString(rec.jamPulang, '17:00') : '-',
          status: statusLabel,
          statusType
        });
      }
    });

    // Urutkan: currentUser teratas, lalu yang sudah absen masuk lebih dulu, kemudian menurut abjad
    list.sort((a, b) => {
      if (a.isCurrentUser && !b.isCurrentUser) return -1;
      if (!a.isCurrentUser && b.isCurrentUser) return 1;
      if (a.jamMasuk !== '-' && b.jamMasuk === '-') return -1;
      if (a.jamMasuk === '-' && b.jamMasuk !== '-') return 1;
      return a.nama.localeCompare(b.nama);
    });

    return list;
  }, [employees, attendanceList, leaveRequests, todayStr, currentUser]);

  // Hanya teknisi yang sudah melakukan absen masuk / pulang hari ini
  const todayAttendedList = useMemo(() => {
    return todayAllAttendance.filter(tech => {
      const hasCheckedIn = tech.jamMasuk && tech.jamMasuk !== '-';
      const hasCheckedOut = tech.jamPulang && tech.jamPulang !== '-';
      const hasLeave = tech.statusType === 'izin';
      return hasCheckedIn || hasCheckedOut || hasLeave;
    });
  }, [todayAllAttendance]);

  const hadirTeknisiCount = useMemo(() => {
    return todayAttendedList.filter(t => t.jamMasuk !== '-').length;
  }, [todayAttendedList]);

  // Active server object
  const sortedServers = useMemo(
    () => [...servers].sort((a, b) => a.namaServer.localeCompare(b.namaServer, 'id', { sensitivity: 'base' })),
    [servers]
  );

  const activeServerObj =
    servers.find(s => s.id === selectedServerId) || servers[0] || {
      id: 'srv-1',
      namaServer: 'Server Utama',
      lat: -6.2089,
      lng: 106.8457,
      toleransiRadiusMeter: 100
    };

  // Distance in meters
  const computedDistance = currentGps
    ? calculateDistanceMeter(currentGps.lat, currentGps.lng, activeServerObj.lat, activeServerObj.lng)
    : null;

  const isDistanceValid = computedDistance !== null && computedDistance <= activeServerObj.toleransiRadiusMeter;

  // Attendance history for this technician
  const myAttendanceHistory = useMemo(() => {
    return attendanceList
      .filter(a => {
        return (
          a.teknisiId === currentUser.id ||
          (a.teknisiNama && currentUser.namaLengkap && a.teknisiNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim()) ||
          (currentUser.username && a.teknisiId?.toLowerCase().trim() === currentUser.username.toLowerCase().trim())
        );
      })
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [attendanceList, currentUser]);

  // Leave requests for this technician
  const myLeaveRequests = useMemo(() => {
    return leaveRequests
      .filter(l => l.teknisiId === currentUser.id || l.teknisiNama === currentUser.namaLengkap)
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
  }, [leaveRequests, currentUser]);

  // Leave request for today if exists
  const todayLeave = myLeaveRequests.find(l => {
    const cleanLeaveDate = (l.tanggal || '').trim().slice(0, 10);
    return cleanLeaveDate === todayStr;
  });

  // GPS Location Handler
  const handleGetLocation = () => {
    setIsLocating(true);
    setRadiusError(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;
          setCurrentGps({ lat: userLat, lng: userLng });
          setIsLocating(false);
        },
        err => {
          console.warn('Geolocation fallback:', err);
          setCurrentGps({ lat: activeServerObj.lat + 0.0001, lng: activeServerObj.lng + 0.0001 });
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setCurrentGps({ lat: activeServerObj.lat + 0.0001, lng: activeServerObj.lng + 0.0001 });
      setIsLocating(false);
    }
  };

  // Submit Absen Masuk
  const handlePerformMasuk = (e: React.FormEvent) => {
    e.preventDefault();
    setRadiusError(null);

    if (!currentGps) {
      showAppAlert({
        title: 'Lokasi Belum Dicek',
        message: 'Harap tekan tombol "Cek Lokasi GPS Saya" terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    const dist = calculateDistanceMeter(
      currentGps.lat,
      currentGps.lng,
      activeServerObj.lat,
      activeServerObj.lng
    );
    const maxRadius = activeServerObj.toleransiRadiusMeter || 100;

    if (dist > maxRadius) {
      const errorMsg = `Jarak lokasi Anda (${dist}m) melebihi batas toleransi server ${activeServerObj.namaServer} (${maxRadius}m). Absensi Ditolak!`;
      setRadiusError(errorMsg);
      showAppAlert({
        title: 'Absensi Ditolak',
        message: `Jarak Anda (${dist} meter) melebihi radius toleransi server (${maxRadius} meter).`,
        type: 'error'
      });
      return;
    }

    if (!selfieMasukPhoto) {
      showAppAlert({
        title: 'Foto Selfie Diperlukan',
        message: 'Harap ambil foto selfie masuk terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const nowTime = `${hh}:${mm}`;

    const evalRes = evaluateAttendanceApproval({
      jamMasuk: nowTime,
      tanggal: todayStr,
      isWithinRadius: dist <= maxRadius,
      distanceMeter: dist,
      settings: settings,
      alreadyApproved: false
    });

    const newRecord: Partial<AttendanceRecord> = {
      tanggal: todayStr,
      teknisiId: currentUser.id,
      teknisiNama: currentUser.namaLengkap,
      serverId: activeServerObj.id,
      serverNama: activeServerObj.namaServer,
      jamMasuk: nowTime,
      lat: currentGps.lat,
      lng: currentGps.lng,
      distanceMeter: dist,
      isWithinRadius: dist <= maxRadius,
      fotoProofUrl: selfieMasukPhoto,
      status: evalRes.status,
      needsApproval: evalRes.needsApproval,
      approvalType: evalRes.approvalType,
      keterangan: absenNote || evalRes.reason,
      potonganOtomatis: evalRes.potonganOtomatis
    };

    onCheckIn(newRecord);
    StorageService.clearAttendanceDraft(currentUser.id);
    if (evalRes.needsApproval) {
      showAppAlert({
        title: 'Menunggu Persetujuan Admin',
        message: `Absen Masuk terkirim dan menunggu persetujuan Admin.\n\nAlasan: ${evalRes.reason || 'Keterlambatan / di luar jam kerja'}`,
        type: 'warning'
      });
    } else {
      showAppAlert({
        title: 'Absen Berhasil',
        message: 'Absen Masuk harian telah berhasil dicatat.',
        type: 'success'
      });
    }
  };

  // Submit Absen Pulang
  const handlePerformPulang = (e: React.FormEvent) => {
    e.preventDefault();
    setRadiusError(null);

    // Fallback if GPS was not checked manually: use server coordinates or 0
    let dist = 15;
    let isWithinRad = true;

    if (currentGps) {
      dist = calculateDistanceMeter(
        currentGps.lat,
        currentGps.lng,
        activeServerObj.lat,
        activeServerObj.lng
      );
      const maxRadius = activeServerObj.toleransiRadiusMeter || 100;
      if (dist > maxRadius) {
        isWithinRad = false;
        const noteMsg = `Jarak lokasi Anda (${dist}m) di luar batas toleransi server ${activeServerObj.namaServer} (${maxRadius}m). Absen Pulang tetap dikirim untuk persetujuan Admin.`;
        setRadiusError(noteMsg);
      }
    } else {
      isWithinRad = false;
      setRadiusError('Lokasi GPS belum dicek. Absen Pulang dicatat & memerlukan verifikasi Admin.');
    }

    if (!selfiePulangPhoto) {
      showAppAlert({
        title: 'Foto Selfie Diperlukan',
        message: 'Harap ambil foto selfie pulang terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const nowTime = `${hh}:${mm}`;

    const evalRes = evaluateAttendanceApproval({
      jamMasuk: todayAttendance?.jamMasuk || nowTime,
      jamPulang: nowTime,
      tanggal: todayStr,
      isWithinRadius: isWithinRad,
      distanceMeter: dist,
      settings: settings,
      alreadyApproved: false
    });

    const isPending = evalRes.needsApproval || Boolean(todayAttendance?.needsApproval && todayAttendance?.status === 'Pending Approval') || !isWithinRad;

    const updateRecord: Partial<AttendanceRecord> = {
      ...todayAttendance,
      id: todayAttendance?.id || `att-${Date.now()}`,
      tanggal: todayStr,
      teknisiId: currentUser.id,
      teknisiNama: currentUser.namaLengkap,
      serverId: currentUser.serverId || todayAttendance?.serverId,
      serverNama: currentUser.namaServer || todayAttendance?.serverNama,
      jamMasuk: todayAttendance?.jamMasuk || '08:00',
      jamPulang: nowTime,
      fotoPulangUrl: selfiePulangPhoto,
      keteranganPulang: absenPulangNote || evalRes.reason || (!isWithinRad ? `Luar radius (${dist}m)` : ''),
      status: isPending ? 'Pending Approval' : (todayAttendance?.status || 'Hadir'),
      needsApproval: isPending,
      approvalType: evalRes.approvalType || (!isWithinRad ? 'Luar Radius' : todayAttendance?.approvalType),
      potonganOtomatis: evalRes.potonganOtomatis || todayAttendance?.potonganOtomatis || 0
    };

    onCheckIn(updateRecord);
    StorageService.clearAttendanceDraft(`${currentUser.id}_pulang`);

    if (isPending) {
      showAppAlert({
        title: 'Absen Pulang Berhasil Dikirim',
        message: `Absen Pulang (${nowTime} WIB) berhasil dicatat dan menunggu verifikasi Admin.\n\nAlasan: ${evalRes.reason || (!isWithinRad ? `Di luar radius server (${dist}m)` : 'Menunggu review Admin')}`,
        type: 'warning'
      });
    } else {
      showAppAlert({
        title: 'Absen Pulang Berhasil',
        message: 'Absen Pulang berhasil dicatat! Terima kasih atas kerja keras Anda hari ini.',
        type: 'success'
      });
    }
  };

  // Submit Pengajuan Izin / Cuti
  const handlePerformLeave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!leaveDate) {
      showAppAlert({
        title: 'Tanggal Belum Dipilih',
        message: 'Harap tentukan tanggal izin atau cuti terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    if (!leaveReason.trim()) {
      showAppAlert({
        title: 'Alasan Belum Diisi',
        message: 'Harap masukkan alasan permohonan terlebih dahulu.',
        type: 'warning'
      });
      return;
    }

    // Validasi Khusus SOP Cuti Karyawan / Teknisi
    if (leaveType === 'Cuti') {
      const cleanReason = leaveReason.trim();

      // Ketentuan SOP: Minimal karakter pada Alasan Lengkap adalah 50 karakter
      if (cleanReason.length < 50) {
        showAppAlert({
          title: 'Alasan Cuti Minimal 50 Karakter',
          message: `Sesuai ketentuan SOP Cuti, alasan lengkap wajib diisi minimal 50 karakter.\n\nSaat ini baru ${cleanReason.length} karakter (kurang ${50 - cleanReason.length} karakter lagi). Mohon lengkapi penjelasan alasan permohonan cuti Anda.`,
          type: 'warning'
        });
        return;
      }

      // Cek apakah sudah pernah mengajukan pada tanggal yang sama
      const alreadyHasLeave = (leaveRequests || []).some(l => {
        const matchTech =
          (l.teknisiId && l.teknisiId === currentUser.id) ||
          (l.teknisiNama && l.teknisiNama === currentUser.namaLengkap);
        return matchTech && sanitizeDateString(l.tanggal) === sanitizeDateString(leaveDate) && l.status !== 'Rejected';
      });

      if (alreadyHasLeave) {
        showAppAlert({
          title: 'Tanggal Sudah Terdata',
          message: `Anda sudah memiliki data pengajuan pada tanggal ${formatDisplayDateIndo(leaveDate)}. Silakan pilih tanggal lain.`,
          type: 'warning'
        });
        return;
      }

      // Ketentuan SOP: Kuota tahunan 12 hari dalam 1 tahun
      if (cutiStats.sisaCutiTahun <= 0) {
        showAppAlert({
          title: 'Kuota Cuti Tahunan Habis',
          message: `Kuota cuti tahunan Anda untuk tahun ${cutiStats.selectedYear} telah habis (12 dari 12 hari telah digunakan).`,
          type: 'error'
        });
        return;
      }

      // Ketentuan SOP: Maksimal cuti dalam 1 bulan adalah 2 hari
      if (cutiStats.cutiTerpakaiBulan >= cutiStats.maxCutiBulanan) {
        showAppAlert({
          title: 'Batas Maksimal Cuti Bulanan Tercapai',
          message: `Sesuai SOP Cuti, cuti tidak boleh diambil sekaligus dan maksimal cuti dalam 1 bulan adalah 2 hari.\n\nAnda telah mengambil ${cutiStats.cutiTerpakaiBulan} hari cuti pada bulan ${cutiStats.namaBulanIndo} ${cutiStats.selectedYear}.`,
          type: 'error'
        });
        return;
      }

      // Ketentuan SOP: Cuti tidak memerlukan approval admin. Data otomatis disetujui.
      const leaveObj: LeaveRequest = {
        id: `leave-${Date.now()}`,
        tanggal: leaveDate,
        teknisiId: currentUser.id,
        teknisiNama: currentUser.namaLengkap,
        jenis: 'Cuti',
        alasan: cleanReason,
        status: 'Approved' // Disetujui Otomatis
      };

      onRequestLeave(leaveObj);
      StorageService.clearLeaveDraft(currentUser.id);
      setLeaveReason('');

      showAppAlert({
        title: 'Cuti Berhasil Disetujui Otomatis',
        message: `Pengajuan Cuti tanggal ${formatDisplayDateIndo(leaveDate)} berhasil dicatat dan langsung disetujui secara otomatis sesuai ketentuan SOP Cuti.\n\nSisa kuota cuti tahun ${cutiStats.selectedYear}: ${cutiStats.sisaCutiTahun - 1} hari.`,
        type: 'success'
      });
      return;
    }

    // Normal workflow untuk Izin & Sakit (membutuhkan approval admin)
    const leaveObj: LeaveRequest = {
      id: `leave-${Date.now()}`,
      tanggal: leaveDate,
      teknisiId: currentUser.id,
      teknisiNama: currentUser.namaLengkap,
      jenis: leaveType,
      alasan: leaveReason.trim(),
      status: 'Pending'
    };

    onRequestLeave(leaveObj);
    StorageService.clearLeaveDraft(currentUser.id);
    setLeaveReason('');
    showAppAlert({
      title: 'Pengajuan Berhasil Dikirim',
      message: `Pengajuan ${leaveType} telah berhasil dikirimkan ke Admin.`,
      type: 'success'
    });
  };

  return (
    <div className="space-y-4 pb-24 max-w-4xl mx-auto">
      {/* Title & Internet Connection Status Banner (1 Baris / Sejajar) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Dashboard
        </h2>

        {/* Keterangan Status Koneksi Internet (3 Warna: Hijau, Orange, Merah) */}
        <InternetStatusBadge
          status={networkStatus}
          rtt={networkRtt}
          onRefresh={checkNetworkNow}
        />
      </div>

      {/* 1. NOTIFICATION PERMISSION BANNER */}
      {notifPermission === 'default' && (
        <div className="p-3.5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white rounded-2xl shadow-md flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-700/60 rounded-xl shrink-0">
              <Bell className="w-4 h-4 text-indigo-200 animate-bounce" />
            </div>
            <div>
              <p className="font-extrabold text-white text-xs">Aktifkan Notifikasi Tugas</p>
              <p className="text-indigo-200/80 text-[11px]">
                Dapatkan notifikasi instan saat ada tugas planning baru.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEnableNotification}
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
          >
            Aktifkan
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: BERANDA                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'beranda' && (
        <div className="space-y-3">
          {/* Header Profil Teknisi Card */}
          <div className="bg-gradient-to-br from-maroon-950 via-maroon-900 to-maroon-800 text-white rounded-2xl p-3.5 sm:p-4 shadow-md relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-28 h-28 bg-rose-400/10 rounded-full blur-xl pointer-events-none" />
            <div className="absolute -left-6 -bottom-6 w-28 h-28 bg-maroon-700/20 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                {currentUser ? (
                  (() => {
                    const photo = StorageService.getUserProfilePhoto(currentUser.id || currentUser.username);
                    return photo ? (
                      <img
                        src={photo}
                        alt={currentUser.namaLengkap}
                        className="w-10 h-10 rounded-xl object-cover border border-rose-300/40 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-maroon-800 border border-rose-300/30 text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0">
                        {currentUser.namaLengkap?.charAt(0) || 'T'}
                      </div>
                    );
                  })()
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-maroon-800 border border-rose-300/30 text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0">
                    T
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-white/10 rounded-full text-rose-200">
                      Teknisi Lapangan
                    </span>
                    <span className="text-[10px] text-emerald-300 font-bold">• Status: {currentUser.status || 'Aktif'}</span>
                  </div>
                  <h2 className="text-sm sm:text-base font-black tracking-tight text-white mt-0.5">
                    {currentUser.namaLengkap}
                  </h2>
                </div>
              </div>

              {/* Quick Input Button */}
              <button
                type="button"
                onClick={() => {
                  if (!isDeviceOnline()) {
                    showAppAlert({
                      title: 'Koneksi Terputus',
                      message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nSilakan pastikan koneksi internet HP Anda normal sebelum melakukan input pekerjaan.',
                      type: 'warning'
                    });
                    return;
                  }
                  if (hasAbsenPulang && currentUser.role !== 'Admin') {
                    showAppAlert({
                      title: 'Teknisi Sudah Absen Pulang',
                      message: `Anda sudah melakukan Absen Pulang hari ini${todayAttendance?.jamPulang ? ` (Pukul ${todayAttendance.jamPulang} WIB)` : ''}.\n\nSesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat melakukan input data pekerjaan pada tanggal yang sama.\n\nSilakan hubungi Admin jika terdapat data pekerjaan yang perlu disusulkan.`,
                      type: 'error'
                    });
                    return;
                  }
                  if (!hasAbsenMasuk && currentUser.role !== 'Admin') {
                    showAppAlert({
                      title: 'Akses Ditolak: Belum Absen Masuk',
                      message: 'Anda belum melakukan absen masuk harian hari ini!\n\nSilakan lakukan absen masuk GPS terlebih dahulu sebelum melakukan input pekerjaan.',
                      type: 'warning'
                    });
                    handleSelectTab('absensi');
                    return;
                  }
                  onOpenQuickAddJob();
                }}
                className={`px-3 py-2 text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer shrink-0 ${
                  hasAbsenPulang && currentUser.role !== 'Admin'
                    ? 'bg-white/20 text-white/70 border border-white/20'
                    : !hasAbsenMasuk && currentUser.role !== 'Admin'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
                    : 'bg-white text-maroon-900 hover:bg-rose-50'
                }`}
                title={
                  hasAbsenPulang && currentUser.role !== 'Admin'
                    ? 'Sudah Absen Pulang'
                    : !hasAbsenMasuk && currentUser.role !== 'Admin'
                    ? 'Wajib absen masuk terlebih dahulu'
                    : 'Input Pekerjaan Baru'
                }
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden xs:inline">
                  {hasAbsenPulang && currentUser.role !== 'Admin'
                    ? 'Sudah Pulang'
                    : !hasAbsenMasuk && currentUser.role !== 'Admin'
                    ? 'Belum Absen'
                    : 'Input Job'}
                </span>
              </button>
            </div>
          </div>

          {/* 4 Unified Dashboard Stat Cards Matching Wireframe Design (PEKERJAAN -> ESTIMASI HONOR -> PROGRES PENGERJAAN -> TEKNISI ONLINE) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
            {/* Card 1: PEKERJAAN (Maroon Theme matching DPT-AlaDin Identity) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                if (onNavigateToPekerjaanDaftar) {
                  onNavigateToPekerjaanDaftar();
                } else {
                  handleSelectTab('gaji');
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (onNavigateToPekerjaanDaftar) {
                    onNavigateToPekerjaanDaftar();
                  } else {
                    handleSelectTab('gaji');
                  }
                }
              }}
              style={{ backgroundColor: '#530000' }}
              className="bg-[#530000] text-white rounded-2xl p-3.5 sm:p-4 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col justify-between group overflow-hidden relative h-full min-h-[130px]"
              title="Klik untuk membuka Daftar Pekerjaan Teknisi"
            >
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

              <div className="relative z-10 flex flex-col justify-between h-full space-y-2">
                {/* Header: Title + Big White Icon on the right */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-rose-200/90 block">
                      PEKERJAAN
                    </span>
                    <p className="text-2xl sm:text-3xl font-black text-white leading-tight mt-0.5">
                      {myJobs.length} <span className="text-xs font-bold text-rose-200/80">Jobs</span>
                    </p>
                    <p className="text-[10.5px] text-rose-100/90 font-medium mt-0.5 truncate">
                      Total seluruh pekerjaan saya
                    </p>
                  </div>
                  <div className="p-2 bg-white/20 backdrop-blur-xs rounded-xl text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                    <Briefcase className="w-5 h-5" />
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full h-1.5 bg-black/25 rounded-full overflow-hidden my-0.5">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${myJobs.length > 0 ? Math.min(100, Math.round((completedJobsCount / myJobs.length) * 100)) : 0}%` }}
                  />
                </div>

                {/* Bottom 3 Mini Cards Strip: HARI INI, BULAN INI, TOTAL */}
                <div className="mt-auto pt-2.5 border-t border-white/20 grid grid-cols-3 gap-1 sm:gap-1.5">
                  <div className="bg-black/35 hover:bg-black/45 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                      {myTodayJobs.length}
                    </span>
                    <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-rose-200 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                      HARI INI
                    </span>
                  </div>
                  <div className="bg-black/35 hover:bg-black/45 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                      {myMonthlyJobs.length}
                    </span>
                    <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-rose-200 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                      BULAN INI
                    </span>
                  </div>
                  <div className="bg-black/35 hover:bg-black/45 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                      {myJobs.length}
                    </span>
                    <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-rose-200 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                      TOTAL
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: ESTIMASI HONOR (Vibrant Green/Emerald Theme) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectTab('gaji')}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectTab('gaji');
                }
              }}
              className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white rounded-2xl p-3.5 sm:p-4 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col justify-between group overflow-hidden relative h-full min-h-[130px]"
              title="Klik untuk membuka Tab Rekap Gaji & Honor"
            >
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

              <div className="relative z-10 flex flex-col justify-between h-full space-y-2">
                {/* Header: Title + Big White Icon on the right */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 pr-1">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-100/90 block">
                      ESTIMASI HONOR
                    </span>
                    <p className="text-lg sm:text-xl font-black text-white leading-tight mt-0.5 truncate" title={formatRupiah(myPayrollRecap.estimasiHonor)}>
                      {formatRupiah(myPayrollRecap.estimasiHonor)}
                    </p>
                    <p className="text-[10.5px] text-emerald-100/80 font-medium mt-0.5 truncate">
                      Honor Dasar, Lembur, Titik & Kabel
                    </p>
                  </div>
                  <div className="p-2 bg-white/20 backdrop-blur-xs rounded-xl text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full h-1.5 bg-black/25 rounded-full overflow-hidden my-0.5">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${jobProgressPct}%` }}
                  />
                </div>

                {/* Bottom 3 Mini Cards Strip: Estimasi Honor dari tiap-tiap server */}
                <div className={`mt-auto pt-2.5 border-t border-white/20 grid gap-1 sm:gap-1.5 ${
                  myServerHonorBreakdown.length === 1
                    ? 'grid-cols-1'
                    : myServerHonorBreakdown.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-3'
                }`}>
                  {myServerHonorBreakdown.slice(0, 3).map((item, idx) => {
                    const isAggregatedLast = myServerHonorBreakdown.length > 3 && idx === 2;
                    const titleText = isAggregatedLast ? 'LAINNYA' : item.namaServer.toUpperCase();
                    const honorValue = isAggregatedLast
                      ? myServerHonorBreakdown.slice(2).reduce((sum, s) => sum + s.totalHonor, 0)
                      : item.totalHonor;

                    return (
                      <div
                        key={item.id || idx}
                        className="bg-emerald-950/40 hover:bg-emerald-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0 flex flex-col items-center justify-center overflow-hidden"
                      >
                        <span
                          className="text-[9px] xs:text-[9.5px] sm:text-[10px] font-black text-white block leading-tight tracking-tighter text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                          title={formatRupiah(honorValue)}
                        >
                          {formatRupiah(honorValue)}
                        </span>
                        <span
                          className="text-[7.5px] xs:text-[8px] sm:text-[8.5px] font-bold text-emerald-100 uppercase tracking-tight block mt-0.5 text-center leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                          title={item.namaServer}
                        >
                          {titleText}
                        </span>
                      </div>
                    );
                  })}
                  {myServerHonorBreakdown.length === 0 && (
                    <div className="col-span-3 bg-emerald-950/40 p-1.5 rounded-xl border border-white/15 text-center">
                      <span className="text-[10px] font-extrabold text-emerald-100">Belum ada data server</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: PROGRES PENGERJAAN (Vibrant Orange/Amber Theme) */}
            <div
              className="bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-3.5 sm:p-4 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex flex-col justify-between group overflow-hidden relative h-full min-h-[130px]"
            >
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

              <div className="relative z-10 flex flex-col justify-between h-full space-y-2">
                {/* Header: Title + Big White Icon on the right */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-amber-100/90 block">
                      PROGRES PENGERJAAN
                    </span>
                    <p className="text-2xl sm:text-3xl font-black text-white leading-tight mt-0.5">
                      {jobProgressPct}%
                    </p>
                    <p className="text-[10.5px] text-amber-100/80 font-medium mt-0.5 truncate">
                      {completedJobsCount} dari {monthlyJobTarget} Target Jobs Bulan Ini
                    </p>
                  </div>
                  <div className="p-2 bg-white/20 backdrop-blur-xs rounded-xl text-white shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full h-1.5 bg-black/25 rounded-full overflow-hidden my-0.5">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500 shadow-xs"
                    style={{ width: `${jobProgressPct}%` }}
                  />
                </div>

                {/* Bottom 3 Mini Cards Strip: TERCAPAI, SISA, TARGET */}
                <div className="mt-auto pt-2.5 border-t border-white/20 grid grid-cols-3 gap-1 sm:gap-1.5">
                  <div className="bg-amber-950/40 hover:bg-amber-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                      {completedJobsCount}
                    </span>
                    <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-amber-100 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                      TERCAPAI
                    </span>
                  </div>
                  <div className="bg-amber-950/40 hover:bg-amber-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                      {Math.max(0, monthlyJobTarget - completedJobsCount)}
                    </span>
                    <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-amber-100 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                      SISA
                    </span>
                  </div>
                  <div className="bg-amber-950/40 hover:bg-amber-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                    <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                      {monthlyJobTarget}
                    </span>
                    <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-amber-100 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                      TARGET
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: TEKNISI ONLINE (Vibrant Purple Theme) */}
            <div
              className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-900 text-white rounded-2xl p-3 sm:p-3.5 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex flex-col justify-between group overflow-hidden relative"
            >
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

              <div className="relative z-10 flex flex-col space-y-1.5">
                {/* Circular Donut Ring Representation */}
                <div className="flex flex-col items-center justify-center my-0.5 relative">
                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90 drop-shadow-md" viewBox="0 0 36 36">
                      {/* Background Track Circle */}
                      <path
                        className="text-purple-950/70 stroke-current"
                        strokeWidth="4.2"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      {/* Active Online Segment Circle */}
                      <path
                        className="text-emerald-400 stroke-current transition-all duration-1000 ease-out"
                        strokeDasharray={`${totalTechniciansCount > 0 ? Math.round((onlineTechniciansCount / totalTechniciansCount) * 100) : 0}, 100`}
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    {/* Center Number Metric Inside Ring */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-sm sm:text-base font-black text-white leading-none">
                        {onlineTechniciansCount}
                      </span>
                      <span className="text-[8px] font-bold text-purple-200/90 leading-tight mt-0.5">
                        / {totalTechniciansCount}
                      </span>
                    </div>
                  </div>

                  {/* Title Centered Directly Below Donut Ring */}
                  <div className="mt-0.5 text-center">
                    <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-white block leading-tight">
                      TEKNISI ONLINE
                    </span>
                    <span className="text-[9px] text-purple-200 font-medium inline-flex items-center justify-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      {onlineTechniciansCount > 0 ? `${onlineTechniciansCount} Aktif Online` : 'Memonitor Aktivitas'}
                    </span>
                  </div>
                </div>

                {/* TEKNISI & PENGGUNA AKTIF */}
                <div
                  className="pt-1.5 border-t border-white/20"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider text-purple-100 flex items-center gap-1">
                      <Users className="w-3 h-3 text-emerald-300" />
                      Teknisi & Pengguna Aktif ({activeOnlineTechnicians.length})
                    </span>
                    <span className="inline-flex items-center gap-1 text-[8px] text-emerald-300 font-extrabold bg-black/30 px-1.5 py-0.2 rounded-full border border-emerald-400/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </span>
                  </div>

                  {activeOnlineTechnicians.length === 0 ? (
                    <p className="text-[9.5px] text-purple-200/70 italic text-center py-0.5">Belum ada pengguna aktif</p>
                  ) : (
                    <div className="space-y-1 max-h-20 overflow-y-auto pr-0.5 custom-scrollbar">
                      {activeOnlineTechnicians.map((u, idx) => {
                        const isSelf = u.id === currentUser?.id || u.namaLengkap === currentUser?.namaLengkap;

                        return (
                          <div
                            key={u.id || idx}
                            className={`flex items-center justify-between gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg text-[9.5px] transition-colors ${
                              isSelf ? 'bg-white/20 font-bold border border-white/30' : 'bg-black/20 hover:bg-black/30'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span className="truncate text-white" title={u.namaLengkap}>
                                {u.namaLengkap} {isSelf && '(Saya)'}
                              </span>
                            </div>
                            <span className="text-[7.5px] font-bold px-1.5 py-0.2 rounded-md border shrink-0 bg-emerald-400/25 text-emerald-200 border-emerald-300/40">
                              Teknisi
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Warning if jobs are withheld pending Absen Pulang or Admin Approval */}
          {unverifiedJobsCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-300/80 rounded-xl text-amber-950 text-xs flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-[11px] leading-tight text-amber-900 font-medium">
                  <strong className="text-amber-950 font-black">{unverifiedJobsCount} Pekerjaan Tertahan:</strong> Belum masuk hitungan gaji karena belum Absen Pulang atau menunggu Approval Admin (keterlambatan).
                </span>
              </div>
              {!hasAbsenPulang && hasAbsenMasuk && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('absensi')}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-lg text-[10px] shrink-0 cursor-pointer shadow-xs active:scale-95 transition-all"
                >
                  Absen Pulang
                </button>
              )}
            </div>
          )}

          {/* Daily Attendance Quick Glance */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-maroon-800" />
                <span>Status Absensi Hari Ini ({todayStr})</span>
              </h3>
              <button
                type="button"
                onClick={() => handleSelectTab('absensi')}
                className="text-[11px] font-bold text-maroon-800 hover:text-maroon-900 flex items-center space-x-0.5 cursor-pointer"
              >
                <span>Kelola Absensi</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2 rounded-xl border flex items-center justify-between ${hasAbsenMasuk ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                <div>
                  <span className="text-[10px] text-slate-500 block">Absen Masuk</span>
                  <span className="font-bold text-sm">
                    {hasAbsenMasuk ? `${sanitizeTimeString(todayAttendance?.jamMasuk, '08:00')} WIB` : 'Belum Absen'}
                  </span>
                </div>
                {isValidPhotoUrl(todayAttendance?.fotoProofUrl) && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPhotoModal({
                      url: todayAttendance?.fotoProofUrl || '',
                      title: `Foto Selfie Masuk (${todayStr} ${todayAttendance?.jamMasuk})`
                    })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedPhotoModal({
                          url: todayAttendance?.fotoProofUrl || '',
                          title: `Foto Selfie Masuk (${todayStr} ${todayAttendance?.jamMasuk})`
                        });
                      }
                    }}
                    className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-300 shadow-2xs cursor-pointer hover:scale-105 transition-transform shrink-0"
                    title="Klik untuk Pratinjau Foto Selfie Masuk"
                  >
                    <SafeImage
                      src={todayAttendance?.fotoProofUrl}
                      alt="Selfie Masuk"
                      className="w-full h-full object-cover"
                      fallbackText="Masuk"
                      showOpenLink={false}
                    />
                  </div>
                )}
              </div>

              <div className={`p-2 rounded-xl border flex items-center justify-between ${hasAbsenPulang ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                <div>
                  <span className="text-[10px] text-slate-500 block">Absen Pulang</span>
                  <span className="font-bold text-sm">
                    {hasAbsenPulang ? `${sanitizeTimeString(todayAttendance?.jamPulang, '17:00')} WIB` : 'Belum Absen'}
                  </span>
                </div>
                {isValidPhotoUrl(todayAttendance?.fotoPulangUrl) && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPhotoModal({
                      url: todayAttendance?.fotoPulangUrl || '',
                      title: `Foto Selfie Pulang (${todayStr} ${todayAttendance?.jamPulang})`
                    })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedPhotoModal({
                          url: todayAttendance.fotoPulangUrl || '',
                          title: `Foto Selfie Pulang (${todayStr} ${todayAttendance.jamPulang})`
                        });
                      }
                    }}
                    className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-300 shadow-2xs cursor-pointer hover:scale-105 transition-transform shrink-0"
                    title="Klik untuk Pratinjau Foto Selfie Pulang"
                  >
                    <SafeImage
                      src={todayAttendance.fotoPulangUrl}
                      alt="Selfie Pulang"
                      className="w-full h-full object-cover"
                      fallbackText="Pulang"
                      showOpenLink={false}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card Teknisi Absen Masuk & Pulang Hari Ini (Simpel & Sederhana, Tanpa Foto) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-maroon-800" />
                <span>Teknisi Absen Masuk / Pulang Hari Ini</span>
              </h3>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                {todayAttendedList.length} Hadir
              </span>
            </div>

            {todayAttendedList.length === 0 ? (
              <div className="py-4 px-3 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 font-medium">
                  Tidak ada teknisi yang melakukan absen hari ini
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden text-xs">
                {todayAttendedList.map(tech => (
                  <div
                    key={tech.id || tech.nama}
                    className={`p-2 sm:px-2.5 flex items-center justify-between transition-colors ${
                      tech.isCurrentUser ? 'bg-amber-50/50' : 'bg-white hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Nama Teknisi & Status Dot */}
                    <div className="flex items-center space-x-2 min-w-0 pr-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          tech.statusType === 'hadir'
                            ? 'bg-emerald-500'
                            : tech.statusType === 'aktif'
                            ? 'bg-sky-500'
                            : tech.statusType === 'terlambat'
                            ? 'bg-amber-500'
                            : tech.statusType === 'izin'
                            ? 'bg-purple-500'
                            : 'bg-slate-300'
                        }`}
                        title={tech.status}
                      />
                      <span className="font-bold text-slate-800 text-xs truncate">
                        {tech.nama}
                        {tech.isCurrentUser && (
                          <span className="ml-1 text-[10px] font-semibold text-maroon-800">
                            (Saya)
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Waktu Masuk & Pulang + Status Badge */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="text-[11px] text-right font-medium">
                        <span className="text-slate-400 text-[10px] mr-1">Masuk:</span>
                        <span className={`font-bold ${tech.jamMasuk !== '-' ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {tech.jamMasuk}
                        </span>
                        <span className="text-slate-300 mx-1">•</span>
                        <span className="text-slate-400 text-[10px] mr-1">Pulang:</span>
                        <span className={`font-bold ${tech.jamPulang !== '-' ? 'text-sky-700' : 'text-slate-400'}`}>
                          {tech.jamPulang}
                        </span>
                      </div>

                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${
                          tech.statusType === 'hadir'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tech.statusType === 'aktif'
                            ? 'bg-sky-100 text-sky-800'
                            : tech.statusType === 'terlambat'
                            ? 'bg-amber-100 text-amber-800'
                            : tech.statusType === 'izin'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {tech.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assigned Urgent Planning Glance */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-maroon-800" />
                <span>Tugas Planning Aktif ({myPlanningTasks.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => handleSelectTab('planning')}
                className="text-[11px] font-bold text-maroon-800 hover:text-maroon-900 flex items-center space-x-0.5 cursor-pointer"
              >
                <span>Lihat Semua</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {myPlanningTasks.length === 0 ? (
              <p className="text-xs text-slate-400 py-2.5 text-center">
                Semua tugas planning saat ini telah selesai dikerjakan.
              </p>
            ) : (
              <div className="space-y-1.5">
                {myPlanningTasks.slice(0, 3).map(plan => (
                  <div
                    key={plan.id}
                    className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1 text-xs"
                  >
                    <div className="flex justify-between items-start">
                      <span className="px-2 py-0.5 bg-maroon-50 text-maroon-800 font-bold text-[10px] rounded-md border border-maroon-200/60">
                        {plan.subPekerjaanNama}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {plan.tanggal}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900">{plan.detailPekerjaan}</p>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[11px] text-slate-500">Server: {plan.namaServer}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isDeviceOnline()) {
                            showAppAlert({
                              title: 'Koneksi Terputus',
                              message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nSilakan periksa koneksi internet HP Anda sebelum melakukan input pekerjaan.',
                              type: 'warning'
                            });
                            return;
                          }
                          if (hasAbsenPulang && currentUser.role !== 'Admin') {
                            showAppAlert({
                              title: 'Teknisi Sudah Absen Pulang',
                              message: `Anda sudah melakukan Absen Pulang hari ini${todayAttendance?.jamPulang ? ` (Pukul ${todayAttendance.jamPulang} WIB)` : ''}.\n\nSesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat melakukan input data pekerjaan pada tanggal yang sama.\n\nSilakan hubungi Admin jika terdapat data pekerjaan yang perlu disusulkan.`,
                              type: 'error'
                            });
                            return;
                          }
                          if (!hasAbsenMasuk && currentUser.role !== 'Admin') {
                            showAppAlert({
                              title: 'Akses Ditolak: Belum Absen Masuk',
                              message: 'Wajib absen masuk terlebih dahulu sebelum menginput pekerjaan.',
                              type: 'warning'
                            });
                            handleSelectTab('absensi');
                            return;
                          }
                          onOpenQuickAddJob();
                        }}
                        className="text-[10px] font-extrabold px-2 py-1 bg-maroon-800 hover:bg-maroon-900 text-white rounded-lg shadow-2xs cursor-pointer"
                      >
                        Input Pekerjaan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 20 Pekerjaan Terakhir (Real-time) Bulan Berjalan */}
          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-maroon-800" />
                  <span>20 Pekerjaan Terakhir (Real-time)</span>
                </h3>
              </div>

              {/* Search Input */}
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  placeholder="Cari pekerjaan..."
                  value={recentJobSearchTerm}
                  onChange={e => setRecentJobSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                />
              </div>
            </div>

            {/* Jobs List */}
            <div className="space-y-2 flex-1 overflow-y-auto max-h-[480px] pr-1">
              {myRecent20Jobs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  Belum ada data pekerjaan bulan ini yang cocok.
                </div>
              ) : (
                myRecent20Jobs.map(job => {
                  const photoUrl = job.buktiFotoUrls?.[0] || job.buktiFotoUrl;
                  const matchedServer = servers.find(s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer);
                  const displayServerName = matchedServer ? matchedServer.namaServer : (job.namaServer && !job.namaServer.startsWith('srv-') ? job.namaServer : 'Server');

                  return (
                    <div
                      key={job.id}
                      className="p-2.5 sm:p-3 bg-slate-50 hover:bg-maroon-50/40 border border-slate-100 rounded-lg sm:rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        {/* 1. Nama Teknisi */}
                        <p className="text-xs text-slate-700">
                          <span>Teknisi: </span>
                          <strong className="text-slate-900 font-extrabold">
                            {job.teknisiNamas && job.teknisiNamas.length > 0 ? job.teknisiNamas.join(', ') : currentUser.namaLengkap}
                          </strong>
                        </p>

                        {/* 2. Jenis & Sub Pekerjaan (sejajar/1 baris) */}
                        <div className="flex items-center space-x-1.5 flex-nowrap min-w-0">
                          <span className="px-2 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/60 font-bold text-[10px] rounded-md shrink-0 whitespace-nowrap">
                            {job.jenisPekerjaanNama}
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate" title={job.subPekerjaanNama}>
                            {job.subPekerjaanNama}
                          </span>
                        </div>

                        {/* 3. Keterangan Pekerjaan yang diambil dari kolom catatan */}
                        {(job.catatan || (job as any).keterangan) && (job.catatan || (job as any).keterangan).trim().length > 0 && (
                          <p className="text-xs text-slate-700 font-medium italic bg-white/80 px-2 py-1 rounded-md border border-slate-200/60">
                            {job.catatan || (job as any).keterangan}
                          </p>
                        )}

                        {/* 4. Informasi Tambahan: Tanggal, Server, Titik & Kabel (dinamis jika > 0) */}
                        <div className="flex items-center space-x-3 text-[11px] text-slate-400 pt-0.5 flex-wrap gap-y-1">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{job.tanggal}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <MapPin className="w-3 h-3 text-emerald-500" />
                            <span>{displayServerName}</span>
                          </span>
                          {(Number(job.jumlahTitik) > 0 || Number(job.panjangKabelMeter) > 0) ? (
                            <span>
                              {Number(job.jumlahTitik) > 0 ? `Titik: ${job.jumlahTitik}` : ''}
                              {Number(job.jumlahTitik) > 0 && Number(job.panjangKabelMeter) > 0 ? ' | ' : ''}
                              {Number(job.panjangKabelMeter) > 0 ? `Kabel: ${job.panjangKabelMeter}m` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* 5. Nominal Honor per Teknisi & tombol bukti foto di sisi kanan */}
                      {(() => {
                        const myJobHonor = calculateTechnicianHonorForJob(job, currentUser, employees, jenisList, settings);
                        return (
                          <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 shrink-0">
                            <div className="text-left sm:text-right">
                              <p className="text-[10px] text-slate-400 font-medium">
                                {myJobHonor.isMagang ? 'Honor Anda (Magang 50%)' : 'Honor Anda'}
                              </p>
                              <p className="text-xs sm:text-sm font-black text-maroon-800">
                                +{formatRupiah(myJobHonor.totalHonor)}
                              </p>
                            </div>

                            {photoUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedPhotoModal({
                                    url: photoUrl,
                                    title: `Bukti Foto - ${job.jenisPekerjaanNama} (${job.subPekerjaanNama})`
                                  })
                                }
                                className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg shadow-2xs cursor-pointer active:scale-95"
                                title="Lihat Bukti Foto Pekerjaan"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToPekerjaanDaftar) {
                    onNavigateToPekerjaanDaftar();
                  } else {
                    handleSelectTab('gaji');
                  }
                }}
                className="text-xs font-bold text-maroon-800 hover:text-maroon-900 flex items-center justify-center space-x-1 mx-auto cursor-pointer"
              >
                <span>Lihat Semua Riwayat Pekerjaan Saya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PLANNING                                                           */}
      {/* ========================================================================= */}
      {activeTab === 'planning' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-100">
              <div className="p-2 bg-maroon-50 text-maroon-800 rounded-xl">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">Planning Pekerjaan Teknisi</h3>
              </div>
            </div>

            {/* Filter Segmented */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPlanningFilter('Belum')}
                className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  planningFilter === 'Belum' ? 'bg-white text-maroon-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Belum Selesai ({myPlanningTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setPlanningFilter('Selesai')}
                className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  planningFilter === 'Selesai' ? 'bg-white text-maroon-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Selesai ({myCompletedPlanningTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setPlanningFilter('Semua')}
                className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  planningFilter === 'Semua' ? 'bg-white text-maroon-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Semua ({allMyPlanningTasks.length})
              </button>
            </div>

            {/* Planning Task Cards */}
            {filteredPlanningTasks.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <CheckCircle className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-medium">Tidak ada tugas planning pada filter ini.</p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {filteredPlanningTasks.map(plan => (
                  <div
                    key={plan.id}
                    className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2 text-xs shadow-2xs hover:border-maroon-300 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="px-2.5 py-1 bg-maroon-100 text-maroon-900 font-extrabold text-[11px] rounded-lg">
                        {plan.subPekerjaanNama}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                        plan.status === 'Selesai'
                          ? 'bg-emerald-100 text-emerald-800'
                          : plan.status === 'Proses'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {plan.status}
                      </span>
                    </div>

                    <p className="font-extrabold text-slate-900 text-sm">{plan.detailPekerjaan}</p>

                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Server Lokasi:</span>
                        <strong className="text-slate-700">{plan.namaServer}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tanggal Tugas:</span>
                        <strong className="text-slate-700">{plan.tanggal}</strong>
                      </div>
                    </div>

                    {plan.status !== 'Selesai' && (
                      <div className="pt-2 border-t border-slate-200 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isDeviceOnline()) {
                              showAppAlert({
                                title: 'Koneksi Terputus',
                                message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nPastikan koneksi internet HP Anda aktif.',
                                type: 'warning'
                              });
                              return;
                            }
                            if (hasAbsenPulang && currentUser.role !== 'Admin') {
                              showAppAlert({
                                title: 'Teknisi Sudah Absen Pulang',
                                message: `Anda sudah melakukan Absen Pulang hari ini${todayAttendance?.jamPulang ? ` (Pukul ${todayAttendance.jamPulang} WIB)` : ''}.\n\nSesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat melakukan input data pekerjaan pada tanggal yang sama.\n\nSilakan hubungi Admin jika terdapat data pekerjaan yang perlu disusulkan.`,
                                type: 'error'
                              });
                              return;
                            }
                            if (!hasAbsenMasuk && currentUser.role !== 'Admin') {
                              showAppAlert({
                                title: 'Akses Ditolak: Belum Absen Masuk',
                                message: 'Anda belum melakukan absen masuk harian hari ini!\n\nSilakan lakukan absen masuk GPS terlebih dahulu.',
                                type: 'warning'
                              });
                              handleSelectTab('absensi');
                              return;
                            }
                            onOpenQuickAddJob();
                          }}
                          className="px-3.5 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 cursor-pointer active:scale-95 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Input Pekerjaan Ini</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ABSENSI                                                            */}
      {/* ========================================================================= */}
      {activeTab === 'absensi' && (
        <div className="space-y-4">
          {/* Sub-menu Tabs for Absensi (4 Menu: Menu Absensi, Izin/Cuti, Status Harian, Riwayat Absensi) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setAbsensiSubTab('absen')}
              className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer truncate ${
                absensiSubTab === 'absen' ? 'bg-maroon-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Menu Absensi
            </button>
            <button
              type="button"
              onClick={() => setAbsensiSubTab('izin')}
              className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer truncate ${
                absensiSubTab === 'izin' ? 'bg-maroon-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Izin / Cuti
            </button>
            <button
              type="button"
              onClick={() => setAbsensiSubTab('status')}
              className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer truncate ${
                absensiSubTab === 'status' ? 'bg-maroon-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Status Harian
            </button>
            <button
              type="button"
              onClick={() => setAbsensiSubTab('riwayat')}
              className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer truncate ${
                absensiSubTab === 'riwayat' ? 'bg-maroon-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Riwayat Absensi
            </button>
          </div>

          {/* SUB-TAB 1: MENU ABSENSI (ABSEN MASUK & PULANG) */}
          {absensiSubTab === 'absen' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 text-xs font-medium">
              {/* Quick switch to Absen Ketidakhadiran */}
              <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-base">📋</span>
                  <div>
                    <p className="font-bold text-amber-950">Berhalangan Hadir?</p>
                    <p className="text-amber-800/90 text-[11px]">Ajukan absen ketidakhadiran</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAbsensiSubTab('izin')}
                  className="px-2.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold text-[11px] shadow-2xs shrink-0 cursor-pointer transition-all active:scale-95"
                >
                  Absen Izin / Cuti
                </button>
              </div>

              <div className="flex items-center space-x-2.5 pb-2.5 border-b border-slate-100">
                <div className="p-2 bg-maroon-50 text-maroon-800 rounded-xl">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Menu Absensi GPS & Kamera</h3>
                </div>
              </div>

              {/* Status Alert Banner */}
              {radiusError && (
                <div className="p-3 bg-red-50 border border-red-300 text-red-900 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-xs text-red-700">
                    <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                    <span>ABSENSI DITOLAK</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">{radiusError}</p>
                </div>
              )}

              {/* Status Absensi Glance */}
              <div className="space-y-2">
                {hasAbsenMasuk && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs">Sudah Absen Masuk ({sanitizeTimeString(todayAttendance?.jamMasuk, '08:00')} WIB)</p>
                      <p className="text-[11px] text-emerald-700">
                        Server: {(!/^(ya|tidak|yes|no|true|false|-|--|undefined|null|server|server\s*ya)$/i.test(todayAttendance?.serverNama || '') && todayAttendance?.serverNama) ? todayAttendance.serverNama : activeServerObj.namaServer} • Status: {todayAttendance?.status}
                      </p>
                    </div>
                    {isValidPhotoUrl(todayAttendance?.fotoProofUrl) && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPhotoModal({
                          url: todayAttendance?.fotoProofUrl || '',
                          title: `Foto Selfie Masuk (${todayStr} ${todayAttendance?.jamMasuk})`
                        })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedPhotoModal({
                              url: todayAttendance?.fotoProofUrl || '',
                              title: `Foto Selfie Masuk (${todayStr} ${todayAttendance?.jamMasuk})`
                            });
                          }
                        }}
                        className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-300 shadow-2xs cursor-pointer hover:scale-105 transition-transform shrink-0"
                      >
                        <SafeImage
                          src={todayAttendance?.fotoProofUrl}
                          alt="Selfie Masuk"
                          className="w-full h-full object-cover"
                          fallbackText="Masuk"
                          showOpenLink={false}
                        />
                      </div>
                    )}
                  </div>
                )}

                {hasAbsenPulang && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs">Sudah Absen Pulang ({sanitizeTimeString(todayAttendance?.jamPulang, '17:00')} WIB)</p>
                      <p className="text-[11px] text-emerald-700">Absensi harian hari ini telah lengkap.</p>
                    </div>
                    {isValidPhotoUrl(todayAttendance?.fotoPulangUrl) && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPhotoModal({
                          url: todayAttendance?.fotoPulangUrl || '',
                          title: `Foto Selfie Pulang (${todayStr} ${todayAttendance?.jamPulang})`
                        })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedPhotoModal({
                              url: todayAttendance?.fotoPulangUrl || '',
                              title: `Foto Selfie Pulang (${todayStr} ${todayAttendance?.jamPulang})`
                            });
                          }
                        }}
                        className="w-9 h-9 rounded-lg overflow-hidden border border-emerald-300 shadow-2xs cursor-pointer hover:scale-105 transition-transform shrink-0"
                      >
                        <SafeImage
                          src={todayAttendance?.fotoPulangUrl}
                          alt="Selfie Pulang"
                          className="w-full h-full object-cover"
                          fallbackText="Pulang"
                          showOpenLink={false}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FORM 1: ABSEN MASUK */}
              {!hasAbsenMasuk && (
                <form onSubmit={handlePerformMasuk} className="space-y-3.5 pt-1">
                  <div className="bg-maroon-50/70 p-2.5 rounded-xl border border-maroon-100 flex items-center justify-between">
                    <span className="font-black text-maroon-900 text-xs">LANGKAH 1: ABSEN MASUK</span>
                    <span className="text-[10px] bg-maroon-800 text-white font-bold px-2 py-0.5 rounded-full">Clock In</span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Pilih Server Absen</label>
                    <select
                      value={selectedServerId}
                      onChange={e => setSelectedServerId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-maroon-800 text-xs"
                    >
                      {sortedServers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.namaServer} ({s.alamat} - Radius {s.toleransiRadiusMeter}m)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* GPS Position Check */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Lokasi GPS</label>
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      className="w-full py-2.5 bg-maroon-50 text-maroon-800 border border-maroon-200 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-maroon-100 transition-colors cursor-pointer text-xs"
                    >
                      <MapPin className="w-4 h-4 text-maroon-800" />
                      <span>{isLocating ? 'Mencari Koordinat GPS...' : 'Cek Lokasi GPS Saya'}</span>
                    </button>

                    {currentGps && computedDistance !== null && (
                      <div className={`mt-2 p-2.5 rounded-xl border text-xs ${
                        isDistanceValid
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div className="flex items-center justify-between font-bold">
                          <span>Jarak ke Server:</span>
                          <span className="text-sm">{computedDistance} Meter</span>
                        </div>
                        <p className="text-[11px] mt-0.5">
                          Batas Toleransi Server: <strong>{activeServerObj.toleransiRadiusMeter}m</strong>
                        </p>
                        {isDistanceValid ? (
                          <span className="inline-block mt-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            ✓ Dalam Radius Server
                          </span>
                        ) : (
                          <span className="inline-block mt-1 text-[10px] font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                            ❌ Di Luar Radius Server!
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Foto Kamera Selfie Masuk */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Foto Selfie Masuk</label>
                    {(localMasukPreview || selfieMasukPhoto) ? (
                      <div className="relative rounded-xl overflow-hidden border border-maroon-200 bg-slate-900 max-w-xs mx-auto">
                        <SafeImage src={localMasukPreview || selfieMasukPhoto} alt="Selfie Masuk" className="w-full h-44 object-cover" />
                        <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDirectCameraType('masuk');
                              setIsDirectCameraOpen(true);
                            }}
                            className="px-3 py-1.5 bg-white text-slate-900 rounded-xl font-extrabold text-xs shadow-md flex items-center space-x-1 cursor-pointer hover:bg-slate-100"
                          >
                            <Camera className="w-3.5 h-3.5 text-maroon-800" />
                            <span>Ambil Ulang Foto</span>
                          </button>
                        </div>
                        <span className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          ✓ Foto Siap
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDirectCameraType('masuk');
                          setIsDirectCameraOpen(true);
                        }}
                        className="w-full py-4 border-2 border-dashed border-maroon-300 bg-maroon-50/50 hover:bg-maroon-50 rounded-xl flex flex-col items-center justify-center text-maroon-800 transition-all cursor-pointer"
                      >
                        <Camera className="w-6 h-6 mb-1 text-maroon-800" />
                        <span className="font-extrabold text-xs">Buka Kamera Selfie Masuk</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Keterangan (Opsional)</label>
                    <input
                      type="text"
                      value={absenNote}
                      onChange={e => setAbsenNote(e.target.value)}
                      placeholder="Kondisi atau catatan masuk..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-maroon-800 text-white font-extrabold text-xs rounded-xl hover:bg-maroon-900 shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-98"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim Absen Masuk</span>
                  </button>
                </form>
              )}

              {/* FORM 2: ABSEN PULANG */}
              {hasAbsenMasuk && !hasAbsenPulang && (
                <form onSubmit={handlePerformPulang} className="space-y-3.5 pt-2 border-t border-slate-200">
                  <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                    <span className="font-black text-emerald-900 text-xs">LANGKAH 2: ABSEN PULANG</span>
                    <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">Clock Out</span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Pilih Server Pulang</label>
                    <select
                      value={selectedServerId}
                      onChange={e => setSelectedServerId(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-600 text-xs"
                    >
                      {sortedServers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.namaServer} ({s.alamat} - Radius {s.toleransiRadiusMeter}m)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* GPS Position Check */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Lokasi GPS</label>
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      className="w-full py-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold flex items-center justify-center space-x-2 hover:bg-emerald-100 transition-colors cursor-pointer text-xs"
                    >
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      <span>{isLocating ? 'Mencari Koordinat GPS...' : 'Cek Lokasi GPS Saya'}</span>
                    </button>

                    {currentGps && computedDistance !== null && (
                      <div className={`mt-2 p-2.5 rounded-xl border text-xs ${
                        isDistanceValid
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div className="flex items-center justify-between font-bold">
                          <span>Jarak ke Server:</span>
                          <span className="text-sm">{computedDistance} Meter</span>
                        </div>
                        <p className="text-[11px] mt-0.5">
                          Batas Toleransi: <strong>{activeServerObj.toleransiRadiusMeter}m</strong>
                        </p>
                        {isDistanceValid ? (
                          <span className="inline-block mt-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            ✓ Dalam Radius Server
                          </span>
                        ) : (
                          <span className="inline-block mt-1 text-[10px] font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                            ❌ Melebihi Radius!
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Foto Kamera Selfie Pulang */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Foto Selfie Pulang</label>
                    {(localPulangPreview || selfiePulangPhoto) ? (
                      <div className="relative rounded-xl overflow-hidden border border-emerald-200 bg-slate-900 max-w-xs mx-auto">
                        <SafeImage src={localPulangPreview || selfiePulangPhoto} alt="Selfie Pulang" className="w-full h-44 object-cover" />
                        <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDirectCameraType('pulang');
                              setIsDirectCameraOpen(true);
                            }}
                            className="px-3 py-1.5 bg-white text-slate-900 rounded-xl font-extrabold text-xs shadow-md flex items-center space-x-1 cursor-pointer hover:bg-slate-100"
                          >
                            <Camera className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Ambil Ulang Foto</span>
                          </button>
                        </div>
                        <span className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          ✓ Foto Siap
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDirectCameraType('pulang');
                          setIsDirectCameraOpen(true);
                        }}
                        className="w-full py-4 border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl flex flex-col items-center justify-center text-emerald-700 transition-all cursor-pointer"
                      >
                        <Camera className="w-6 h-6 mb-1 text-emerald-600" />
                        <span className="font-extrabold text-xs">Buka Kamera Selfie Pulang</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">Catatan Pulang (Opsional)</label>
                    <input
                      type="text"
                      value={absenPulangNote}
                      onChange={e => setAbsenPulangNote(e.target.value)}
                      placeholder="Laporan singkat pulang..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-emerald-600 text-white font-extrabold text-xs rounded-xl hover:bg-emerald-700 shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer transition-all active:scale-98"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim Absen Pulang</span>
                  </button>
                </form>
              )}

              {hasAbsenMasuk && hasAbsenPulang && (
                <div className="py-6 text-center text-slate-600 space-y-2">
                  <CheckCircle className="w-10 h-10 mx-auto text-emerald-600" />
                  <h4 className="font-extrabold text-slate-900 text-sm">Absensi Hari Ini Telah Lengkap</h4>
                  <p className="text-xs text-slate-500">
                    Anda sudah melakukan absen masuk dan pulang hari ini.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: STATUS ABSENSI HARIAN */}
          {absensiSubTab === 'status' && (
            <div className="space-y-4">
              {/* Status Harian Detail */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-100">
                  <div className="p-2 bg-maroon-50 text-maroon-800 rounded-xl">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">Status Absensi Harian ({todayStr})</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Masuk Card */}
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-xs text-slate-700">Absen Masuk</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        hasAbsenMasuk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {hasAbsenMasuk ? 'TERCATAT' : 'BELUM'}
                      </span>
                    </div>

                    <p className="text-base font-black text-slate-900">
                      {hasAbsenMasuk ? `${sanitizeTimeString(todayAttendance?.jamMasuk, '08:00')} WIB` : '-'}
                    </p>

                    {isValidPhotoUrl(todayAttendance?.fotoProofUrl) && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-400 font-bold block">Foto Pratinjau Masuk:</span>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPhotoModal({
                            url: todayAttendance.fotoProofUrl || '',
                            title: `Foto Selfie Masuk (${todayStr} ${todayAttendance.jamMasuk})`
                          })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedPhotoModal({
                                url: todayAttendance.fotoProofUrl || '',
                                title: `Foto Selfie Masuk (${todayStr} ${todayAttendance.jamMasuk})`
                              });
                            }
                          }}
                          className="w-full h-32 rounded-xl overflow-hidden border border-emerald-300 shadow-xs cursor-pointer hover:opacity-95 transition-opacity relative group"
                        >
                          <SafeImage
                            src={todayAttendance.fotoProofUrl}
                            alt="Selfie Masuk"
                            className="w-full h-full object-cover"
                            fallbackText="Selfie Masuk"
                            showOpenLink={false}
                          />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="w-4 h-4 mr-1" /> Klik untuk Perbesar
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pulang Card */}
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-xs text-slate-700">Absen Pulang</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        hasAbsenPulang ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {hasAbsenPulang ? 'TERCATAT' : 'BELUM'}
                      </span>
                    </div>

                    <p className="text-base font-black text-slate-900">
                      {hasAbsenPulang ? `${sanitizeTimeString(todayAttendance?.jamPulang, '17:00')} WIB` : '-'}
                    </p>

                    {isValidPhotoUrl(todayAttendance?.fotoPulangUrl) && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-400 font-bold block">Foto Pratinjau Pulang:</span>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPhotoModal({
                            url: todayAttendance.fotoPulangUrl || '',
                            title: `Foto Selfie Pulang (${todayStr} ${todayAttendance.jamPulang})`
                          })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedPhotoModal({
                                url: todayAttendance.fotoPulangUrl || '',
                                title: `Foto Selfie Pulang (${todayStr} ${todayAttendance.jamPulang})`
                              });
                            }
                          }}
                          className="w-full h-32 rounded-xl overflow-hidden border border-emerald-300 shadow-xs cursor-pointer hover:opacity-95 transition-opacity relative group"
                        >
                          <SafeImage
                            src={todayAttendance.fotoPulangUrl}
                            alt="Selfie Pulang"
                            className="w-full h-full object-cover"
                            fallbackText="Selfie Pulang"
                            showOpenLink={false}
                          />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="w-4 h-4 mr-1" /> Klik untuk Perbesar
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 4: RIWAYAT ABSENSI */}
          {absensiSubTab === 'riwayat' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <History className="w-4 h-4 text-maroon-800" />
                    <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                      Riwayat Absensi Kehadiran ({myAttendanceHistory.length})
                    </h4>
                  </div>
                </div>

                {myAttendanceHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    Belum ada riwayat absensi yang tercatat.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {myAttendanceHistory.map(att => (
                      <div
                        key={att.id}
                        className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl flex items-center justify-between text-xs gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-slate-900">{att.tanggal}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              att.status === 'Hadir' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {att.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Masuk: {sanitizeTimeString(att.jamMasuk, '08:00')} WIB • Pulang: {sanitizeTimeString(att.jamPulang, '-')} WIB
                          </p>
                          {att.serverNama && !/^(ya|tidak|yes|no|true|false|-|--|undefined|null|server|server\s*ya)$/i.test(att.serverNama) && (
                            <p className="text-[10px] text-slate-400">Server: {att.serverNama}</p>
                          )}
                        </div>

                        {/* Thumbnail photos */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {isValidPhotoUrl(att.fotoProofUrl) && (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedPhotoModal({
                                url: att.fotoProofUrl || '',
                                title: `Foto Selfie Masuk (${att.tanggal} ${att.jamMasuk})`
                              })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setSelectedPhotoModal({
                                    url: att.fotoProofUrl || '',
                                    title: `Foto Selfie Masuk (${att.tanggal} ${att.jamMasuk})`
                                  });
                                }
                              }}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-300 shadow-2xs hover:scale-105 transition-transform cursor-pointer"
                              title="Foto Masuk"
                            >
                              <SafeImage
                                src={att.fotoProofUrl}
                                alt="Selfie Masuk"
                                className="w-full h-full object-cover"
                                fallbackText="Masuk"
                                showOpenLink={false}
                              />
                            </div>
                          )}
                          {isValidPhotoUrl(att.fotoPulangUrl) && (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedPhotoModal({
                                url: att.fotoPulangUrl || '',
                                title: `Foto Selfie Pulang (${att.tanggal} ${att.jamPulang})`
                              })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setSelectedPhotoModal({
                                    url: att.fotoPulangUrl || '',
                                    title: `Foto Selfie Pulang (${att.tanggal} ${att.jamPulang})`
                                  });
                                }
                              }}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-300 shadow-2xs hover:scale-105 transition-transform cursor-pointer"
                              title="Foto Pulang"
                            >
                              <SafeImage
                                src={att.fotoPulangUrl}
                                alt="Selfie Pulang"
                                className="w-full h-full object-cover"
                                fallbackText="Pulang"
                                showOpenLink={false}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUB-TAB: IZIN / CUTI (SOP CUTI TERINTEGRASI) */}
          {absensiSubTab === 'izin' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs max-w-lg mx-auto space-y-4 text-xs font-medium">
                <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">Pengajuan Izin / Cuti</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Form permohonan izin atau cuti karyawan & teknisi</p>
                  </div>
                  <span className="px-2.5 py-1 bg-maroon-50 text-maroon-800 border border-maroon-200/80 rounded-lg text-[10px] font-extrabold">
                    SOP Terintegrasi
                  </span>
                </div>

                <form onSubmit={handlePerformLeave} className="space-y-3.5">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">
                      Tanggal Izin / Cuti <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={leaveDate}
                      onChange={e => setLeaveDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1 text-xs">
                      Jenis Permohonan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={leaveType}
                      onChange={e => setLeaveType(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                    >
                      <option value="Izin">Izin</option>
                      <option value="Cuti">Cuti (SOP Otomatis Disetujui)</option>
                      <option value="Sakit">Sakit</option>
                    </select>
                  </div>

                  {/* INFORMASI TOTAL CUTI & SISA CUTI (OTOMATIS TAMPIL KETIKA PILIHAN CUTI DIPILIH) */}
                  {leaveType === 'Cuti' && (
                    <div className="p-3.5 bg-gradient-to-br from-amber-50/70 via-rose-50/40 to-slate-50 border border-amber-200/90 rounded-2xl space-y-3 animate-fade-in shadow-2xs">
                      <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                        <div className="flex items-center space-x-1.5 text-maroon-900 font-extrabold text-xs">
                          <Calendar className="w-4 h-4 text-maroon-700 shrink-0" />
                          <span>Informasi Kuota Cuti (Tahun {cutiStats.selectedYear})</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Otomatis Disetujui
                        </span>
                      </div>

                      {/* 4 Kotak Metrik Kuota Cuti */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Total Cuti */}
                        <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="text-[9.5px] uppercase font-bold text-slate-400 block tracking-wider">
                            TOTAL KUOTA CUTI
                          </span>
                          <p className="text-base font-black text-slate-900 mt-0.5">
                            {cutiStats.totalCutiTahunan} <span className="text-xs font-bold text-slate-500">Hari / Thn</span>
                          </p>
                          <span className="text-[9.5px] text-slate-400 font-medium">1 kali / bulan</span>
                        </div>

                        {/* Sisa Cuti */}
                        <div className="bg-white/90 p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                          <span className="text-[9.5px] uppercase font-bold text-emerald-700 block tracking-wider">
                            SISA CUTI TAHUN INI
                          </span>
                          <p className={`text-base font-black mt-0.5 ${cutiStats.sisaCutiTahun > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {cutiStats.sisaCutiTahun} <span className="text-xs font-bold text-slate-500">Hari</span>
                          </p>
                          <span className="text-[9.5px] text-slate-400 font-medium">
                            {cutiStats.cutiTerpakaiTahun} hari terpakai
                          </span>
                        </div>

                        {/* Cuti Bulan Ini */}
                        <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="text-[9.5px] uppercase font-bold text-blue-700 block tracking-wider truncate">
                            CUTI {cutiStats.namaBulanIndo.toUpperCase()}
                          </span>
                          <p className="text-base font-black text-slate-900 mt-0.5">
                            {cutiStats.cutiTerpakaiBulan} <span className="text-xs font-bold text-slate-500">/ 2 Hari</span>
                          </p>
                          <span className="text-[9.5px] text-slate-400 font-medium">Maks. 2 hari / bulan</span>
                        </div>

                        {/* Sisa Kuota Bulan Ini */}
                        <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="text-[9.5px] uppercase font-bold text-amber-700 block tracking-wider">
                            SISA BULAN INI
                          </span>
                          <p className={`text-base font-black mt-0.5 ${cutiStats.sisaCutiBulan > 0 ? 'text-amber-700' : 'text-rose-600'}`}>
                            {cutiStats.sisaCutiBulan} <span className="text-xs font-bold text-slate-500">Hari</span>
                          </p>
                          <span className="text-[9.5px] text-slate-400 font-medium">Bulan {cutiStats.namaBulanIndo}</span>
                        </div>
                      </div>

                      {/* Status / Alert Kuota */}
                      {cutiStats.isTahunExceeded ? (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] font-bold text-rose-800 flex items-start space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          <span>Kuota cuti tahunan tahun {cutiStats.selectedYear} telah habis (12 dari 12 hari sudah digunakan).</span>
                        </div>
                      ) : cutiStats.isBulanExceeded ? (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-800 flex items-start space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>Batas maksimal 2 hari cuti di bulan {cutiStats.namaBulanIndo} {cutiStats.selectedYear} telah tercapai.</span>
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] font-semibold text-emerald-900 flex items-start space-x-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>
                            Sisa cuti tersedia ({cutiStats.sisaCutiTahun} hari). Cuti disetujui otomatis tanpa menunggu approval admin.
                          </span>
                        </div>
                      )}

                      {/* Ringkasan Ketentuan SOP Cuti */}
                      <div className="pt-1.5 border-t border-amber-200/50 text-[10.5px] text-slate-600 space-y-1">
                        <p className="font-extrabold text-slate-800">Ketentuan SOP Cuti Karyawan:</p>
                        <ul className="list-disc list-inside space-y-0.5 pl-1 text-[10px]">
                          <li>Hak cuti: 1 kali/bulan atau 12 hari dalam 1 tahun.</li>
                          <li>Tidak boleh diambil sekaligus. Maksimal cuti dalam 1 bulan adalah 2 hari.</li>
                          <li>Wajib mengisi alasan lengkap minimal 50 karakter.</li>
                          <li>Data cuti otomatis disetujui dan langsung tercatat di sistem.</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-700 font-bold text-xs">
                        Alasan Lengkap <span className="text-rose-500">*</span>
                      </label>
                      {leaveType === 'Cuti' && (
                        <span className={`text-[10px] font-extrabold ${leaveReason.trim().length >= 50 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {leaveReason.trim().length} / 50 Karakter
                        </span>
                      )}
                    </div>
                    <textarea
                      required
                      rows={3}
                      value={leaveReason}
                      onChange={e => setLeaveReason(e.target.value)}
                      placeholder={
                        leaveType === 'Cuti'
                          ? 'Jelaskan alasan permohonan cuti secara rinci (wajib minimal 50 karakter)...'
                          : 'Jelaskan alasan izin atau sakit...'
                      }
                      className={`w-full p-2.5 bg-slate-50 border rounded-xl text-xs transition-all focus:outline-hidden focus:ring-2 ${
                        leaveType === 'Cuti' && leaveReason.trim().length > 0 && leaveReason.trim().length < 50
                          ? 'border-rose-300 focus:ring-rose-500'
                          : 'border-slate-200 focus:ring-maroon-800'
                      }`}
                    />
                    {leaveType === 'Cuti' && (
                      <div className="mt-1 flex items-center justify-between text-[10px]">
                        {leaveReason.trim().length < 50 ? (
                          <span className="text-rose-600 font-bold">
                            ⚠️ Kurang {50 - leaveReason.trim().length} karakter lagi (minimal 50 karakter).
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            ✓ Alasan memenuhi syarat minimal ({leaveReason.trim().length} karakter).
                          </span>
                        )}
                        <span className="text-slate-400">Wajib diisi lengkap</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-maroon-800 text-white font-bold rounded-xl hover:bg-maroon-900 shadow-sm cursor-pointer active:scale-98 transition-all flex items-center justify-center space-x-1.5"
                  >
                    <span>{leaveType === 'Cuti' ? 'Simpan Cuti (Disetujui Otomatis)' : 'Kirim Pengajuan Izin'}</span>
                  </button>
                </form>
              </div>

              {/* Riwayat Pengajuan Izin / Cuti */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs max-w-lg mx-auto space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                    Riwayat Pengajuan Izin & Cuti ({myLeaveRequests.length})
                  </h4>
                  <span className="text-[10px] text-slate-400 font-medium">Tercatat di sistem</span>
                </div>

                {myLeaveRequests.length === 0 ? (
                  <p className="text-slate-400 py-3 text-center text-xs">
                    Belum ada pengajuan izin/cuti yang tercatat.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {myLeaveRequests.map(l => (
                      <div key={l.id} className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900">{l.jenis} • {formatDisplayDateIndo(l.tanggal)}</span>
                            {l.jenis === 'Cuti' && (
                              <span className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                                SOP Cuti
                              </span>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            l.status === 'Approved' || l.status === 'Disetujui'
                              ? 'bg-emerald-100 text-emerald-800'
                              : l.status === 'Rejected' || l.status === 'Ditolak'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {l.status === 'Approved' || l.status === 'Disetujui'
                              ? (l.jenis === 'Cuti' ? 'Disetujui Otomatis' : 'Disetujui')
                              : l.status === 'Rejected' || l.status === 'Ditolak'
                              ? 'Ditolak'
                              : 'Menunggu Approval'}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">"{l.alasan}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GAJI & ESTIMASI HONOR                                              */}
      {/* ========================================================================= */}
      {activeTab === 'gaji' && (
        <div className="space-y-4">
          {/* Header Profil Gaji Teknisi */}
          <div className="bg-gradient-to-br from-maroon-950 via-maroon-900 to-maroon-800 text-white rounded-2xl p-4 sm:p-5 shadow-md space-y-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-maroon-800 border border-rose-300/30 text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
                  {currentUser.namaLengkap?.charAt(0) || 'T'}
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-white/10 rounded-full text-rose-200">
                      Gaji & Honorarium
                    </span>
                    <span className="text-[10px] text-emerald-300 font-bold">• {currentUser.status || 'Teknisi'}</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                    {currentUser.namaLengkap}
                  </h2>
                </div>
              </div>
              <span className="text-[11px] font-bold text-rose-200 bg-white/10 px-2.5 py-1 rounded-xl">
                {currentMonthName}
              </span>
            </div>

            {/* 3 Primary Gaji Metric Cards: Jumlah Jobs, Estimasi Honor & Rekap Gaji Bersih */}
            <div className="pt-2 border-t border-maroon-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-black/25 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                <span className="text-[11px] text-rose-200/90 font-medium block">Jumlah Jobs Bulan Ini</span>
                <span className="text-xl font-black text-white leading-tight mt-0.5 block">
                  {myMonthlyJobs.length} <span className="text-xs font-normal text-rose-200/70">Pekerjaan</span>
                </span>
                <span className="text-[10px] text-emerald-300 font-semibold block mt-1">
                  • Total Semua: {myJobs.length} Jobs
                </span>
              </div>
              <div className="bg-black/25 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                <span className="text-[11px] text-rose-200/90 font-medium block">Estimasi Honor Pekerjaan</span>
                <span className="text-lg sm:text-xl font-black text-amber-300 leading-tight mt-0.5 block truncate">
                  {formatRupiah(myPayrollRecap.estimasiHonor ?? (myPayrollRecap.honorDasarPekerjaan + myPayrollRecap.honorLembur + myPayrollRecap.honorTitik + myPayrollRecap.honorPanjangKabel))}
                </span>
                <span className="text-[10px] text-amber-200/80 font-semibold block mt-1">
                  Dasar + Lembur + Titik + Kabel
                </span>
              </div>
              <div className="bg-black/25 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                <span className="text-[11px] text-rose-200/90 font-medium block">Rekap Gaji Bersih (Nett)</span>
                <span className="text-lg sm:text-xl font-black text-emerald-300 leading-tight mt-0.5 block truncate">
                  {formatRupiah(myPayrollRecap.totalHonorNett)}
                </span>
                <span className="text-[10px] text-rose-200/80 font-semibold block mt-1">
                  Semua Honor + Bonus - Potongan
                </span>
              </div>
            </div>

            {/* Breakdown Detail Komponen */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1 text-[11px]">
              <div className="bg-white/5 p-2 rounded-lg">
                <span className="text-rose-200/70 text-[10px] block">Honor Dasar:</span>
                <strong className="text-white font-bold">{formatRupiah(myPayrollRecap.honorDasarPekerjaan || 0)}</strong>
                <span className="text-[9px] text-rose-200/60 block">({myPayrollRecap.totalPekerjaanCount || 0} jobs)</span>
              </div>
              <div className="bg-white/5 p-2 rounded-lg">
                <span className="text-rose-200/70 text-[10px] block">Titik & Kabel:</span>
                <strong className="text-white font-bold">{formatRupiah((myPayrollRecap.honorTitik || 0) + (myPayrollRecap.honorPanjangKabel || 0))}</strong>
                <span className="text-[9px] text-rose-200/60 block">(Bagi rata)</span>
              </div>
              <div className="bg-white/5 p-2 rounded-lg">
                <span className="text-rose-200/70 text-[10px] block">Honor Lembur (ACC):</span>
                <strong className="text-amber-300 font-bold">{formatRupiah(myPayrollRecap.honorLembur || 0)}</strong>
                {myPayrollRecap.totalMenitLembur !== undefined && myPayrollRecap.totalMenitLembur > 0 && (
                  <span className="text-[9px] text-amber-200/80 block">({myPayrollRecap.totalMenitLembur} mnt)</span>
                )}
              </div>
              <div className="bg-white/5 p-2 rounded-lg">
                <span className="text-rose-200/70 text-[10px] block">Transport Pribadi:</span>
                <strong className="text-white font-bold">{formatRupiah(myPayrollRecap.honorTransportKendaraan || 0)}</strong>
              </div>
              <div className="bg-white/5 p-2 rounded-lg">
                <span className="text-rose-200/70 text-[10px] block">Bonus Target:</span>
                <strong className="text-emerald-300 font-bold">+{formatRupiah(myPayrollRecap.bonusTarget || 0)}</strong>
              </div>
              <div className="bg-white/5 p-2 rounded-lg">
                <span className="text-rose-200/70 text-[10px] block">Honor Tetap & PJ:</span>
                <strong className="text-white font-bold">{formatRupiah((myPayrollRecap.honorTetapServer || 0) + (myPayrollRecap.honorPJWilayah || 0))}</strong>
                {myPayrollRecap.potonganManualKasbon > 0 && (
                  <span className="text-[9px] text-rose-300 block font-semibold">
                    (Kasbon: -{formatRupiah(myPayrollRecap.potonganManualKasbon)})
                  </span>
                )}
              </div>
              {myPayrollRecap.totalPotongan > 0 && (
                <div className="bg-rose-950/50 border border-rose-500/30 p-2 rounded-lg">
                  <span className="text-rose-300 text-[10px] block font-bold">Total Potongan:</span>
                  <strong className="text-rose-300 font-bold">-{formatRupiah(myPayrollRecap.totalPotongan)}</strong>
                  <div className="text-[9px] text-rose-300/80 space-y-0.5">
                    {myPayrollRecap.potonganTerlambatAbsen > 0 && (
                      <span>Absen: -{formatRupiah(myPayrollRecap.potonganTerlambatAbsen)} </span>
                    )}
                    {myPayrollRecap.potonganManualKasbon > 0 && (
                      <span>Kasbon: -{formatRupiah(myPayrollRecap.potonganManualKasbon)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rincian Sumber Server Pengeluaran (Tempat Pekerjaan & Lembur) */}
            {myPayrollRecap.serverBreakdowns && myPayrollRecap.serverBreakdowns.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-200/80 block">
                  Distribusi Honor per Server Pengerjaan ({myPayrollRecap.serverBreakdowns.length} Server):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {myPayrollRecap.serverBreakdowns.map((sb, idx) => (
                    <div key={idx} className="bg-black/30 border border-white/10 rounded-xl p-2.5 text-xs text-rose-100">
                      <div className="flex items-center justify-between pb-1 border-b border-white/10">
                        <span className="font-extrabold text-white">{sb.serverNama}</span>
                        <span className="font-black text-amber-300">{formatRupiah(sb.totalGross)}</span>
                      </div>
                      <div className="pt-1.5 space-y-0.5 text-[10px] text-rose-200/80">
                        <div className="flex justify-between">
                          <span>Honor Dasar ({sb.jobCount} jobs):</span>
                          <span className="font-semibold text-white">{formatRupiah(sb.honorDasarPekerjaan)}</span>
                        </div>
                        {(sb.honorTitik > 0 || sb.honorPanjangKabel > 0) && (
                          <div className="flex justify-between text-rose-200/90">
                            <span>Titik & Kabel:</span>
                            <span className="font-semibold text-white">+{formatRupiah(sb.honorTitik + sb.honorPanjangKabel)}</span>
                          </div>
                        )}
                        {sb.honorLembur > 0 && (
                          <div className="flex justify-between text-amber-300">
                            <span>Honor Lembur ({sb.menitLembur || 0} mnt):</span>
                            <span className="font-bold">+{formatRupiah(sb.honorLembur)}</span>
                          </div>
                        )}
                        {sb.honorTransportKendaraan > 0 && (
                          <div className="flex justify-between text-indigo-200">
                            <span>Transport Pribadi:</span>
                            <span className="font-bold">+{formatRupiah(sb.honorTransportKendaraan)}</span>
                          </div>
                        )}
                        {sb.bonusTarget > 0 && (
                          <div className="flex justify-between text-emerald-300">
                            <span>Bonus Target:</span>
                            <span className="font-bold">+{formatRupiah(sb.bonusTarget)}</span>
                          </div>
                        )}
                        {(sb.honorTetapServer > 0 || sb.honorPJWilayah > 0) && (
                          <div className="flex justify-between">
                            <span>Honor Tetap / Wilayah:</span>
                            <span className="font-semibold text-white">+{formatRupiah(sb.honorTetapServer + sb.honorPJWilayah)}</span>
                          </div>
                        )}
                        {sb.potonganManualServer !== undefined && sb.potonganManualServer > 0 && (
                          <div className="flex justify-between text-rose-300 font-bold">
                            <span>Potongan Kasbon Server:</span>
                            <span>-{formatRupiah(sb.potonganManualServer)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Kalkulator Estimasi Honor Lengkap dengan Kendaraan dan Lembur */}
          <HonorCalculator
            jenisList={jenisList}
            wilayahList={wilayahList}
            title="Kalkulator Estimasi Honor"
          />

          {/* Riwayat Pekerjaan Teknisi Bulan Ini */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-maroon-800" />
                  <span>Riwayat Pekerjaan Teknisi Bulan Ini</span>
                </h3>
              </div>

              {/* Quick Search */}
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={jobSearchTerm}
                  onChange={e => setJobSearchTerm(e.target.value)}
                  placeholder="Cari pekerjaan..."
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-maroon-800"
                />
              </div>
            </div>

            {/* Warning if jobs are withheld pending Absen Pulang or Admin Approval */}
            {unverifiedJobsCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-amber-900">
                    {unverifiedJobsCount} Pekerjaan Belum Ditampilkan & Belum Terhitung Gaji
                  </p>
                  <p className="text-amber-800 text-[11px] leading-relaxed">
                    Sesuai SOP, pekerjaan pada hari kerja tidak akan dihitung ke rekap gaji jika Anda belum melakukan <strong>Absen Pulang</strong> atau jika absensi Anda terlambat dan sedang <strong>Menunggu Persetujuan (Approval) Admin</strong>. Honor pekerjaan akan otomatis aktif dan masuk ke rekap gaji setelah absensi disetujui Admin.
                  </p>
                </div>
              </div>
            )}

            {/* List of Jobs */}
            {filteredMonthlyJobs.length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-1">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-medium">
                  {jobSearchTerm ? 'Tidak ditemukan pekerjaan yang cocok dengan pencarian.' : 'Belum ada pekerjaan yang diinput pada bulan ini.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredMonthlyJobs.map(job => (
                  <div
                    key={job.id}
                    className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs hover:border-maroon-300 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-black text-slate-900 text-sm block">{job.jenisPekerjaanNama}</span>
                        <span className="text-maroon-800 font-bold text-[11px]">{job.subPekerjaanNama}</span>
                      </div>
                      <span className="font-black text-sm text-maroon-900 bg-maroon-50 px-2.5 py-1 rounded-xl border border-maroon-200/70 shrink-0">
                        +{formatRupiah(job.honorPerTeknisi)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-0.5">
                      <span>Tanggal: <strong>{job.tanggal}</strong></span>
                      <span>Server: <strong>{job.namaServer}</strong></span>
                      {job.adaLembur && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          job.lemburApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          Lembur {job.menitLembur}m {job.lemburApproved ? '(Approved)' : '(Pending)'}
                        </span>
                      )}
                      {(() => {
                        const hasPulang = checkTechnicianHasPulang(currentUser, job.tanggal, attendanceList);
                        const attApproval = checkTechnicianAttendanceApproved(currentUser, job.tanggal, attendanceList, settings);
                        if (!hasPulang) {
                          return (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300" title="Belum absen pulang pada tanggal ini">
                              Belum Absen Pulang
                            </span>
                          );
                        }
                        if (!attApproval.isEligible) {
                          return (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300" title={attApproval.reason || 'Menunggu Approval Admin'}>
                              Menunggu Approval Admin
                            </span>
                          );
                        }
                        return (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            Masuk Rekap Gaji
                          </span>
                        );
                      })()}
                    </div>

                    {job.catatan && (
                      <p className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100 italic">
                        "{job.catatan}"
                      </p>
                    )}

                    {/* Foto Bukti Pekerjaan Preview Thumbnail */}
                    {(job.buktiFotoUrl || (job.buktiFotoUrls && job.buktiFotoUrls.length > 0)) && (
                      <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500">Bukti Foto Pekerjaan:</span>
                        <div className="flex items-center space-x-1.5">
                          {(job.buktiFotoUrls && job.buktiFotoUrls.length > 0 ? job.buktiFotoUrls : [job.buktiFotoUrl || '']).map((url, idx) => (
                            <div
                              key={idx}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedPhotoModal({
                                url: url,
                                title: `Bukti Pekerjaan: ${job.subPekerjaanNama} (${job.tanggal})`
                              })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setSelectedPhotoModal({
                                    url: url,
                                    title: `Bukti Pekerjaan: ${job.subPekerjaanNama} (${job.tanggal})`
                                  });
                                }
                              }}
                              className="w-9 h-9 rounded-lg overflow-hidden border border-slate-300 shadow-2xs hover:scale-105 transition-transform cursor-pointer"
                              title="Klik untuk Pratinjau Foto Bukti Pekerjaan"
                            >
                              <SafeImage
                                src={url}
                                alt={`Bukti Pekerjaan ${idx + 1}`}
                                className="w-full h-full object-cover"
                                fallbackText="Foto"
                                showOpenLink={false}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Direct Live Camera Modal */}
      <DirectCameraModal
        isOpen={isDirectCameraOpen}
        onClose={() => setIsDirectCameraOpen(false)}
        title={directCameraType === 'masuk' ? 'Kamera Selfie Masuk' : 'Kamera Selfie Pulang'}
        onCapture={async (imgData) => {
          const isMasuk = directCameraType === 'masuk';
          try {
            // 1. Immediately compress image to clean, lightweight JPEG (~80KB, proper JPEG markers)
            const compressed = await compressImage(imgData, 0.15, 800);
            if (isMasuk) {
              setLocalMasukPreview(compressed);
              setSelfieMasukPhoto(compressed);
            } else {
              setLocalPulangPreview(compressed);
              setSelfiePulangPhoto(compressed);
            }
            PhotoCacheService.set(compressed, compressed);

            // 2. Upload in background to Google Drive via proxy so attendance record gets Drive URL
            if (settings?.googleAppsScriptUrl) {
              const safeName = currentUser?.namaLengkap?.replace(/[^a-zA-Z0-9]/g, '_') || 'teknisi';
              const filename = `selfie_${isMasuk ? 'masuk' : 'pulang'}_${safeName}_${Date.now()}.jpg`;
              uploadPhotoToGoogleDrive(settings.googleAppsScriptUrl, compressed, filename)
                .then(res => {
                  if (res.success && res.url) {
                    if (isMasuk) {
                      setSelfieMasukPhoto(res.url);
                    } else {
                      setSelfiePulangPhoto(res.url);
                    }
                    if (res.fileId) {
                      PhotoCacheService.set(res.fileId, compressed);
                    }
                    PhotoCacheService.set(res.url, compressed);
                  }
                })
                .catch(err => console.warn('Background selfie upload to Drive failed:', err));
            }
          } catch (err) {
            console.error('Error compressing selfie:', err);
            if (isMasuk) {
              setSelfieMasukPhoto(imgData);
            } else {
              setSelfiePulangPhoto(imgData);
            }
          }
        }}
      />

      {/* Fullscreen Photo Preview Modal */}
      {selectedPhotoModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPhotoModal(null)}
        >
          <div
            className="bg-white p-3 rounded-2xl max-w-sm w-full relative shadow-2xl space-y-2"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-extrabold text-xs text-slate-900 truncate pr-2">
                {selectedPhotoModal.title}
              </h4>
              <button
                onClick={() => setSelectedPhotoModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <SafeImage
              src={selectedPhotoModal.url}
              alt={selectedPhotoModal.title}
              className="w-full h-auto max-h-[65vh] rounded-xl object-contain bg-slate-950"
              fallbackText={selectedPhotoModal.title}
              showOpenLink={true}
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedPhotoModal(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TeknisiDashboardView: React.FC<TeknisiDashboardViewProps> = React.memo(TeknisiDashboardViewComponent);

