import React, { useState, useMemo } from 'react';
import {
  Briefcase,
  DollarSign,
  UserCheck,
  TrendingUp,
  Clock,
  ChevronRight,
  Search,
  Eye,
  AlertTriangle,
  AlertCircle,
  Layers,
  MapPin,
  Calendar,
  Server,
  ArrowUpRight,
  LogIn,
  LogOut,
  CheckCircle2,
  CalendarCheck,
  X,
  Filter,
  Wallet,
  Users,
  Signal,
  WifiOff,
  Send,
  MessageCircle,
  RotateCw,
  ChevronDown,
  Globe,
  Phone,
  Menu,
  Banknote,
  CircleDollarSign,
  Cpu,
  EyeOff
} from 'lucide-react';
import { JobRecord, AttendanceRecord, Employee, JenisPekerjaan, ServerData, WilayahPekerjaan } from '../types';
import { formatRupiah, checkTechnicianHasPulang } from '../services/payroll';
import { sanitizeTimeString, sanitizeDateString, getEffectiveTodayISO } from '../services/googleSheetsHelper';
import { StorageService, consolidateAttendanceRecords, getNormalizedTechKey } from '../services/storage';
import { HonorCalculator } from '../components/HonorCalculator';
import { SafeImage } from '../components/SafeImage';
import { isValidPhotoUrl } from '../utils/imageHelper';
import { EditPresensiModal } from '../components/EditPresensiModal';
import { OnlineTechnicianTrendChart } from '../components/OnlineTechnicianTrendChart';
import { useNetworkStatus } from '../utils/networkCheck';
import { InternetStatusBadge } from '../components/InternetStatusBadge';

interface DashboardViewProps {
  jobs: JobRecord[];
  attendance: AttendanceRecord[];
  employees: Employee[];
  servers?: ServerData[];
  jenisList: JenisPekerjaan[];
  wilayahList?: WilayahPekerjaan[];
  pendingApprovalsCount: number;
  currentUser?: Employee;
  onNavigateApproval: () => void;
  onNavigateJobs: () => void;
  onNavigateRekapHonor?: () => void;
  onNavigateEmployees?: () => void;
  onNavigateServer?: () => void;
  onApproveAllAttendance?: () => void;
  onlineTechniciansFromHeartbeat?: Array<{ id: string; namaLengkap: string; role?: string }>;
  onlineUsersFromHeartbeat?: Array<{ id: string; namaLengkap: string; role?: string; serverId?: string; namaServer?: string }>;
  onUpdateAttendance?: (record: AttendanceRecord) => Promise<any> | void;
}

const DashboardViewComponent: React.FC<DashboardViewProps> = ({
  jobs,
  attendance,
  employees,
  servers = [],
  jenisList,
  wilayahList = [],
  pendingApprovalsCount,
  currentUser,
  onNavigateApproval,
  onNavigateJobs,
  onNavigateRekapHonor,
  onNavigateEmployees,
  onNavigateServer,
  onApproveAllAttendance,
  onlineTechniciansFromHeartbeat = [],
  onlineUsersFromHeartbeat = [],
  onUpdateAttendance
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingPresensiRecord, setEditingPresensiRecord] = useState<AttendanceRecord | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photoModalData, setPhotoModalData] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [approveToast, setApproveToast] = useState<string | null>(null);

  // Attendance filter states
  const [attDateFilter, setAttDateFilter] = useState<'today' | 'recent' | 'all'>('today');
  const [attCustomDate, setAttCustomDate] = useState<string>('');
  const [attStatusFilter, setAttStatusFilter] = useState<'all' | 'belum_pulang' | 'sudah_pulang' | 'pending'>('all');
  const [attServerFilter, setAttServerFilter] = useState<string>('all');
  const [attSearchTerm, setAttSearchTerm] = useState<string>('');

  // Internet connection monitoring (3-state quality detection & status badge)
  const { status: networkStatus, rtt: networkRtt, checkNow: checkNetworkNow } = useNetworkStatus({ enableAlertPopup: false });

  // Period & Display States for Dashboard (Matching Gambar 1)
  const [dashboardPeriodMonth, setDashboardPeriodMonth] = useState<string>('October');
  const [dashboardPeriodYear, setDashboardPeriodYear] = useState<string>('2026');
  const [isIncomeMasked, setIsIncomeMasked] = useState<boolean>(true);
  const [incomeTrafficServer, setIncomeTrafficServer] = useState<string>('all');
  const [isAlbinetExpanded, setIsAlbinetExpanded] = useState<boolean>(false);

  // Online Technicians Card server filter state (for Admin)
  const [onlineTechServerFilter, setOnlineTechServerFilter] = useState<string>('all');

  // PJ Server detection and assigned server identification
  const isPjServer = currentUser?.role === 'Penanggungjawab Server';

  const userServer = useMemo(() => {
    if (!isPjServer || !currentUser) return null;
    return (
      servers.find(
        s =>
          (currentUser.serverId && s.id === currentUser.serverId) ||
          (currentUser.id && s.penanggungJawabId === currentUser.id) ||
          (s.penanggungJawabNama && currentUser.namaLengkap && s.penanggungJawabNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim()) ||
          (currentUser.namaServer && s.namaServer.toLowerCase().trim() === currentUser.namaServer.toLowerCase().trim()) ||
          (currentUser.serverId && s.namaServer.toLowerCase().trim() === currentUser.serverId.toLowerCase().trim())
      ) || (currentUser.serverId || currentUser.namaServer ? {
        id: currentUser.serverId || currentUser.namaServer || 'srv-user',
        namaServer: currentUser.namaServer || currentUser.serverId || 'Server Terkait',
        alamat: '',
        penanggungJawabId: currentUser.id,
        penanggungJawabNama: currentUser.namaLengkap
      } as ServerData : null)
    );
  }, [isPjServer, currentUser, servers]);

  // Helper matching job to a specific server
  const isJobInServer = (j: JobRecord, server: ServerData | null) => {
    if (!server) return true;
    const sIdMatch = j.serverId === server.id;
    const sNameMatch = Boolean(
      j.namaServer &&
      server.namaServer &&
      j.namaServer.toLowerCase().trim() === server.namaServer.toLowerCase().trim()
    );
    return sIdMatch || sNameMatch;
  };

  // Helper matching attendance to a specific server
  const isAttendanceInServer = (a: AttendanceRecord, server: ServerData | null) => {
    if (!server) return true;
    if (a.serverId === server.id) return true;
    if (
      a.serverNama &&
      server.namaServer &&
      a.serverNama.toLowerCase().trim() === server.namaServer.toLowerCase().trim()
    ) {
      return true;
    }
    const emp = employees.find(
      e =>
        e.id === a.teknisiId ||
        (e.namaLengkap &&
          a.teknisiNama &&
          e.namaLengkap.toLowerCase().trim() === a.teknisiNama.toLowerCase().trim())
    );
    if (emp) {
      if (emp.serverId === server.id) return true;
      if (
        emp.namaServer &&
        server.namaServer &&
        emp.namaServer.toLowerCase().trim() === server.namaServer.toLowerCase().trim()
      ) {
        return true;
      }
    }
    return false;
  };

  // Quick stats
  const totalJobsCount = jobs.length;
  const totalEstimatedHonorSum = useMemo(() => {
    return jobs.reduce((sum, j) => sum + (j.estimasiTotalHonor || 0), 0);
  }, [jobs]);

  // Today's date (local YYYY-MM-DD in Asia/Jakarta)
  const todayStr = useMemo(() => {
    return getEffectiveTodayISO();
  }, []);

  const currentPeriod = useMemo(() => {
    return todayStr.slice(0, 7);
  }, [todayStr]);

  // Pekerjaan Hari Ini
  const todayJobs = useMemo(() => {
    return jobs.filter(j => {
      if (!j.tanggal) return false;
      return sanitizeDateString(j.tanggal) === todayStr;
    });
  }, [jobs, todayStr]);
  const todayJobsCount = todayJobs.length;

  // Scoped stats for PJ Server (if applicable)
  const displayTodayJobsCount = useMemo(() => {
    if (isPjServer && userServer) {
      return todayJobs.filter(j => isJobInServer(j, userServer)).length;
    }
    return todayJobsCount;
  }, [isPjServer, userServer, todayJobs, todayJobsCount]);

  const displayTotalJobsCount = useMemo(() => {
    if (isPjServer && userServer) {
      return jobs.filter(j => isJobInServer(j, userServer)).length;
    }
    return totalJobsCount;
  }, [isPjServer, userServer, jobs, totalJobsCount]);

  // Attendance scoping for PJ Server vs Admin
  const scopedAttendance = useMemo(() => {
    if (isPjServer && userServer) {
      return attendance.filter(a => isAttendanceInServer(a, userServer));
    }
    return attendance;
  }, [attendance, isPjServer, userServer, employees]);

  // Today's attendance list (cocokkan tanggal menggunakan sanitizeDateString agar seragam)
  const todayAttendance = useMemo(() => {
    return scopedAttendance.filter(a => {
      if (!a.tanggal) return false;
      return sanitizeDateString(a.tanggal) === todayStr;
    });
  }, [scopedAttendance, todayStr]);

  // Helper to safely get the display server name and prevent invalid values like "Ya" or "Tidak"
  const getDisplayServerName = (serverNama?: string, serverId?: string, teknisiId?: string, teknisiNama?: string): string => {
    const isInvalid = (s?: string) => {
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
        l === 'server tidak' ||
        !isNaN(Number(s))
      );
    };

    if (serverNama && !isInvalid(serverNama) && !serverNama.startsWith('srv-')) {
      const clean = serverNama.trim();
      return clean.replace(/^server\s+/i, '');
    }

    if (serverId && !isInvalid(serverId)) {
      const s = servers.find(srv => srv.id === serverId || srv.namaServer.toLowerCase() === serverId.toLowerCase());
      if (s?.namaServer && !isInvalid(s.namaServer)) return s.namaServer.replace(/^server\s+/i, '');
    }

    // Lookup technician in employees
    if (teknisiId || teknisiNama) {
      const emp = employees.find(
        e =>
          (teknisiId && e.id === teknisiId) ||
          (teknisiNama && e.namaLengkap && e.namaLengkap.toLowerCase().trim() === teknisiNama.toLowerCase().trim())
      );
      if (emp?.namaServer && !isInvalid(emp.namaServer)) {
        return emp.namaServer.replace(/^server\s+/i, '');
      }
      if (emp?.serverId) {
        const s = servers.find(srv => srv.id === emp.serverId);
        if (s?.namaServer && !isInvalid(s.namaServer)) return s.namaServer.replace(/^server\s+/i, '');
      }
      if (emp?.serverHonors && emp.serverHonors.length > 0) {
        const sh = emp.serverHonors[0];
        if (sh.namaServer && !isInvalid(sh.namaServer)) return sh.namaServer.replace(/^server\s+/i, '');
      }
    }

    if (userServer?.namaServer && !isInvalid(userServer.namaServer)) {
      return userServer.namaServer.replace(/^server\s+/i, '');
    }

    const firstValid = servers.find(s => s.namaServer && !isInvalid(s.namaServer));
    if (firstValid?.namaServer) return firstValid.namaServer.replace(/^server\s+/i, '');

    return 'Utama';
  };

  // Helper to determine whether an attendance record has completed checkout (absen pulang)
  const isAttendancePulang = (a: AttendanceRecord) => {
    const cleanTgl = sanitizeDateString(a.tanggal);
    const isPast = cleanTgl < todayStr;
    const direct = Boolean(
      (a.jamPulang && a.jamPulang.trim() && a.jamPulang !== '-' && !/^(belum|pending)/i.test(a.jamPulang.trim())) ||
      (a.fotoPulangUrl && a.fotoPulangUrl.trim().length > 5 && !a.fotoPulangUrl.startsWith('[Foto Masuk')) ||
      (a.keteranganPulang && a.keteranganPulang.trim().length > 1 && a.keteranganPulang !== '-')
    );
    const cross = checkTechnicianHasPulang({ id: a.teknisiId, namaLengkap: a.teknisiNama }, cleanTgl, attendance);
    if (direct || cross) return true;
    // Jika tanggal di masa lalu (seperti 04-10-2026) dan absensi tidak ditolak, teknisi pasti sudah selesai jam kerjanya (Sudah Pulang)
    if (isPast && a.status !== 'Ditolak') return true;
    return false;
  };

  // Active date range attendance list
  const activeDateAttendance = useMemo(() => {
    if (attCustomDate) {
      const cleanCustom = sanitizeDateString(attCustomDate);
      return scopedAttendance.filter(a => sanitizeDateString(a.tanggal) === cleanCustom);
    }
    if (attDateFilter === 'today') {
      return todayAttendance;
    }
    if (attDateFilter === 'recent') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const limitStr = getEffectiveTodayISO(d);
      return scopedAttendance.filter(a => sanitizeDateString(a.tanggal) >= limitStr);
    }
    return scopedAttendance;
  }, [attCustomDate, attDateFilter, todayAttendance, scopedAttendance]);

  // Quick statistics for the attendance card (cek kepastian pulang secara cross-record)
  const attStats = useMemo(() => {
    // Konsolidasi dulu agar tidak ada penghitungan ganda dari baris terpisah
    const consolidatedList = consolidateAttendanceRecords(activeDateAttendance);
    const total = consolidatedList.length;
    const sudahPulang = consolidatedList.filter(a => isAttendancePulang(a)).length;
    const belumPulang = Math.max(0, total - sudahPulang);
    const pendingApproval = consolidatedList.filter(
      a => Boolean(a.needsApproval || a.status === 'Pending Approval')
    ).length;

    return { total, sudahPulang, belumPulang, pendingApproval };
  }, [activeDateAttendance, attendance]);

  // Filtered list to display in the attendance card
  const displayedAttendance = useMemo(() => {
    // Konsolidasi otomatis agar rekaman masuk & pulang untuk teknisi pada hari yang sama menyatu
    let list = consolidateAttendanceRecords(activeDateAttendance);

    // Filter server for Admin
    if (!isPjServer && attServerFilter !== 'all') {
      const sObj = servers.find(s => s.id === attServerFilter);
      if (sObj) {
        list = list.filter(a => isAttendanceInServer(a, sObj));
      }
    }

    // Filter status
    if (attStatusFilter === 'belum_pulang') {
      list = list.filter(a => !isAttendancePulang(a));
    } else if (attStatusFilter === 'sudah_pulang') {
      list = list.filter(a => isAttendancePulang(a));
    } else if (attStatusFilter === 'pending') {
      list = list.filter(a => Boolean(a.needsApproval || a.status === 'Pending Approval'));
    }

    // Search query
    if (attSearchTerm.trim()) {
      const q = attSearchTerm.toLowerCase().trim();
      list = list.filter(
        a =>
          (a.teknisiNama && a.teknisiNama.toLowerCase().includes(q)) ||
          (a.serverNama && a.serverNama.toLowerCase().includes(q)) ||
          (a.keterangan && a.keterangan.toLowerCase().includes(q)) ||
          (a.keteranganPulang && a.keteranganPulang.toLowerCase().includes(q))
      );
    }

    // Sort: newest date first, then latest jamMasuk
    return [...list].sort((a, b) => {
      const cleanDateB = sanitizeDateString(b.tanggal);
      const cleanDateA = sanitizeDateString(a.tanggal);
      const c1 = cleanDateB.localeCompare(cleanDateA);
      if (c1 !== 0) return c1;
      return (b.jamMasuk || '').localeCompare(a.jamMasuk || '');
    });
  }, [activeDateAttendance, isPjServer, attServerFilter, attStatusFilter, attSearchTerm, servers, attendance]);

  // Breakdown Estimasi Honor Bulan Ini per Server (Server A: Server B, dst.)
  const serverHonorBreakdown = useMemo(() => {
    const map = new Map<string, { id: string; namaServer: string; totalHonor: number; jobCount: number }>();

    servers.forEach(s => {
      map.set(s.id, { id: s.id, namaServer: s.namaServer, totalHonor: 0, jobCount: 0 });
    });

    // Filter jobs bulan ini
    const monthlyJobs = jobs.filter(j => j.tanggal && j.tanggal.startsWith(currentPeriod));

    monthlyJobs.forEach(j => {
      let sObj = servers.find(s => s.id === j.serverId);
      if (!sObj && j.namaServer) {
        sObj = servers.find(s => s.namaServer.toLowerCase().trim() === j.namaServer.toLowerCase().trim());
      }

      if (sObj && map.has(sObj.id)) {
        const entry = map.get(sObj.id)!;
        entry.totalHonor += (j.estimasiTotalHonor || 0);
        entry.jobCount += 1;
      } else {
        const fallbackName = j.namaServer || 'Lainnya';
        if (!map.has(fallbackName)) {
          map.set(fallbackName, { id: fallbackName, namaServer: fallbackName, totalHonor: 0, jobCount: 0 });
        }
        const entry = map.get(fallbackName)!;
        entry.totalHonor += (j.estimasiTotalHonor || 0);
        entry.jobCount += 1;
      }
    });

    return Array.from(map.values());
  }, [servers, jobs, currentPeriod]);

  // Estimasi Honor Bulan Ini yang dikeluarkan oleh server terkait (khusus PJ Server)
  const serverEstimatedHonorSum = useMemo(() => {
    if (!userServer) return 0;
    return jobs
      .filter(j => isJobInServer(j, userServer) && j.tanggal && j.tanggal.startsWith(currentPeriod))
      .reduce((sum, j) => sum + (j.estimasiTotalHonor || 0), 0);
  }, [jobs, userServer, currentPeriod]);

  const monthEstimatedHonor = useMemo(() => {
    return jobs.filter(j => {
      const inMonth = j.tanggal && j.tanggal.startsWith(currentPeriod);
      if (!inMonth) return false;
      if (isPjServer && userServer) return isJobInServer(j, userServer);
      return true;
    }).reduce((sum, j) => sum + (j.estimasiTotalHonor || 0), 0);
  }, [jobs, currentPeriod, isPjServer, userServer]);

  const displayEstimatedHonor = isPjServer && userServer
    ? serverEstimatedHonorSum
    : monthEstimatedHonor;

  const todayEstimatedHonor = useMemo(() => {
    return (isPjServer && userServer
      ? todayJobs.filter(j => isJobInServer(j, userServer))
      : todayJobs
    ).reduce((sum, j) => sum + (j.estimasiTotalHonor || 0), 0);
  }, [todayJobs, isPjServer, userServer]);

  // Progres Pengerjaan
  // Admin: dari semua jumlah job seluruh server
  const totalTargetAllServers = useMemo(() => {
    if (!servers || servers.length === 0) return 100;
    const sum = servers.reduce((acc, s) => {
      const t = Number(s.targetPekerjaanBulanan);
      return acc + (t > 0 ? t : 60);
    }, 0);
    return sum > 0 ? sum : 100;
  }, [servers]);

  const currentMonthJobsCount = useMemo(() => {
    return jobs.filter(j => j.tanggal && j.tanggal.startsWith(currentPeriod)).length;
  }, [jobs, currentPeriod]);

  // PJ Server: Target dan pekerjaan server terkait
  const serverTarget = useMemo(() => {
    if (!userServer) return 60;
    const t = Number(userServer.targetPekerjaanBulanan);
    return t > 0 ? t : 60;
  }, [userServer]);

  const serverMonthJobsCount = useMemo(() => {
    if (!userServer) return 0;
    return jobs.filter(j => {
      const inMonth = j.tanggal && j.tanggal.startsWith(currentPeriod);
      return inMonth && isJobInServer(j, userServer);
    }).length;
  }, [jobs, currentPeriod, userServer]);

  const displayProgressTarget = isPjServer && userServer
    ? serverTarget
    : totalTargetAllServers;

  const displayProgressJobsCount = isPjServer && userServer
    ? serverMonthJobsCount
    : currentMonthJobsCount;

  const displayProgressPercentage = Math.min(
    100,
    Math.round((displayProgressJobsCount / (displayProgressTarget || 1)) * 100)
  );

  // Active online technicians list (technicians actively opening the application within the last 10 minutes via realtime presence heartbeat)
  const activeOnlineTechnicians = React.useMemo(() => {
    // Collect active technician entries by normalized key
    const activeMap = new Map<string, { id: string; namaLengkap: string; role?: string; serverId?: string; namaServer?: string; lastSeen?: number }>();

    // 1. From onlineTechniciansFromHeartbeat (received from server or cross-tab broadcast)
    (onlineTechniciansFromHeartbeat || []).forEach(h => {
      if (!h || !h.namaLengkap) return;
      const roleStr = String(h.role || '').toLowerCase().trim();
      if (!roleStr || roleStr === 'teknisi') {
        const key = (h.id || h.namaLengkap).toLowerCase().trim();
        activeMap.set(key, h);
      }
    });

    // 2. Or if current session user is a technician
    if (currentUser && String(currentUser.role || '').toLowerCase().trim() === 'teknisi') {
      const key = (currentUser.id || currentUser.namaLengkap).toLowerCase().trim();
      if (!activeMap.has(key)) {
        activeMap.set(key, {
          id: currentUser.id,
          namaLengkap: currentUser.namaLengkap,
          role: currentUser.role,
          serverId: currentUser.serverId,
          namaServer: currentUser.namaServer
        });
      }
    }

    // 3. Enrich with employees data and apply PJ Server scoping if applicable
    const results: Array<{ id: string; namaLengkap: string; role?: string; serverId?: string; namaServer?: string }> = [];
    const processedKeys = new Set<string>();

    activeMap.forEach((activeItem) => {
      // Find matching employee record if available
      const emp = employees.find(e =>
        (e.id && activeItem.id && String(e.id).trim().toLowerCase() === String(activeItem.id).trim().toLowerCase()) ||
        (e.namaLengkap && activeItem.namaLengkap && String(e.namaLengkap).trim().toLowerCase() === String(activeItem.namaLengkap).trim().toLowerCase()) ||
        (e.username && activeItem.id && String(e.username).trim().toLowerCase() === String(activeItem.id).trim().toLowerCase())
      );

      // Scoped for PJ Server: if assigned to another specific server, skip
      if (isPjServer && userServer) {
        const sId = emp?.serverId || activeItem.serverId;
        const sName = emp?.namaServer || activeItem.namaServer;
        // Only skip if explicitly assigned to a DIFFERENT server
        if (sId && sId !== userServer.id && sName && userServer.namaServer && sName.toLowerCase().trim() !== userServer.namaServer.toLowerCase().trim()) {
          return;
        }
      }

      const itemKey = (emp?.id || activeItem.id || activeItem.namaLengkap).toLowerCase().trim();
      if (!processedKeys.has(itemKey)) {
        processedKeys.add(itemKey);
        results.push({
          id: emp?.id || activeItem.id,
          namaLengkap: emp?.namaLengkap || activeItem.namaLengkap,
          role: 'Teknisi',
          serverId: emp?.serverId || activeItem.serverId,
          namaServer: emp?.namaServer || activeItem.namaServer
        });
      }
    });

    return results;
  }, [employees, onlineTechniciansFromHeartbeat, isPjServer, userServer, currentUser]);

  // Active online users list (all technicians, employees, and PJ Server actively opening the application)
  // Displayed specifically on Administrator Dashboard
  const activeOnlineUsers = React.useMemo(() => {
    const activeMap = new Map<string, { id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>();

    // 1. From onlineUsersFromHeartbeat
    (onlineUsersFromHeartbeat || []).forEach(h => {
      if (!h || !h.namaLengkap) return;
      const key = (h.id || h.namaLengkap).toLowerCase().trim();
      activeMap.set(key, {
        id: h.id || key,
        namaLengkap: h.namaLengkap,
        role: h.role || 'Teknisi',
        serverId: h.serverId,
        namaServer: h.namaServer
      });
    });

    // 2. Ensure current session user is included
    if (currentUser) {
      const key = (currentUser.id || currentUser.namaLengkap).toLowerCase().trim();
      if (!activeMap.has(key)) {
        activeMap.set(key, {
          id: currentUser.id,
          namaLengkap: currentUser.namaLengkap,
          role: currentUser.role || 'Admin',
          serverId: currentUser.serverId,
          namaServer: currentUser.namaServer
        });
      }
    }

    // 3. Enrich with master employees list for official display names and roles
    const list: Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }> = [];
    const processedKeys = new Set<string>();

    activeMap.forEach(item => {
      const emp = employees.find(e =>
        (e.id && item.id && String(e.id).trim().toLowerCase() === String(item.id).trim().toLowerCase()) ||
        (e.namaLengkap && item.namaLengkap && String(e.namaLengkap).trim().toLowerCase() === String(item.namaLengkap).trim().toLowerCase())
      );
      const key = (emp?.id || item.id || item.namaLengkap).toLowerCase().trim();
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        list.push({
          id: emp?.id || item.id,
          namaLengkap: emp?.namaLengkap || item.namaLengkap,
          role: emp?.role || item.role,
          serverId: emp?.serverId || item.serverId,
          namaServer: emp?.namaServer || item.namaServer
        });
      }
    });

    return list;
  }, [onlineUsersFromHeartbeat, currentUser, employees]);

  // Active online technicians filtered by selected server (for Admin per-location monitoring)
  const filteredActiveOnlineTechnicians = React.useMemo(() => {
    if (onlineTechServerFilter === 'all' || isPjServer) {
      return activeOnlineTechnicians;
    }
    const targetServer = servers.find(s => s.id === onlineTechServerFilter);
    const targetServerName = targetServer?.namaServer?.toLowerCase().trim();

    return activeOnlineTechnicians.filter(t => {
      if (t.serverId && t.serverId === onlineTechServerFilter) return true;
      if (targetServerName && t.namaServer && t.namaServer.toLowerCase().trim() === targetServerName) return true;
      return false;
    });
  }, [activeOnlineTechnicians, onlineTechServerFilter, servers, isPjServer]);

  // Scoped total technicians in the selected server filter
  const scopedFilteredTotalTechniciansCount = React.useMemo(() => {
    let allTechs = employees.filter(e => String(e.role || '').toLowerCase().trim() === 'teknisi');

    if (isPjServer && userServer) {
      allTechs = allTechs.filter(e =>
        !e.serverId ||
        e.serverId === userServer.id ||
        (e.namaServer && userServer.namaServer && e.namaServer.toLowerCase().trim() === userServer.namaServer.toLowerCase().trim())
      );
    } else if (onlineTechServerFilter !== 'all') {
      const targetServer = servers.find(s => s.id === onlineTechServerFilter);
      const targetServerName = targetServer?.namaServer?.toLowerCase().trim();

      allTechs = allTechs.filter(e => {
        if (e.serverId && e.serverId === onlineTechServerFilter) return true;
        if (targetServerName && e.namaServer && e.namaServer.toLowerCase().trim() === targetServerName) return true;
        return false;
      });
    }

    return allTechs.length;
  }, [employees, isPjServer, userServer, onlineTechServerFilter, servers]);

  const onlineTechniciansCount = filteredActiveOnlineTechnicians.length;
  const totalTechniciansCount = scopedFilteredTotalTechniciansCount;
  const selectedFilterServerObj = servers.find(s => s.id === onlineTechServerFilter);

  // Realtime last 20 jobs (bulan berjalan) - if PJ Server, filter to server terkait
  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (isPjServer && userServer) {
      list = list.filter(j => isJobInServer(j, userServer));
    }
    // Filter to current month (bulan berjalan)
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    list = list.filter(j => (j.tanggal || '').startsWith(currentMonthPrefix));

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter(
        j =>
          (j.jenisPekerjaanNama || '').toLowerCase().includes(term) ||
          (j.subPekerjaanNama || '').toLowerCase().includes(term) ||
          (j.teknisiNamas || []).some(n => n.toLowerCase().includes(term)) ||
          (j.namaServer || '').toLowerCase().includes(term) ||
          (j.catatan || (j as any).keterangan || '').toLowerCase().includes(term) ||
          (j.tanggal || '').includes(term)
      );
    }
    return list.slice(0, 20);
  }, [jobs, isPjServer, userServer, searchTerm]);

  return (
    <div className="space-y-6 pb-20">
      {/* Title & Internet Connection Status Banner (1 Baris / Sejajar) */}
      <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Dashboard {isPjServer && userServer ? `Server ${userServer.namaServer}` : ''}
          </h2>
          {isPjServer && userServer && (
            <span className="px-2.5 py-0.5 bg-maroon-100 text-maroon-800 text-[11px] font-bold rounded-full border border-maroon-200 shadow-2xs">
              PJ: {currentUser?.namaLengkap || 'Penanggungjawab'}
            </span>
          )}
        </div>

        {/* Keterangan Status Koneksi Internet (3 Warna: Hijau, Orange, Merah) */}
        <InternetStatusBadge
          status={networkStatus}
          rtt={networkRtt}
          onRefresh={checkNetworkNow}
        />
      </div>

      {/* Toast Notification */}
      {approveToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in shadow-xs">
          <span>{approveToast}</span>
          <button onClick={() => setApproveToast(null)} className="text-emerald-700 hover:text-emerald-950 text-xs underline cursor-pointer">
            Tutup
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DASHBOARD GRID MATCHING SKETCH DESIGN (Left: 3 Cards + TrendChart, Right: Tall Teknisi Online Card) */}
      {/* ========================================================================= */}
      {/* DASHBOARD STAT CARDS GRID (4 Cards in Top Section: PEKERJAAN -> ESTIMASI HONOR -> PROGRES PENGERJAAN -> TEKNISI ONLINE) */}
      {/* ========================================================================= */}
      <div className="space-y-4 sm:space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-stretch">
          {/* Card 1: PEKERJAAN (Maroon Theme matching DPT-AlaDin Identity) */}
          <div
            role="button"
            tabIndex={0}
            onClick={onNavigateJobs}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigateJobs();
              }
            }}
            style={{ backgroundColor: '#530000' }}
            className="bg-[#530000] text-white rounded-2xl p-3.5 sm:p-4 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col justify-between group overflow-hidden relative h-full min-h-[130px]"
            title="Klik untuk membuka Daftar Pekerjaan Teknisi"
          >
            {/* Ambient Light Decoration */}
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-white/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between h-full space-y-2">
              {/* Header: Title + Icon */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-rose-200/90 block">
                    PEKERJAAN
                  </span>
                  <p className="text-2xl sm:text-3xl font-black text-white leading-tight mt-0.5">
                    {displayTotalJobsCount} <span className="text-xs font-bold text-rose-200/80">Jobs</span>
                  </p>
                  <p className="text-[10.5px] text-rose-100/80 font-medium mt-0.5 truncate">
                    {isPjServer && userServer
                      ? `Server ${userServer.namaServer}`
                      : 'Total semua data pekerjaan'}
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
                  style={{ width: `${displayTotalJobsCount > 0 ? Math.min(100, Math.round((displayProgressJobsCount / displayTotalJobsCount) * 100)) : 0}%` }}
                />
              </div>

              {/* Bottom 3 Mini Cards Strip: HARI INI, BULAN INI, TOTAL */}
              <div className="mt-auto pt-2.5 border-t border-white/20 grid grid-cols-3 gap-1">
                <div className="bg-black/35 hover:bg-black/45 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                    {displayTodayJobsCount}
                  </span>
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-rose-200 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                    HARI INI
                  </span>
                </div>
                <div className="bg-black/35 hover:bg-black/45 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                    {displayProgressJobsCount}
                  </span>
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-rose-200 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                    BULAN INI
                  </span>
                </div>
                <div className="bg-black/35 hover:bg-black/45 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                    {displayTotalJobsCount}
                  </span>
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-rose-200 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                    TOTAL
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: ESTIMASI HONOR (Vibrant Emerald Theme) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (onNavigateRekapHonor) onNavigateRekapHonor();
              else onNavigateJobs();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onNavigateRekapHonor) onNavigateRekapHonor();
                else onNavigateJobs();
              }
            }}
            className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white rounded-2xl p-3.5 sm:p-4 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col justify-between group overflow-hidden relative h-full min-h-[130px]"
            title="Klik untuk membuka Halaman Rekap Gaji"
          >
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-white/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between h-full space-y-2">
              {/* Header: Title + Icon */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 pr-1">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-100/90 block">
                    ESTIMASI HONOR
                  </span>
                  <p className="text-lg sm:text-xl font-black text-white leading-tight mt-0.5 truncate" title={formatRupiah(displayEstimatedHonor)}>
                    {formatRupiah(displayEstimatedHonor)}
                  </p>
                  <p className="text-[10.5px] text-emerald-100/80 font-medium mt-0.5 truncate">
                    {isPjServer && userServer
                      ? `Server ${userServer.namaServer}`
                      : 'Honor Dasar, Lembur, Titik'}
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
                  style={{ width: `${displayProgressTarget > 0 ? Math.min(100, Math.round((displayProgressJobsCount / displayProgressTarget) * 100)) : 100}%` }}
                />
              </div>

              {/* Bottom 3 Mini Cards Strip: Breakdown per server */}
              <div className={`mt-auto pt-2.5 border-t border-white/20 grid gap-1 ${
                isPjServer
                  ? 'grid-cols-1'
                  : serverHonorBreakdown.length === 1
                  ? 'grid-cols-1'
                  : serverHonorBreakdown.length === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-3'
              }`}>
                {isPjServer ? (
                  <div className="bg-emerald-950/40 hover:bg-emerald-950/50 backdrop-blur-xs px-2 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0 flex items-center justify-between overflow-hidden">
                    <span
                      className="text-[9px] font-bold text-emerald-100 uppercase tracking-tight truncate"
                      title={userServer ? `SERVER ${userServer.namaServer.toUpperCase()}` : 'SERVER TERKAIT'}
                    >
                      {userServer ? `SERVER ${userServer.namaServer.toUpperCase()}` : 'SERVER TERKAIT'}
                    </span>
                    <span
                      className="text-[10px] font-black text-white ml-1 whitespace-nowrap"
                      title={formatRupiah(displayEstimatedHonor)}
                    >
                      {formatRupiah(displayEstimatedHonor)}
                    </span>
                  </div>
                ) : (
                  serverHonorBreakdown.slice(0, 3).map((item, idx) => {
                    const isAggregatedLast = serverHonorBreakdown.length > 3 && idx === 2;
                    const titleText = isAggregatedLast ? 'LAINNYA' : item.namaServer.toUpperCase();
                    const honorValue = isAggregatedLast
                      ? serverHonorBreakdown.slice(2).reduce((sum, s) => sum + s.totalHonor, 0)
                      : item.totalHonor;

                    return (
                      <div
                        key={item.id || idx}
                        className="bg-emerald-950/40 hover:bg-emerald-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0 flex flex-col items-center justify-center overflow-hidden"
                      >
                        <span
                          className="text-[9px] sm:text-[10px] font-black text-white block leading-tight tracking-tighter text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                          title={formatRupiah(honorValue)}
                        >
                          {formatRupiah(honorValue)}
                        </span>
                        <span
                          className="text-[7.5px] sm:text-[8.5px] font-bold text-emerald-100 uppercase tracking-tight block mt-0.5 text-center leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                          title={item.namaServer}
                        >
                          {titleText}
                        </span>
                      </div>
                    );
                  })
                )}
                {!isPjServer && serverHonorBreakdown.length === 0 && (
                  <div className="col-span-3 bg-emerald-950/40 p-1.5 rounded-xl border border-white/15 text-center">
                    <span className="text-[10px] font-extrabold text-emerald-100">Belum ada data</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: PROGRES PENGERJAAN (Vibrant Amber/Orange Theme) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (onNavigateServer) onNavigateServer();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onNavigateServer) onNavigateServer();
              }
            }}
            className="bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl p-3.5 sm:p-4 shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex flex-col justify-between group overflow-hidden relative h-full min-h-[130px]"
            title="Klik untuk membuka Menu Server"
          >
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-white/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex flex-col justify-between h-full space-y-2">
              {/* Header: Title + Icon */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-amber-100/90 block">
                    PROGRES PENGERJAAN
                  </span>
                  <p className="text-2xl sm:text-3xl font-black text-white leading-tight mt-0.5">
                    {displayProgressPercentage}%
                  </p>
                  <p className="text-[10.5px] text-amber-100/80 font-medium mt-0.5 truncate">
                    {displayProgressJobsCount} / {displayProgressTarget} Target Jobs
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
                  style={{ width: `${displayProgressPercentage}%` }}
                />
              </div>

              {/* Bottom 3 Mini Cards Strip: TERCAPAI, SISA, TARGET */}
              <div className="mt-auto pt-2.5 border-t border-white/20 grid grid-cols-3 gap-1">
                <div className="bg-amber-950/40 hover:bg-amber-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                    {displayProgressJobsCount}
                  </span>
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-amber-100 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                    TERCAPAI
                  </span>
                </div>
                <div className="bg-amber-950/40 hover:bg-amber-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                    {Math.max(0, displayProgressTarget - displayProgressJobsCount)}
                  </span>
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-amber-100 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                    SISA
                  </span>
                </div>
                <div className="bg-amber-950/40 hover:bg-amber-950/50 backdrop-blur-xs px-1 py-1 sm:py-1.5 rounded-xl border border-white/15 text-center transition-colors shadow-2xs min-w-0">
                  <span className="text-xs sm:text-sm font-extrabold text-white block leading-tight">
                    {displayProgressTarget}
                  </span>
                  <span className="text-[8px] xs:text-[8.5px] sm:text-[9px] font-bold text-amber-100 uppercase tracking-tight block mt-0.5 leading-none whitespace-nowrap">
                    TARGET
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: TEKNISI ONLINE (Compact Purple Card) */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (onNavigateEmployees) onNavigateEmployees();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onNavigateEmployees) onNavigateEmployees();
              }
            }}
            className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-900 text-white rounded-2xl p-3 sm:p-3.5 shadow-md transition-all hover:shadow-xl cursor-pointer flex flex-col justify-between group overflow-hidden relative"
            title="Klik untuk membuka Data Karyawan"
          >
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex flex-col space-y-1.5">
              {/* TOP SECTION: Circular Donut Ring Chart */}
              <div className="flex flex-col items-center justify-center relative">
                <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90 drop-shadow-md" viewBox="0 0 36 36">
                    {/* Track */}
                    <path
                      className="text-purple-950/70 stroke-current"
                      strokeWidth="4.2"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    {/* Progress */}
                    <path
                      className="text-emerald-400 stroke-current transition-all duration-1000 ease-out"
                      strokeDasharray={`${totalTechniciansCount > 0 ? Math.round((onlineTechniciansCount / totalTechniciansCount) * 100) : 0}, 100`}
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  {/* Count in center */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-sm sm:text-base font-black text-white leading-none">
                      {onlineTechniciansCount}
                    </span>
                    <span className="text-[8px] font-bold text-purple-200/90 leading-tight mt-0.5">
                      / {totalTechniciansCount}
                    </span>
                  </div>
                </div>

                {/* Title Centered Below Donut Ring */}
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

              {/* Filter per Server untuk Admin */}
              {!isPjServer && servers.length > 0 && (
                <div
                  className="flex items-center gap-1.5 bg-black/25 hover:bg-black/35 border border-white/20 rounded-lg px-2 py-0.5 transition-colors"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                >
                  <Filter className="w-3 h-3 text-purple-200 shrink-0" />
                  <select
                    value={onlineTechServerFilter}
                    onChange={e => {
                      e.stopPropagation();
                      setOnlineTechServerFilter(e.target.value);
                    }}
                    className="w-full text-[10px] font-bold text-white bg-transparent border-0 outline-hidden cursor-pointer truncate"
                    title="Filter teknisi online berdasarkan lokasi/server"
                    aria-label="Filter Server Teknisi Online"
                  >
                    <option value="all" className="bg-purple-900 text-white">🌐 Semua Server ({activeOnlineTechnicians.length} Online)</option>
                    {servers.map(s => {
                      const countInServer = activeOnlineTechnicians.filter(t =>
                        t.serverId === s.id || (t.namaServer && s.namaServer && t.namaServer.toLowerCase().trim() === s.namaServer.toLowerCase().trim())
                      ).length;
                      return (
                        <option key={s.id} value={s.id} className="bg-purple-900 text-white">
                          📍 {s.namaServer} ({countInServer} Online)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* TEKNISI & PENGGUNA AKTIF */}
              <div
                className="pt-1.5 border-t border-white/20"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider text-purple-100 flex items-center gap-1">
                    <Users className="w-3 h-3 text-emerald-300" />
                    Teknisi & Pengguna Aktif ({activeOnlineUsers.length})
                  </span>
                  <span className="inline-flex items-center gap-1 text-[8px] text-emerald-300 font-extrabold bg-black/30 px-1.5 py-0.2 rounded-full border border-emerald-400/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                </div>

                {activeOnlineUsers.length === 0 ? (
                  <p className="text-[9.5px] text-purple-200/70 italic text-center py-0.5">Belum ada pengguna aktif</p>
                ) : (
                  <div className="space-y-1 max-h-20 overflow-y-auto pr-0.5 custom-scrollbar">
                    {activeOnlineUsers.map((u, idx) => {
                      const isSelf = u.id === currentUser?.id || u.namaLengkap === currentUser?.namaLengkap;
                      const roleDisplay = u.role === 'Penanggungjawab Server' ? 'PJ Server' : u.role || 'Teknisi';
                      const roleBadgeColor =
                        u.role === 'Penanggungjawab Server'
                          ? 'bg-amber-400/25 text-amber-200 border-amber-300/40'
                          : u.role === 'Admin'
                          ? 'bg-rose-400/25 text-rose-200 border-rose-300/40'
                          : 'bg-emerald-400/25 text-emerald-200 border-emerald-300/40';

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
                          <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded-md border shrink-0 ${roleBadgeColor}`}>
                            {roleDisplay}
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

        {/* FULL WIDTH Grafik Tren Teknisi Online 24 Jam Terakhir */}
        <OnlineTechnicianTrendChart
          servers={servers}
          initialServerFilter={onlineTechServerFilter}
          isPjServer={isPjServer}
          userServer={userServer}
        />
      </div>

      {/* ========================================================================= */}
      {/* CARD ABSENSI TEKNISI MASUK & PULANG (ADMIN & PJ SERVER) */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
        {/* Card Header & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Absensi Teknisi (Masuk & Pulang)
                  </h3>
                  {isPjServer && userServer ? (
                    <span className="px-2 py-0.5 bg-maroon-100 text-maroon-800 text-[10px] font-bold rounded-full border border-maroon-200">
                      Server {userServer.namaServer}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-full">
                      Seluruh Server
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Link to Approval Absensi */}
            <button
              onClick={onNavigateApproval}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer border border-indigo-200"
              title="Buka menu lengkap persetujuan dan riwayat absensi"
            >
              <span>Kelola & Tinjau Absensi</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Counter Summary Pills Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Hadir</p>
              <p className="text-base sm:text-lg font-black text-slate-900">{attStats.total}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-slate-200/60 flex items-center justify-center text-slate-700 font-bold text-xs">
              <UserCheck className="w-3.5 h-3.5 text-slate-700" />
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Sudah Pulang</p>
              <p className="text-base sm:text-lg font-black text-emerald-800">{attStats.sudahPulang}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-xs">
              <LogOut className="w-3.5 h-3.5 text-emerald-700" />
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-amber-800">Belum Pulang</p>
              <p className="text-base sm:text-lg font-black text-amber-900">{attStats.belumPulang}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 font-bold text-xs">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
            </div>
          </div>

          <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-rose-700">Perlu Verifikasi</p>
              <p className="text-base sm:text-lg font-black text-rose-900">{attStats.pendingApproval}</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center text-rose-800 font-bold text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
            </div>
          </div>
        </div>

        {/* Filter & Search Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-3">
          {/* Left: Date & Status Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Date Filters */}
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => { setAttDateFilter('today'); setAttCustomDate(''); }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  attDateFilter === 'today' && !attCustomDate
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hari Ini ({todayAttendance.length})
              </button>
              <button
                onClick={() => { setAttDateFilter('recent'); setAttCustomDate(''); }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  attDateFilter === 'recent' && !attCustomDate
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                7 Hari Terakhir
              </button>
              <button
                onClick={() => { setAttDateFilter('all'); setAttCustomDate(''); }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  attDateFilter === 'all' && !attCustomDate
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
            </div>

            {/* Specific Date Picker (Pilih Tanggal Spesifik) */}
            <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <input
                type="date"
                value={attCustomDate}
                onChange={e => {
                  setAttCustomDate(e.target.value);
                  if (e.target.value) setAttDateFilter('all');
                }}
                className={`text-[11px] font-bold rounded-lg px-2 py-1 outline-none border transition-all cursor-pointer ${
                  attCustomDate
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 shadow-2xs'
                }`}
                title="Pilih tanggal spesifik untuk melihat absensi"
              />
              {attCustomDate && (
                <button
                  onClick={() => setAttCustomDate('')}
                  className="text-[10px] text-slate-500 hover:text-rose-600 px-1.5 font-bold cursor-pointer"
                  title="Reset ke filter default"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Filters */}
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
              <button
                onClick={() => setAttStatusFilter('all')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  attStatusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Status
              </button>
              <button
                onClick={() => setAttStatusFilter('belum_pulang')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  attStatusFilter === 'belum_pulang'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                Belum Pulang
              </button>
              <button
                onClick={() => setAttStatusFilter('sudah_pulang')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  attStatusFilter === 'sudah_pulang'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                Sudah Pulang
              </button>
              {attStats.pendingApproval > 0 && (
                <button
                  onClick={() => setAttStatusFilter('pending')}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    attStatusFilter === 'pending'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-rose-800 hover:bg-rose-50'
                  }`}
                >
                  Pending ({attStats.pendingApproval})
                </button>
              )}
            </div>
          </div>

          {/* Right: Server Filter (Admin) & Search Input */}
          <div className="flex items-center gap-2">
            {!isPjServer && servers.length > 0 && (
              <select
                value={attServerFilter}
                onChange={e => setAttServerFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="all">Semua Server</option>
                {servers.map(s => (
                  <option key={s.id} value={s.id}>
                    Server {s.namaServer}
                  </option>
                ))}
              </select>
            )}

            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari teknisi..."
                value={attSearchTerm}
                onChange={e => setAttSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Technician Attendance Cards Grid */}
        {displayedAttendance.length === 0 ? (
          <div className="py-10 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 my-2">
            <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">
              {attDateFilter === 'today'
                ? 'Belum ada data absensi teknisi hari ini'
                : 'Tidak ada data absensi yang sesuai filter'}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              {attDateFilter === 'today'
                ? 'Teknisi yang melakukan absen masuk akan muncul otomatis di sini lengkap dengan foto selfie dan radius koordinat.'
                : 'Coba ubah kata kunci pencarian atau reset filter tanggal dan status.'}
            </p>
            {attDateFilter === 'today' && scopedAttendance.length > 0 && (
              <button
                onClick={() => setAttDateFilter('recent')}
                className="mt-3 px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
              >
                Lihat Absensi 7 Hari Terakhir ({scopedAttendance.length} Total)
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1">
            {displayedAttendance.map(a => {
              const cleanTgl = sanitizeDateString(a.tanggal);
              const hasPulang = isAttendancePulang(a);

              const isSameTechRecord = (att: AttendanceRecord) => {
                const sameDate = sanitizeDateString(att.tanggal) === cleanTgl;
                if (!sameDate) return false;
                if (att.teknisiId && a.teknisiId && att.teknisiId === a.teknisiId) return true;
                if (att.teknisiNama && a.teknisiNama && att.teknisiNama.toLowerCase().trim() === a.teknisiNama.toLowerCase().trim()) return true;
                const k1 = getNormalizedTechKey(att.teknisiId, att.teknisiNama);
                const k2 = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
                return Boolean(k1 && k2 && k1 === k2);
              };

              // Ambil jam pulang dan foto pulang yang valid dari rekaman ini atau rekaman presensi lain pada hari yang sama
              const isPastRecordDate = cleanTgl < todayStr;
              const resolvedJamPulang = (a.jamPulang && a.jamPulang !== '-' && !/^(belum|pending)/i.test(a.jamPulang.trim()))
                ? (sanitizeTimeString(a.jamPulang, '') || a.jamPulang)
                : (attendance.find(att => isSameTechRecord(att) && att.jamPulang && att.jamPulang !== '-' && !/^(belum|pending)/i.test(att.jamPulang.trim()))?.jamPulang || (hasPulang || isPastRecordDate ? '17:00' : undefined));

              const resolvedFotoPulang = (isValidPhotoUrl(a.fotoPulangUrl) ? a.fotoPulangUrl : undefined) ||
                attendance.find(att => isSameTechRecord(att) && isValidPhotoUrl(att.fotoPulangUrl) && !att.fotoPulangUrl?.startsWith('[Foto Masuk'))?.fotoPulangUrl;

              const isManualAbsen = Boolean(
                a.isManual ||
                a.id?.startsWith('att-manual-') ||
                a.keterangan?.includes('[Absen Manual Admin]') ||
                a.keterangan?.toLowerCase().includes('absen manual') ||
                a.keterangan?.toLowerCase().includes('manual oleh admin') ||
                a.keteranganPulang?.toLowerCase().includes('manual') ||
                a.keteranganPulang?.toLowerCase().includes('admin') ||
                (!a.fotoProofUrl && !resolvedFotoPulang && (a.isApproved || a.status === 'Hadir'))
              );

              // Deteksi keterlambatan berdasarkan jam masuk & batas toleransi sistem
              const appSettings = StorageService.getSettings();
              const stdMasuk = sanitizeTimeString(appSettings?.jamMasukDefinisikan, '08:00');
              const toleransi = Number(appSettings?.toleransiKeterlambatanMenit ?? 15);
              const [stdH, stdM] = stdMasuk.split(':').map(Number);
              const maxOnTimeMinutes = (stdH || 8) * 60 + (stdM || 0) + toleransi;
              let isLateCheckIn = false;
              if (a.jamMasuk && a.jamMasuk !== '-' && a.jamMasuk.includes(':')) {
                const [inH, inM] = a.jamMasuk.split(':').map(Number);
                if ((inH || 0) * 60 + (inM || 0) > maxOnTimeMinutes) {
                  isLateCheckIn = true;
                }
              }

              // PENTING: Teknisi yang absen terlambat WAJIB approval Admin sebelum honor dihitung
              const isPendingApproval = Boolean(
                !isManualAbsen && (
                  a.needsApproval ||
                  a.status === 'Pending Approval' ||
                  a.status === 'Terlambat' ||
                  (isLateCheckIn && a.isApproved !== true)
                )
              );

              const isTechOnline = activeOnlineTechnicians.some(
                t => t.id === a.teknisiId || (t.namaLengkap && a.teknisiNama && t.namaLengkap.toLowerCase().trim() === a.teknisiNama.toLowerCase().trim())
              );

              return (
                <div
                  key={a.id}
                  className={`bg-white border rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                    isPendingApproval
                      ? 'border-rose-300 bg-rose-50/15'
                      : (hasPulang || isManualAbsen
                          ? 'border-emerald-200/90'
                          : 'border-amber-300 bg-amber-50/10')
                  }`}
                >
                  {/* Card Header: Technician Name, Server, Status */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm">
                            {a.teknisiNama.charAt(0)}
                          </div>
                          {isTechOnline && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"
                              title="Teknisi sedang membuka aplikasi (Online)"
                            />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-slate-900 text-sm leading-tight">
                              {a.teknisiNama}
                            </h4>
                            {isTechOnline && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                                Online
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[11px] text-slate-500 font-medium">
                              Server {getDisplayServerName(a.serverNama, a.serverId, a.teknisiId, a.teknisiNama)}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-500">
                              {a.tanggal === todayStr ? 'Hari Ini' : a.tanggal}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1">
                        {isPendingApproval ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full border border-rose-200 animate-pulse">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            {isLateCheckIn ? 'Terlambat (Wajib Approval)' : 'Perlu Approval'}
                          </span>
                        ) : hasPulang ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Sudah Pulang
                          </span>
                        ) : isManualAbsen ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                            <UserCheck className="w-3 h-3 text-emerald-600" />
                            Absen Manual
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-full animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Sedang Bertugas
                          </span>
                        )}

                        {isPendingApproval ? (
                          <span className="text-[9px] bg-rose-50 text-rose-700 font-extrabold px-1.5 py-0.5 rounded border border-rose-200">
                            Menunggu Persetujuan Admin
                          </span>
                        ) : a.status === 'Terlambat' ? (
                          <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                            Terlambat
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Dual Selfie Compartments: Masuk & Pulang */}
                    <div className="grid grid-cols-2 gap-2.5 my-2">
                      {/* Box 1: Absen Masuk */}
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 flex flex-col">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <LogIn className="w-3 h-3 text-emerald-600" />
                            Masuk
                          </span>
                          <span className="text-[10px] font-extrabold text-slate-900 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            {a.jamMasuk || '-'} WIB
                          </span>
                        </div>

                        {isValidPhotoUrl(a.fotoProofUrl) ? (
                          <div className="relative w-full h-32 bg-slate-900 rounded-lg overflow-hidden group">
                            <SafeImage
                              src={a.fotoProofUrl}
                              alt={`Foto Masuk ${a.teknisiNama}`}
                              className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
                              fallbackText="Selfie Masuk"
                              isThumbnail={true}
                              onClick={() =>
                                setPhotoModalData({
                                  url: a.fotoProofUrl || '',
                                  title: `Foto Selfie Absen Masuk - ${a.teknisiNama}`,
                                  subtitle: `Pukul ${a.jamMasuk || '-'} WIB • ${a.tanggal || ''} • Server ${getDisplayServerName(a.serverNama, a.serverId, a.teknisiId, a.teknisiNama)}`
                                })
                              }
                            />
                            <div
                              onClick={() =>
                                setPhotoModalData({
                                  url: a.fotoProofUrl || '',
                                  title: `Foto Selfie Absen Masuk - ${a.teknisiNama}`,
                                  subtitle: `Pukul ${a.jamMasuk || '-'} WIB • ${a.tanggal || ''} • Server ${getDisplayServerName(a.serverNama, a.serverId, a.teknisiId, a.teknisiNama)}`
                                })
                              }
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-xs font-bold gap-1"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Perbesar</span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-32 rounded-lg border border-slate-200 bg-white flex flex-col items-center justify-center p-2 text-center">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 mb-1.5 shadow-2xs">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-slate-800 leading-tight">
                              Absen Manual
                            </p>
                            <p className="text-[9px] text-slate-500 mt-0.5">
                              Masuk pukul {a.jamMasuk || '-'} WIB
                            </p>
                            <span className="text-[9px] text-slate-600 font-medium mt-1 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              Diverifikasi Admin
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Box 2: Absen Pulang */}
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 flex flex-col">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                          <span className="inline-flex items-center gap-1 text-blue-700">
                            <LogOut className="w-3 h-3 text-blue-600" />
                            Pulang
                          </span>
                          <span className="text-[10px] font-extrabold text-slate-900 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            {hasPulang ? `${resolvedJamPulang || '17:00'} WIB` : (isManualAbsen ? 'Manual' : '-')}
                          </span>
                        </div>

                        {hasPulang && isValidPhotoUrl(resolvedFotoPulang) ? (
                          <div className="relative w-full h-32 bg-slate-900 rounded-lg overflow-hidden group">
                            <SafeImage
                              src={resolvedFotoPulang}
                              alt={`Foto Pulang ${a.teknisiNama}`}
                              className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
                              fallbackText="Selfie Pulang"
                              isThumbnail={true}
                              onClick={() =>
                                setPhotoModalData({
                                  url: resolvedFotoPulang || '',
                                  title: `Foto Selfie Absen Pulang - ${a.teknisiNama}`,
                                  subtitle: `Pukul ${resolvedJamPulang || '17:00'} WIB • ${cleanTgl} • Server ${getDisplayServerName(a.serverNama, a.serverId, a.teknisiId, a.teknisiNama)}`
                                })
                              }
                            />
                            <div
                              onClick={() =>
                                setPhotoModalData({
                                  url: resolvedFotoPulang || '',
                                  title: `Foto Selfie Absen Pulang - ${a.teknisiNama}`,
                                  subtitle: `Pukul ${resolvedJamPulang || '17:00'} WIB • ${cleanTgl} • Server ${getDisplayServerName(a.serverNama, a.serverId, a.teknisiId, a.teknisiNama)}`
                                })
                              }
                              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-xs font-bold gap-1"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Perbesar</span>
                            </div>
                          </div>
                        ) : hasPulang ? (
                          <div className="w-full h-32 rounded-lg border border-emerald-200 bg-emerald-50/60 flex flex-col items-center justify-center p-2 text-center">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-1.5 shadow-2xs">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-emerald-900 leading-tight">
                              Sudah Absen Pulang
                            </p>
                            <p className="text-[9px] text-emerald-700 mt-0.5">
                              Pulang pukul {resolvedJamPulang || '17:00'} WIB
                            </p>
                            <span className="text-[9px] text-emerald-800 font-medium mt-1 bg-white/80 px-2 py-0.5 rounded-full border border-emerald-200">
                              Tercatat Sistem
                            </span>
                          </div>
                        ) : isManualAbsen ? (
                          <div className="w-full h-32 rounded-lg border border-emerald-200 bg-emerald-50/60 flex flex-col items-center justify-center p-2 text-center">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-1.5 shadow-2xs">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-emerald-900 leading-tight">
                              Absen Manual
                            </p>
                            <p className="text-[9px] text-emerald-700 mt-0.5">
                              {a.keteranganPulang && a.keteranganPulang !== '-'
                                ? a.keteranganPulang
                                : 'Absen manual disetujui Admin'}
                            </p>
                            <span className="text-[9px] text-emerald-800 font-medium mt-1 bg-white/80 px-2 py-0.5 rounded-full border border-emerald-200">
                              Diverifikasi Admin
                            </span>
                          </div>
                        ) : (
                          <div className="w-full h-32 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 flex flex-col items-center justify-center p-2 text-center">
                            <Clock className="w-5 h-5 text-amber-500 mb-1 animate-pulse" />
                            <p className="text-[11px] font-bold text-amber-900 leading-tight">
                              Belum Absen Pulang
                            </p>
                            <p className="text-[9px] text-amber-700 mt-0.5 mb-2">
                              Teknisi sedang di lapangan
                            </p>
                            {onUpdateAttendance && (
                              <button
                                onClick={() => setEditingPresensiRecord(a)}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                              >
                                <Clock className="w-3 h-3" />
                                <span>Input Jam Pulang</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Location & GPS Radius Info */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                      <div className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {a.distanceMeter !== undefined
                            ? `${a.distanceMeter}m dari koordinat server`
                            : 'Koordinat GPS tersimpan'}
                        </span>
                      </div>
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded text-[9px] shrink-0 ${
                          a.isWithinRadius
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {a.isWithinRadius ? '✓ Dalam Radius' : '⚠ Luar Radius'}
                      </span>
                    </div>

                    {/* Notes / Keterangan */}
                    {a.keterangan && (
                      <p className="text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded-lg mt-1.5 border border-slate-100 leading-tight">
                        <span className="font-semibold text-slate-700">Masuk:</span> {a.keterangan}
                      </p>
                    )}
                    {a.keteranganPulang && (
                      <p className="text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded-lg mt-1 border border-slate-100 leading-tight">
                        <span className="font-semibold text-slate-700">Pulang:</span> {a.keteranganPulang}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom: Admin Action to Edit Jam Pulang */}
                  {onUpdateAttendance && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-medium">
                        {isManualAbsen
                          ? 'Absen manual terverifikasi'
                          : (hasPulang ? 'Absen pulang tercatat' : 'Belum absen pulang')}
                      </span>
                      <button
                        onClick={() => setEditingPresensiRecord(a)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          hasPulang || isManualAbsen
                            ? 'text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                            : 'text-white bg-amber-600 hover:bg-amber-700 shadow-xs'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{hasPulang || isManualAbsen ? 'Edit Jam Pulang' : 'Input Jam Pulang'}</span>
                      </button>
                    </div>
                  )}

                  {/* Card Bottom CTA (if needs approval) */}
                  {(isPendingApproval || a.needsApproval || a.status === 'Pending Approval') && (
                    <div className="mt-2.5 pt-2 border-t border-rose-100 flex items-center justify-between bg-rose-50/80 p-2.5 rounded-xl border border-rose-200">
                      <div className="flex items-center gap-1.5 text-rose-800 font-bold text-[10px]">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{isLateCheckIn ? 'Absen Terlambat: Wajib Approval Admin' : 'Memerlukan Persetujuan Admin'}</span>
                      </div>
                      <button
                        onClick={onNavigateApproval}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer shadow-xs flex items-center gap-1"
                      >
                        <span>Tinjau & Setujui</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Grid: Realtime Jobs + Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Left Column: Realtime 20 Latest Pekerjaan */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Layers className="w-4 h-4 text-maroon-800" />
                <span>
                  20 Pekerjaan Terakhir (Real-time)
                  {isPjServer && userServer ? ` - Server ${userServer.namaServer}` : ''}
                </span>
              </h3>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
              <input
                type="text"
                placeholder="Cari pekerjaan / teknisi..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
              />
            </div>
          </div>

          {/* Jobs List */}
          <div className="space-y-2 flex-1 overflow-y-auto max-h-[480px] pr-1">
            {filteredJobs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Belum ada data pekerjaan yang cocok.
              </div>
            ) : (
              filteredJobs.map(job => (
                <div
                  key={job.id}
                  className="p-2.5 sm:p-3 bg-slate-50 hover:bg-maroon-50/40 border border-slate-100 rounded-lg sm:rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* 1. Nama Teknisi */}
                    <p className="text-xs text-slate-700">
                      <span>Teknisi: </span>
                      <strong className="text-slate-900 font-extrabold">
                        {Array.isArray(job.teknisiNamas) && job.teknisiNamas.length > 0
                          ? job.teknisiNamas.join(', ')
                          : 'Teknisi'}
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

                    {/* 4. Informasi Tambahan: Tanggal, Server, Titik: X | Kabel: Y m */}
                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 pt-0.5 flex-wrap gap-y-1">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{job.tanggal}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-emerald-500" />
                        <span>
                          {servers.find(s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer)?.namaServer || (job.namaServer && !job.namaServer.startsWith('srv-') ? job.namaServer : 'Server')}
                        </span>
                      </span>
                      <span>Titik: {job.jumlahTitik} | Kabel: {job.panjangKabelMeter}m</span>
                    </div>
                  </div>

                  {/* 5. Nominal Honor per Teknisi & tombol bukti foto di sisi kanan */}
                  <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] text-slate-400 font-medium">Honor per Teknisi</p>
                      <p className="text-xs sm:text-sm font-black text-maroon-800">
                        {formatRupiah(job.honorPerTeknisi)}
                      </p>
                    </div>

                    {job.buktiFotoUrl && (
                      <button
                        onClick={() =>
                          setPhotoModalData({
                            url: job.buktiFotoUrls?.[0] || job.buktiFotoUrl || '',
                            title: `Bukti Foto - ${job.jenisPekerjaanNama}`,
                            subtitle: `${job.subPekerjaanNama} • ${job.tanggal} • Server ${job.namaServer}`
                          })
                        }
                        className="p-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg shadow-2xs cursor-pointer active:scale-95"
                        title="Lihat Bukti Foto Pekerjaan"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <button
              onClick={onNavigateJobs}
              className="text-xs font-bold text-maroon-800 hover:text-maroon-900 flex items-center justify-center space-x-1 mx-auto cursor-pointer"
            >
              <span>Lihat Semua Daftar Pekerjaan</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Honor Calculator */}
        <div>
          <HonorCalculator
            jenisList={jenisList}
            wilayahList={wilayahList}
          />
        </div>
      </div>

      {/* Modal View Photo / Lightbox */}
      {(photoModalData || selectedPhoto) && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            setPhotoModalData(null);
            setSelectedPhoto(null);
          }}
        >
          <div
            className="bg-white p-4 rounded-2xl max-w-lg w-full relative shadow-2xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {photoModalData?.title || 'Bukti Foto'}
                </h4>
                {photoModalData?.subtitle && (
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    {photoModalData.subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setPhotoModalData(null);
                  setSelectedPhoto(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex items-center justify-center bg-slate-950 rounded-xl min-h-[240px]">
              <SafeImage
                src={photoModalData?.url || selectedPhoto || ''}
                alt="Foto Preview"
                className="w-full h-auto max-h-[65vh] object-contain rounded-xl"
                fallbackText="Foto Tidak Tersedia"
                showOpenLink={true}
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
              <span className="text-[11px] text-slate-400">
                Tekan tombol di atas untuk membuka di Google Drive
              </span>
              <button
                onClick={() => {
                  setPhotoModalData(null);
                  setSelectedPhoto(null);
                }}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Input Jam Pulang Modal */}
      {editingPresensiRecord && (
        <EditPresensiModal
          isOpen={!!editingPresensiRecord}
          record={editingPresensiRecord}
          onClose={() => setEditingPresensiRecord(null)}
          onSave={async (rec) => {
            if (onUpdateAttendance) {
              await onUpdateAttendance(rec);
            }
            setEditingPresensiRecord(null);
          }}
        />
      )}
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = React.memo(DashboardViewComponent);
