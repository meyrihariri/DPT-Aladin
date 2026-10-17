import React, { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  FileSpreadsheet,
  Plus,
  Eye,
  Trash2,
  Server,
  Users,
  Calendar,
  X,
  ArrowRight,
  Printer,
  Camera,
  Image as ImageIcon,
  Pencil,
  Loader2,
  Filter,
  RotateCcw,
  CheckCircle,
  Clock,
  Check,
  FileDown,
  ShieldCheck,
  Bell,
  MessageSquare,
  Send,
  Smartphone,
  ExternalLink,
  Search,
  MapPin,
  FileText,
  Activity,
  LayoutGrid,
  List,
  Layers,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Sparkles,
  TrendingUp,
  SlidersHorizontal,
  User,
  Maximize2,
  Phone
} from 'lucide-react';
import {
  JobRecord,
  PlanningTask,
  Employee,
  ServerData,
  JenisPekerjaan,
  WilayahPekerjaan,
  VehicleType,
  AttendanceRecord,
  AppSettings,
  HonorLunasRecord
} from '../types';
import { formatRupiah, calculatePayrollForEmployee } from '../services/payroll';
import { JobModal } from '../components/JobModal';
import { SafeImage } from '../components/SafeImage';
import { generateJobHonorPdfReport } from '../utils/generatePdfReport';
import { NotificationService, NotificationDeliveryResult } from '../services/notificationService';
import { showAppAlert, showAppConfirm } from '../utils/dialogService';
import { sortJenisPekerjaan, StorageService } from '../services/storage';
import { getEffectiveTodayISO } from '../services/googleSheetsHelper';

export type PekerjaanSubTab = 'daftar' | 'planning';

interface MasterPekerjaanViewProps {
  initialTab?: PekerjaanSubTab;
  jobs: JobRecord[];
  planningTasks: PlanningTask[];
  employees: Employee[];
  servers: ServerData[];
  jenisList: JenisPekerjaan[];
  wilayahList?: WilayahPekerjaan[];
  onSaveJob: (job: JobRecord) => Promise<{ success: boolean; message?: string } | void> | void;
  onApproveLembur?: (jobId: string, isApproved: boolean) => Promise<{ success: boolean; message?: string }>;
  onDeleteJob: (id: string) => void;
  onSavePlanning: (plan: PlanningTask) => void;
  onDeletePlanning: (id: string) => void;
  currentUser: Employee | null;
  googleAppsScriptUrl?: string;
  attendanceList?: AttendanceRecord[];
  settings?: AppSettings;
  honorLunasList?: HonorLunasRecord[];
}

const MasterPekerjaanViewComponent: React.FC<MasterPekerjaanViewProps> = ({
  initialTab = 'daftar',
  jobs,
  planningTasks,
  employees,
  servers,
  jenisList,
  wilayahList = [],
  onSaveJob,
  onApproveLembur,
  onDeleteJob,
  onSavePlanning,
  onDeletePlanning,
  currentUser,
  googleAppsScriptUrl,
  attendanceList = [],
  settings,
  honorLunasList = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<PekerjaanSubTab>(initialTab);

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  const [syncingLemburJobId, setSyncingLemburJobId] = useState<string | null>(null);
  const [lemburToast, setLemburToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const pendingAccCount = useMemo(() => jobs.filter(j => j.adaLembur && !j.lemburApproved).length, [jobs]);
  const approvedAccCount = useMemo(() => jobs.filter(j => j.adaLembur && Boolean(j.lemburApproved)).length, [jobs]);

  const handleToggleLemburAcc = async (job: JobRecord) => {
    if (syncingLemburJobId === job.id) return;
    setSyncingLemburJobId(job.id);
    const targetApproval = !job.lemburApproved;

    try {
      if (onApproveLembur) {
        const res = await onApproveLembur(job.id, targetApproval);
        setLemburToast({
          type: res.success ? 'success' : 'error',
          message: res.message || (targetApproval ? 'Lembur berhasil disetujui & dikonfirmasi ke Google Sheets!' : 'Persetujuan lembur dibatalkan.')
        });
      } else {
        onSaveJob({
          ...job,
          lemburApproved: targetApproval,
          lemburApprovedBy: targetApproval ? currentUser?.namaLengkap || 'Admin' : undefined,
          lemburApprovedAt: targetApproval ? new Date().toISOString() : undefined
        });
        setLemburToast({
          type: 'success',
          message: targetApproval ? 'Lembur berhasil disetujui & disimpan!' : 'Persetujuan lembur dibatalkan.'
        });
      }
    } catch (err: any) {
      setLemburToast({
        type: 'error',
        message: err?.message || 'Gagal memperbarui status lembur.'
      });
    } finally {
      setSyncingLemburJobId(null);
      setTimeout(() => {
        setLemburToast(null);
      }, 5000);
    }
  };

  // Modals
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobRecord | null>(null);
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState(false);
  const [selectedJobPhotosModal, setSelectedJobPhotosModal] = useState<{
    title: string;
    photos: string[];
  } | null>(null);

  const handleOpenNewJobModal = () => {
    setEditingJob(null);
    setIsJobModalOpen(true);
  };

  const handleEditJob = (job: JobRecord) => {
    setEditingJob(job);
    setIsJobModalOpen(true);
  };

  // Helper to format local date YYYY-MM-DD reliably without UTC offset shift
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const isPjServer = currentUser?.role === 'Penanggungjawab Server';
  const isTeknisi = currentUser?.role === 'Teknisi';

  // Helper to determine if a job honor has been settled (Lunas / Belum Lunas)
  const isJobHonorLunas = (job: JobRecord) => {
    if (job.isHonorLunas) return true;
    if (honorLunasList && honorLunasList.length > 0) {
      if (isTeknisi && currentUser) {
        return honorLunasList.some(
          hl =>
            (hl.teknisiId === currentUser.id ||
              (hl.teknisiNama &&
                currentUser.namaLengkap &&
                hl.teknisiNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim())) &&
            hl.jobIds?.includes(job.id)
        );
      }
      return honorLunasList.some(hl => hl.jobIds?.includes(job.id));
    }
    return false;
  };

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

  // Filter States for Daftar Pekerjaan (Default: Tanggal 1 Bulan Berjalan s/d Tanggal Terakhir Bulan Berjalan)
  const [filterStartDate, setFilterStartDate] = useState<string>(() => {
    const now = new Date();
    return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [filterEndDate, setFilterEndDate] = useState<string>(() => {
    const now = new Date();
    return formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  });
  const [filterServerId, setFilterServerId] = useState<string>(() => {
    if (isPjServer && userServer) return userServer.id;
    return 'all';
  });
  const [filterTeknisiId, setFilterTeknisiId] = useState<string>('all');
  const [filterLemburStatus, setFilterLemburStatus] = useState<'all' | 'menunggu_acc' | 'disetujui' | 'tanpa_lembur'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isPjServer && userServer) {
      setFilterServerId(userServer.id);
    }
  }, [isPjServer, userServer]);

  // Alphabetically sorted dropdown lists (only technicians for technician filters and planning)
  const sortedServers = useMemo(
    () => [...servers].sort((a, b) => a.namaServer.localeCompare(b.namaServer, 'id', { sensitivity: 'base' })),
    [servers]
  );
  const sortedEmployees = useMemo(
    () => [...employees].filter(e => e.role === 'Teknisi').sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, 'id', { sensitivity: 'base' })),
    [employees]
  );

  const availablePlanningServers = useMemo(() => {
    if (isPjServer && userServer) {
      return [userServer];
    }
    return sortedServers;
  }, [isPjServer, userServer, sortedServers]);

  const groupedJenisOptions = useMemo(() => {
    const sorted = sortJenisPekerjaan(jenisList);
    const groups: { [key: string]: JenisPekerjaan[] } = {};
    sorted.forEach(item => {
      const g = item.jenisPekerjaan || 'Lainnya';
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    });
    return Object.entries(groups);
  }, [jenisList]);

  const displayedPlanningTasks = useMemo(() => {
    if (!isPjServer || !userServer) return planningTasks;
    return planningTasks.filter(
      plan =>
        plan.serverId === userServer.id ||
        plan.namaServer === userServer.namaServer ||
        plan.namaServer === userServer.id ||
        plan.createdById === currentUser?.id
    );
  }, [planningTasks, isPjServer, userServer, currentUser]);

  // State untuk Filter, Pencarian, Tampilan, dan Paginasi Planning Pekerjaan
  const [planningSearchQuery, setPlanningSearchQuery] = useState<string>('');
  const [planningStatusFilter, setPlanningStatusFilter] = useState<string>('all');
  const [planningServerFilter, setPlanningServerFilter] = useState<string>('all');
  const [planningViewMode, setPlanningViewMode] = useState<'table' | 'cards'>('table');
  const [planningCurrentPage, setPlanningCurrentPage] = useState<number>(1);
  const [planningPageSize, setPlanningPageSize] = useState<number>(25);

  // Filtered Planning Tasks
  const filteredPlanningTasks = useMemo(() => {
    return displayedPlanningTasks.filter(plan => {
      // Status filter
      if (planningStatusFilter !== 'all' && plan.status !== planningStatusFilter) {
        return false;
      }
      // Server filter
      if (planningServerFilter !== 'all') {
        const matchServer =
          plan.serverId === planningServerFilter ||
          plan.namaServer === planningServerFilter ||
          (servers.find(s => s.id === planningServerFilter)?.namaServer === plan.namaServer);
        if (!matchServer) return false;
      }
      // Search query
      if (planningSearchQuery.trim()) {
        const q = planningSearchQuery.toLowerCase().trim();
        const mSub = (plan.subPekerjaanNama || '').toLowerCase().includes(q);
        const mDetail = (plan.detailPekerjaan || '').toLowerCase().includes(q);
        const mKlien = (plan.namaKlien || '').toLowerCase().includes(q);
        const mAlamat = (plan.alamatKlien || '').toLowerCase().includes(q);
        const mSales = (plan.sales || '').toLowerCase().includes(q);
        const mOdp = (plan.detailOdp || '').toLowerCase().includes(q);
        const mTech = (plan.targetTeknisiNamas || []).some(t => t.toLowerCase().includes(q));
        const mServer = (plan.namaServer || '').toLowerCase().includes(q);
        const mTgl = (plan.tanggal || '').includes(q);
        const mReg = (plan.noRegistrasi || '').toLowerCase().includes(q);
        if (!mSub && !mDetail && !mKlien && !mAlamat && !mSales && !mOdp && !mTech && !mServer && !mTgl && !mReg) {
          return false;
        }
      }
      return true;
    });
  }, [displayedPlanningTasks, planningStatusFilter, planningServerFilter, planningSearchQuery, servers]);

  // Statistik Planning untuk Top KPI Cards
  const planningStats = useMemo(() => {
    const total = displayedPlanningTasks.length;
    const pending = displayedPlanningTasks.filter(p => p.status === 'Pending').length;
    const proses = displayedPlanningTasks.filter(p => p.status === 'Proses').length;
    const selesai = displayedPlanningTasks.filter(p => p.status === 'Selesai').length;
    return { total, pending, proses, selesai };
  }, [displayedPlanningTasks]);

  // Paginasi Planning
  const totalPlanningPages = Math.max(1, Math.ceil(filteredPlanningTasks.length / planningPageSize));
  const paginatedPlanningTasks = useMemo(() => {
    const start = (planningCurrentPage - 1) * planningPageSize;
    return filteredPlanningTasks.slice(start, start + planningPageSize);
  }, [filteredPlanningTasks, planningCurrentPage, planningPageSize]);

  // Reset pagination on filter change
  useEffect(() => {
    setPlanningCurrentPage(1);
  }, [planningSearchQuery, planningStatusFilter, planningServerFilter, planningPageSize]);

  const handleApplyDatePreset = (preset: 'hari_ini' | 'bulan_ini' | 'bulan_lalu' | 'semua') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (preset === 'hari_ini') {
      const today = formatLocalDate(now);
      setFilterStartDate(today);
      setFilterEndDate(today);
    } else if (preset === 'bulan_ini') {
      setFilterStartDate(formatLocalDate(new Date(y, m, 1)));
      setFilterEndDate(formatLocalDate(new Date(y, m + 1, 0)));
    } else if (preset === 'bulan_lalu') {
      setFilterStartDate(formatLocalDate(new Date(y, m - 1, 1)));
      setFilterEndDate(formatLocalDate(new Date(y, m, 0)));
    } else if (preset === 'semua') {
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  const handleResetFilters = () => {
    const now = new Date();
    setFilterStartDate(formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setFilterEndDate(formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    setFilterServerId(isPjServer && userServer ? userServer.id : 'all');
    setFilterTeknisiId('all');
    setFilterLemburStatus('all');
    setSearchQuery('');
  };

  // View mode & pagination states
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

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

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Khusus Teknisi: Hanya menampilkan Daftar Pekerjaan Teknisi yang bersangkutan
      if (isTeknisi && currentUser) {
        const matchesTeknisi =
          (job.teknisiIds && job.teknisiIds.includes(currentUser.id)) ||
          (job.teknisiNamas &&
            job.teknisiNamas.some(
              n => n.toLowerCase().trim() === (currentUser.namaLengkap || '').toLowerCase().trim()
            ));
        if (!matchesTeknisi) return false;
      }

      // Khusus PJ Server: Hanya menampilkan Daftar Pekerjaan Teknisi pada server yang bersangkutan
      if (isPjServer && userServer) {
        const matchesUserServer =
          job.serverId === userServer.id ||
          job.serverId === userServer.namaServer ||
          (job.namaServer && userServer.namaServer && job.namaServer.toLowerCase().trim() === userServer.namaServer.toLowerCase().trim());
        if (!matchesUserServer) return false;
      }

      const d = (job.tanggal || '').slice(0, 10);
      if (filterStartDate && d < filterStartDate) return false;
      if (filterEndDate && d > filterEndDate) return false;
      if (filterServerId !== 'all') {
        const s = servers.find(x => x.id === filterServerId);
        const matches = s
          ? (job.serverId === s.id || job.serverId === s.namaServer || (job.namaServer && job.namaServer.toLowerCase().trim() === s.namaServer.toLowerCase().trim()))
          : (job.serverId === filterServerId || (job.namaServer && job.namaServer.toLowerCase().trim() === filterServerId.toLowerCase().trim()));
        if (!matches) return false;
      }
      if (filterTeknisiId !== 'all' && !job.teknisiIds.includes(filterTeknisiId)) return false;
      if (filterLemburStatus === 'menunggu_acc') {
        return job.adaLembur && !job.lemburApproved;
      }
      if (filterLemburStatus === 'disetujui') {
        return job.adaLembur && Boolean(job.lemburApproved);
      }
      if (filterLemburStatus === 'tanpa_lembur') {
        return !job.adaLembur;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          (job.jenisPekerjaanNama || '').toLowerCase().includes(q) ||
          (job.subPekerjaanNama || '').toLowerCase().includes(q) ||
          (job.namaServer || '').toLowerCase().includes(q) ||
          (job.catatan || (job as any).keterangan || '').toLowerCase().includes(q) ||
          (job.namaKlien || '').toLowerCase().includes(q) ||
          (job.wilayahNamas || []).some(w => w.toLowerCase().includes(q)) ||
          (job.teknisiNamas || []).some(n => n.toLowerCase().includes(q)) ||
          (job.tanggal || '').includes(q);
        if (!matchesSearch) return false;
      }
      return true;
    }).sort((a, b) => {
      const cmp = (b.tanggal || '').localeCompare(a.tanggal || '');
      if (cmp !== 0) return cmp;
      const mA = String(a.id || '').match(/(\d+)/g);
      const mB = String(b.id || '').match(/(\d+)/g);
      const nA = mA && mA.length > 0 ? Number(mA[mA.length - 1]) || 0 : 0;
      const nB = mB && mB.length > 0 ? Number(mB[mB.length - 1]) || 0 : 0;
      return nB - nA;
    });
  }, [jobs, filterStartDate, filterEndDate, filterServerId, filterTeknisiId, filterLemburStatus, searchQuery, servers, isPjServer, userServer, isTeknisi, currentUser]);

  // Summary statistics for the currently filtered jobs
  const filterStats = useMemo(() => {
    let totalHonorAllTech = 0;
    let totalTitik = 0;
    let totalKabel = 0;
    let totalLemburCount = 0;
    let lemburMenungguAcc = 0;
    let lemburAcc = 0;
    let lunasCount = 0;
    let belumLunasCount = 0;

    filteredJobs.forEach(job => {
      const numTech = (job.teknisiIds && job.teknisiIds.length) || 1;
      totalHonorAllTech += (job.honorPerTeknisi || 0) * numTech;
      totalTitik += Number(job.jumlahTitik) || 0;
      totalKabel += Number(job.panjangKabelMeter) || 0;
      if (job.adaLembur) {
        totalLemburCount++;
        if (job.lemburApproved) {
          lemburAcc++;
        } else {
          lemburMenungguAcc++;
        }
      }
      if (isJobHonorLunas(job)) {
        lunasCount++;
      } else {
        belumLunasCount++;
      }
    });

    return {
      totalJobs: filteredJobs.length,
      totalHonorAllTech,
      totalTitik,
      totalKabel,
      totalLemburCount,
      lemburMenungguAcc,
      lemburAcc,
      lunasCount,
      belumLunasCount
    };
  }, [filteredJobs, honorLunasList, isTeknisi, currentUser]);

  // Reset pagination when filter criteria changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStartDate, filterEndDate, filterServerId, filterTeknisiId, filterLemburStatus, searchQuery]);

  const totalPages = pageSize > 0 ? Math.ceil(filteredJobs.length / pageSize) || 1 : 1;
  const paginatedJobs = useMemo(() => {
    if (pageSize <= 0) return filteredJobs;
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setPdfSuccessMessage(null);

      const eligibleEmployees = employees.filter(e => e.role === 'Teknisi');
      const payrollList = eligibleEmployees.map(emp =>
        calculatePayrollForEmployee(
          emp,
          servers,
          wilayahList,
          jenisList,
          filteredJobs,
          attendanceList,
          {
            startDate: filterStartDate || undefined,
            endDate: filterEndDate || undefined,
            serverId: filterServerId !== 'all' ? filterServerId : undefined
          }
        )
      );

      const serverName = filterServerId === 'all'
        ? 'Semua Server'
        : servers.find(s => s.id === filterServerId)?.namaServer || filterServerId;

      const techName = filterTeknisiId === 'all'
        ? 'Semua Teknisi'
        : employees.find(e => e.id === filterTeknisiId)?.namaLengkap || filterTeknisiId;

      const dateLabel = filterStartDate && filterEndDate
        ? `${filterStartDate} s/d ${filterEndDate}`
        : filterStartDate
        ? `Sejak ${filterStartDate}`
        : filterEndDate
        ? `Hingga ${filterEndDate}`
        : 'Semua Periode';

      await generateJobHonorPdfReport({
        jobs: filteredJobs,
        payrollList,
        settings,
        servers,
        employees,
        dateRange: {
          startDate: filterStartDate || '2025-01-01',
          endDate: filterEndDate || new Date().toISOString().slice(0, 10),
          label: dateLabel
        },
        filterServerId: filterServerId,
        filterServerName: serverName,
        filterTeknisiName: techName
      });

      setPdfSuccessMessage('Laporan PDF resmi dengan kop perusahaan berhasil diunduh!');
      setTimeout(() => setPdfSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error generating PDF report:', err);
      showAppAlert({
        title: 'Gagal Membuat Laporan PDF',
        message: 'Terjadi kesalahan saat memproses laporan PDF resmi.',
        type: 'error'
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Planning Form State
  const [planningForm, setPlanningForm] = useState<Partial<PlanningTask>>({
    tanggal: getEffectiveTodayISO(),
    targetTeknisiIds: [employees.find(e => e.role === 'Teknisi')?.id || employees[0]?.id || ''],
    serverId: isPjServer && userServer ? userServer.id : (servers[0]?.id || ''),
    jenisPekerjaanId: jenisList[0]?.id || '',
    detailPekerjaan: '',
    status: 'Pending',
    fotoLokasiUrl: '',
    namaKlien: '',
    alamatKlien: '',
    noWaKlien: '',
    sales: '',
    detailOdp: '',
    noRegistrasi: ''
  });

  // Auto-save draft for Planning tasks
  useEffect(() => {
    if (!isPlanningModalOpen || planningForm.id) return;
    const hasData = Boolean(
      planningForm.namaKlien ||
      planningForm.alamatKlien ||
      planningForm.detailPekerjaan ||
      planningForm.detailOdp ||
      planningForm.noWaKlien
    );
    if (hasData) {
      StorageService.savePlanningDraft(planningForm);
    }
  }, [isPlanningModalOpen, planningForm]);

  const handleRequestClosePlanning = async () => {
    const hasUnsaved = !planningForm.id && Boolean(
      planningForm.namaKlien ||
      planningForm.alamatKlien ||
      planningForm.detailPekerjaan ||
      planningForm.detailOdp
    );
    if (hasUnsaved) {
      const ok = await showAppConfirm({
        title: 'Tutup Form Planning?',
        message: 'Isian tugas planning otomatis disimpan sebagai draf dan dapat dilanjutkan kembali.\n\nApakah Anda yakin ingin menutup form?',
        type: 'warning',
        confirmText: 'Ya, Tutup',
        cancelText: 'Lanjutkan Input'
      });
      if (!ok) return;
    }
    setIsPlanningModalOpen(false);
  };

  const handleOpenPlanningModal = () => {
    const targetServer = (isPjServer && userServer) ? userServer : (servers[0] || null);
    const draft = StorageService.getPlanningDraft();

    setPlanningForm({
      tanggal: draft?.tanggal || getEffectiveTodayISO(),
      targetTeknisiIds: draft?.targetTeknisiIds || [employees.find(e => e.role === 'Teknisi')?.id || employees[0]?.id || ''],
      serverId: draft?.serverId || targetServer?.id || '',
      jenisPekerjaanId: draft?.jenisPekerjaanId || jenisList[0]?.id || '',
      detailPekerjaan: draft?.detailPekerjaan || '',
      status: 'Pending',
      fotoLokasiUrl: draft?.fotoLokasiUrl || '',
      namaKlien: draft?.namaKlien || '',
      alamatKlien: draft?.alamatKlien || '',
      noWaKlien: draft?.noWaKlien || '',
      sales: draft?.sales || (currentUser?.role !== 'Teknisi' ? currentUser?.namaLengkap || '' : ''),
      detailOdp: draft?.detailOdp || '',
      noRegistrasi: draft?.noRegistrasi || `REG-${Date.now().toString().slice(-6)}`
    });
    setIsPlanningModalOpen(true);
  };

  const handleEditPlanning = (plan: PlanningTask) => {
    setPlanningForm({
      id: plan.id,
      tanggal: plan.tanggal,
      targetTeknisiIds: plan.targetTeknisiIds || [],
      serverId: plan.serverId,
      namaServer: plan.namaServer,
      jenisPekerjaanId: plan.jenisPekerjaanId,
      detailPekerjaan: plan.detailPekerjaan,
      fotoLokasiUrl: plan.fotoLokasiUrl || '',
      status: plan.status || 'Pending',
      createdById: plan.createdById,
      namaKlien: plan.namaKlien || '',
      alamatKlien: plan.alamatKlien || '',
      noWaKlien: plan.noWaKlien || '',
      sales: plan.sales || '',
      detailOdp: plan.detailOdp || '',
      noRegistrasi: plan.noRegistrasi || '',
      inputBy: plan.inputBy || ''
    });
    setIsPlanningModalOpen(true);
  };

  // Notification delivery feedback state
  const [notificationFeedback, setNotificationFeedback] = useState<{
    plan: PlanningTask;
    results: NotificationDeliveryResult[];
  } | null>(null);
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  const handlePlanningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedJenis = jenisList.find(j => j.id === planningForm.jenisPekerjaanId) || jenisList[0];
    const selectedServer = (isPjServer && userServer)
      ? userServer
      : (servers.find(s => s.id === planningForm.serverId) || servers[0]);
    const techNamas = (planningForm.targetTeknisiIds || []).map(
      id => employees.find(e => e.id === id)?.namaLengkap || 'Teknisi'
    );

    const planToSave: PlanningTask = {
      id: planningForm.id || `plan-${Date.now()}`,
      tanggal: planningForm.tanggal || getEffectiveTodayISO(),
      targetTeknisiIds: planningForm.targetTeknisiIds || [],
      targetTeknisiNamas: techNamas,
      serverId: selectedServer.id,
      namaServer: selectedServer.namaServer,
      jenisPekerjaanId: selectedJenis.id,
      subPekerjaanNama: selectedJenis.subPekerjaan,
      detailPekerjaan: planningForm.detailPekerjaan || '',
      fotoLokasiUrl: planningForm.fotoLokasiUrl || '',
      status: (planningForm.status as any) || 'Pending',
      createdById: planningForm.createdById || currentUser?.id || 'admin',
      namaKlien: planningForm.namaKlien || '',
      alamatKlien: planningForm.alamatKlien || '',
      noWaKlien: planningForm.noWaKlien || '',
      sales: planningForm.sales || '',
      detailOdp: planningForm.detailOdp || '',
      noRegistrasi: planningForm.noRegistrasi || '',
      inputBy: planningForm.inputBy || currentUser?.namaLengkap || 'Admin',
      createdAt: planningForm.createdAt || new Date().toISOString()
    };

    onSavePlanning(planToSave);
    StorageService.clearPlanningDraft();
    setIsPlanningModalOpen(false);

    // Dispatch background push & WhatsApp notifications to technicians
    if (settings && settings.autoNotifyTechnicianOnPlanning !== false && !planningForm.id) {
      setIsSendingNotif(true);
      try {
        const results = await NotificationService.notifyTechniciansForPlanning(planToSave, employees, settings);
        setNotificationFeedback({ plan: planToSave, results });
      } catch (err) {
        console.error('Failed to notify technicians:', err);
      } finally {
        setIsSendingNotif(false);
      }
    }
  };

  const handleManualNotifyWhatsApp = async (plan: PlanningTask) => {
    if (!settings) return;
    setIsSendingNotif(true);
    try {
      const results = await NotificationService.notifyTechniciansForPlanning(plan, employees, settings);
      setNotificationFeedback({ plan, results });
    } catch (err) {
      console.error('Manual notification failed:', err);
    } finally {
      setIsSendingNotif(false);
    }
  };

  // Convert planning to completed job
  const handleConvertPlanningToJob = (plan: PlanningTask) => {
    const selectedServer = servers.find(s => s.id === plan.serverId) || servers[0];
    const selectedJenis = jenisList.find(j => j.id === plan.jenisPekerjaanId) || jenisList[0];
    const planJob: JobRecord = {
      id: `job-${Date.now()}`,
      tanggal: plan.tanggal || getEffectiveTodayISO(),
      teknisiIds: plan.targetTeknisiIds || [],
      teknisiNamas: plan.targetTeknisiNamas || [],
      teknisiVehicles: {},
      jenisPekerjaanId: selectedJenis?.id || plan.jenisPekerjaanId || '',
      jenisPekerjaanNama: selectedJenis?.jenisPekerjaan || '',
      subPekerjaanNama: selectedJenis?.subPekerjaan || plan.subPekerjaanNama || '',
      serverId: selectedServer?.id || plan.serverId || '',
      namaServer: selectedServer?.namaServer || plan.namaServer || '',
      jumlahTitik: selectedJenis?.butuhInputTitik ? 1 : 0,
      panjangKabelMeter: selectedJenis?.butuhPanjangKabel ? 50 : 0,
      adaLembur: false,
      menitLembur: 0,
      estimasiTotalHonor: selectedJenis?.tarifDasar || 0,
      honorPerTeknisi: selectedJenis?.tarifDasar || 0,
      buktiFotoUrls: plan.fotoLokasiUrl ? [plan.fotoLokasiUrl] : [],
      buktiFotoUrl: plan.fotoLokasiUrl || '',
      catatan: `Realisasi tugas planning: ${plan.detailPekerjaan} (Selesai)`
    };
    setEditingJob(planJob);
    setIsJobModalOpen(true);
  };

  const handleDeleteJobPrompt = async (jobId: string, clientOrJobName: string) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Catatan Pekerjaan?',
      message: `Apakah Anda yakin ingin menghapus catatan pekerjaan "${clientOrJobName}"? Rekapitulasi honor yang terkait akan ikut terhapus.`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });
    if (confirmed) {
      onDeleteJob(jobId);
    }
  };

  const handleDeletePlanningPrompt = async (planId: string, planDetail: string) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Planning Tugas?',
      message: `Apakah Anda yakin ingin menghapus planning "${planDetail}"?`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });
    if (confirmed) {
      onDeletePlanning(planId);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header Title (No Subtabs Bar - Single Sidebar Driven) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {isTeknisi
              ? `Daftar Pekerjaan Teknisi (${currentUser?.namaLengkap || 'Saya'})`
              : activeSubTab === 'daftar'
              ? 'Daftar Pekerjaan Teknisi'
              : 'Planning Pekerjaan'}
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          {activeSubTab === 'daftar' ? (
            <>
              {!isTeknisi && (
                <>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isGeneratingPdf || filteredJobs.length === 0}
                    className="px-3.5 py-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    title="Download Data Pekerjaan format PDF resmi dengan Kop Surat Perusahaan"
                  >
                    {isGeneratingPdf ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memproses PDF...</span>
                      </>
                    ) : (
                      <>
                        <FileDown className="w-4 h-4" />
                        <span>Download Laporan PDF</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Laporan</span>
                  </button>
                </>
              )}

              {currentUser?.role !== 'Teknisi' && (
                <button
                  onClick={handleOpenNewJobModal}
                  className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-md flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Input Pekerjaan Baru</span>
                </button>
              )}
            </>
          ) : (
            currentUser?.role !== 'Teknisi' && (
              <button
                onClick={handleOpenPlanningModal}
                className="px-4 py-2 bg-maroon-800 text-white font-bold text-xs rounded-xl hover:bg-maroon-900 shadow-md flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Planning Tugas Baru</span>
              </button>
            )
          )}
        </div>
      </div>

      {pdfSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center space-x-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{pdfSuccessMessage}</span>
        </div>
      )}

      {/* SUB TAB 1: DAFTAR PEKERJAAN TEKNISI - COMPACT & READABLE MODERN FORMAT */}
      {activeSubTab === 'daftar' && (
        <div className="space-y-4">
          {/* 1. TOP METRIC / STATS SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Pekerjaan */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {isTeknisi ? 'Pekerjaan Saya' : 'Total Pekerjaan'}
                </span>
                <div className="p-2 bg-maroon-50 text-maroon-800 rounded-xl">
                  <Briefcase className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {filterStats.totalJobs}
                </span>
                <span className="text-xs font-semibold text-slate-500">Pekerjaan</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {isTeknisi ? 'Sesuai rentang tanggal terpilih' : `Dari ${jobs.length} total pekerjaan terdata`}
              </p>
            </div>

            {/* Total Estimasi Honor / Status Pelunasan */}
            {isTeknisi ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status Honor
                  </span>
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span className="text-base sm:text-lg font-black text-emerald-700">
                    {filterStats.lunasCount} <span className="text-xs font-bold text-slate-500 font-normal">Lunas</span>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-base sm:text-lg font-black text-amber-600">
                    {filterStats.belumLunasCount} <span className="text-xs font-bold text-slate-500 font-normal">Belum</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 truncate">
                  Keterangan honor dilunaskan
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Estimasi Honor
                  </span>
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-lg sm:text-xl font-black text-emerald-700 tracking-tight">
                    {formatRupiah(filterStats.totalHonorAllTech)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 truncate">
                  Akumulasi seluruh teknisi
                </p>
              </div>
            )}

            {/* Volume Fisik */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-shadow">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Volume Terpasang
                </span>
                <div className="p-2 bg-sky-50 text-sky-700 rounded-xl">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-black text-slate-900">
                  {filterStats.totalTitik} <span className="text-xs font-bold text-slate-500 font-normal">Titik</span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-base sm:text-lg font-black text-slate-900">
                  {filterStats.totalKabel} <span className="text-xs font-bold text-slate-500 font-normal">meter</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                Total tarikan kabel &amp; titik
              </p>
            </div>

            {/* Status Lembur & Persetujuan / Estimasi Honor (untuk Teknisi) */}
            {isTeknisi ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Estimasi Honor
                  </span>
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-base sm:text-lg font-black text-indigo-700 tracking-tight">
                    {formatRupiah(filterStats.totalHonorAllTech)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 truncate">
                  Estimasi honor pekerjaan Anda
                </p>
              </div>
            ) : (
              <div
                onClick={() => {
                  if (filterStats.lemburMenungguAcc > 0) {
                    setFilterLemburStatus('menunggu_acc');
                  }
                }}
                className={`bg-white border rounded-2xl p-3.5 sm:p-4 shadow-2xs transition-all ${
                  filterStats.lemburMenungguAcc > 0
                    ? 'border-amber-300 bg-amber-50/30 cursor-pointer hover:bg-amber-50/60'
                    : 'border-slate-200/90 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status Lembur
                  </span>
                  <div className={`p-2 rounded-xl ${filterStats.lemburMenungguAcc > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span className="text-base sm:text-lg font-black text-emerald-700">
                    {filterStats.lemburAcc} <span className="text-xs font-bold text-slate-500 font-normal">ACC</span>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className={`text-base sm:text-lg font-black ${filterStats.lemburMenungguAcc > 0 ? 'text-amber-700' : 'text-slate-600'}`}>
                    {filterStats.lemburMenungguAcc} <span className="text-xs font-bold text-slate-500 font-normal">Menunggu</span>
                  </span>
                </div>
                <p className={`text-[11px] mt-1 truncate font-semibold ${filterStats.lemburMenungguAcc > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {filterStats.lemburMenungguAcc > 0 ? '⚠️ Klik untuk tinjau ACC lembur' : 'Semua lembur telah diproses'}
                </p>
              </div>
            )}
          </div>

          {/* Toast / Notification Banner for Overtime Approval */}
          {lemburToast && (
            <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between border shadow-2xs animate-in fade-in duration-200 ${
              lemburToast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}>
              <div className="flex items-center space-x-2">
                {lemburToast.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{lemburToast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setLemburToast(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                title="Tutup"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Pending Overtime Alert for Admin */}
          {currentUser?.role === 'Admin' && pendingAccCount > 0 && filterLemburStatus !== 'menunggu_acc' && (
            <div className="px-4 py-3 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-amber-900 shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-amber-200/80 rounded-lg text-amber-800 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <span>
                  Terdapat <strong>{pendingAccCount}</strong> pekerjaan dengan lembur menunggu persetujuan (ACC) Admin.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFilterLemburStatus('menunggu_acc')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs self-start sm:self-auto"
              >
                Tinjau Lembur Sekarang →
              </button>
            </div>
          )}

          {/* 2. FILTER & SEARCH CONTROL PANEL */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            {/* Top Filter Row: Search Bar, Quick Date Presets & View Switcher */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[260px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari pekerjaan, klien, teknisi, server, catatan..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-maroon-800 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-maroon-800/20 transition-all shadow-2xs"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                    title="Hapus pencarian"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Date Presets & View Controls */}
              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 text-xs">
                {/* Date Presets */}
                <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleApplyDatePreset('bulan_ini')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      filterStartDate === formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) &&
                      filterEndDate === formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
                        ? 'bg-white text-maroon-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bulan Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyDatePreset('hari_ini')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      filterStartDate === formatLocalDate(new Date()) && filterEndDate === formatLocalDate(new Date())
                        ? 'bg-white text-maroon-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyDatePreset('bulan_lalu')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      filterStartDate === formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)) &&
                      filterEndDate === formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 0))
                        ? 'bg-white text-maroon-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Bulan Lalu
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyDatePreset('semua')}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      !filterStartDate && !filterEndDate
                        ? 'bg-white text-maroon-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua
                  </button>
                </div>

                {/* Reset Filter Button */}
                {(filterStartDate || filterEndDate || filterServerId !== 'all' || filterTeknisiId !== 'all' || filterLemburStatus !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200/80 rounded-xl font-bold text-[11px] flex items-center space-x-1 transition-all cursor-pointer"
                    title="Reset Semua Filter"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}

                {/* View Switcher: Table vs Cards */}
                <div className="flex items-center bg-slate-100/90 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'table' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Tampilan Tabel"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      viewMode === 'cards' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Tampilan Kartu"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Granular Filters Grid: Rentang Tanggal, Server, & Teknisi */}
            <div className={`grid ${isTeknisi ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'} gap-3 text-xs pt-1`}>
              {/* Dari Tanggal */}
              <div>
                <label className="block text-slate-600 text-[11px] font-bold mb-1 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-maroon-800" />
                  <span>Dari Tanggal</span>
                </label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-maroon-800 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-maroon-800/20 transition-all shadow-2xs"
                />
              </div>

              {/* Sampai Tanggal */}
              <div>
                <label className="block text-slate-600 text-[11px] font-bold mb-1 flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-maroon-800" />
                  <span>Sampai Tanggal</span>
                </label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-maroon-800 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-maroon-800/20 transition-all shadow-2xs"
                />
              </div>

              {/* Filter Server */}
              <div>
                <label className="block text-slate-600 text-[11px] font-bold mb-1 flex items-center space-x-1.5">
                  <Server className="w-3.5 h-3.5 text-maroon-800" />
                  <span>Server Pengerjaan</span>
                </label>
                {isPjServer ? (
                  <div className="w-full p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-900 flex items-center justify-between shadow-2xs">
                    <span className="truncate">{userServer ? `Server ${userServer.namaServer}` : 'Server Anda'}</span>
                    <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full font-bold shrink-0">Server Anda</span>
                  </div>
                ) : (
                  <select
                    value={filterServerId}
                    onChange={e => setFilterServerId(e.target.value)}
                    className="w-full p-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-maroon-800 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-maroon-800/20 transition-all shadow-2xs"
                  >
                    <option value="all">Semua Server ({servers.length})</option>
                    {sortedServers.map(srv => (
                      <option key={srv.id} value={srv.id}>
                        {srv.namaServer}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Filter Teknisi */}
              {!isTeknisi && (
                <div>
                  <label className="block text-slate-600 text-[11px] font-bold mb-1 flex items-center space-x-1.5">
                    <Users className="w-3.5 h-3.5 text-maroon-800" />
                    <span>Teknisi Lapangan</span>
                  </label>
                  <select
                    value={filterTeknisiId}
                    onChange={e => setFilterTeknisiId(e.target.value)}
                    className="w-full p-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-maroon-800 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-maroon-800/20 transition-all shadow-2xs"
                  >
                    <option value="all">Semua Teknisi</option>
                    {sortedEmployees
                      .filter(e => e.role === 'Teknisi' || e.role === 'Penanggungjawab Server' || e.role === 'Admin')
                      .map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.namaLengkap} ({emp.role})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Bottom Status Lembur Pills & Items per Page */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400 font-bold text-[10px] uppercase mr-1">Status Lembur:</span>
                <button
                  type="button"
                  onClick={() => setFilterLemburStatus('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                    filterLemburStatus === 'all'
                      ? 'bg-slate-800 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setFilterLemburStatus('menunggu_acc')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center space-x-1.5 ${
                    filterLemburStatus === 'menunggu_acc'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  <span>⏳ Menunggu ACC</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    filterLemburStatus === 'menunggu_acc' ? 'bg-amber-700 text-white' : 'bg-amber-200/80 text-amber-900'
                  }`}>
                    {pendingAccCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterLemburStatus('disetujui')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center space-x-1.5 ${
                    filterLemburStatus === 'disetujui'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  <span>🟢 Lembur Disetujui</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    filterLemburStatus === 'disetujui' ? 'bg-emerald-700 text-white' : 'bg-emerald-200/80 text-emerald-900'
                  }`}>
                    {approvedAccCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterLemburStatus('tanpa_lembur')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                    filterLemburStatus === 'tanpa_lembur'
                      ? 'bg-slate-700 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tanpa Lembur
                </button>
              </div>

              {/* Items Per Page Selector & Summary Count */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">Per halaman:</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="p-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={0}>Semua</option>
                </select>
                <span className="text-slate-500 font-bold text-[11px] px-2 py-0.5 bg-slate-100 rounded-md">
                  {filteredJobs.length} Data
                </span>
              </div>
            </div>
          </div>

          {/* 3. DATA VIEW: TABLE OR CARDS */}
          {viewMode === 'table' ? (
            /* TABEL FORMAT (Modern, Rapi & Elegan) */
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center text-slate-400 font-bold">#</th>
                      {isTeknisi ? (
                        <>
                          <th className="py-3 px-3.5 min-w-[220px]">Jenis &amp; Sub Pekerjaan</th>
                          <th className="py-3 px-3.5 min-w-[170px]">Teknisi</th>
                          <th className="py-3 px-3.5 min-w-[200px]">Catatan Pekerjaan</th>
                          <th className="py-3 px-3 text-center whitespace-nowrap min-w-[90px]">Foto</th>
                          <th className="py-3 px-3.5 text-center whitespace-nowrap min-w-[150px]">Keterangan Lunas/Tidak</th>
                        </>
                      ) : (
                        <>
                          <th className="py-3 px-3.5 whitespace-nowrap min-w-[130px]">Tanggal &amp; Server</th>
                          <th className="py-3 px-3.5 min-w-[200px]">Pekerjaan &amp; Klien</th>
                          <th className="py-3 px-3.5 min-w-[190px]">Teknisi &amp; Kendaraan</th>
                          <th className="py-3 px-3.5 whitespace-nowrap min-w-[120px]">Volume &amp; Lokasi</th>
                          <th className="py-3 px-3.5 whitespace-nowrap min-w-[140px]">Lembur &amp; ACC</th>
                          <th className="py-3 px-3.5 whitespace-nowrap min-w-[130px]">Estimasi Honor</th>
                          <th className="py-3 px-3 text-center whitespace-nowrap min-w-[90px]">Bukti Foto</th>
                          <th className="py-3 px-3.5 min-w-[160px]">Catatan</th>
                          <th className="sticky right-0 z-20 bg-slate-50 py-3 px-3 text-center min-w-[96px] whitespace-nowrap shadow-[-6px_0_10px_rgba(0,0,0,0.06)] border-l border-slate-200">
                            Aksi
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={isTeknisi ? 6 : 10} className="py-14 px-4 text-center">
                          <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
                            <div className="p-3 bg-slate-100 rounded-2xl text-slate-400">
                              <Briefcase className="w-8 h-8" />
                            </div>
                            <p className="font-extrabold text-slate-700 text-sm">Tidak ada pekerjaan yang cocok</p>
                            <p className="text-xs text-slate-400 max-w-sm">
                              {isTeknisi
                                ? 'Sesuaikan rentang tanggal atau filter server pengerjaan.'
                                : 'Sesuaikan rentang tanggal, filter server/teknisi, atau kata kunci pencarian Anda.'}
                            </p>
                            <button
                              type="button"
                              onClick={handleResetFilters}
                              className="mt-2 px-3.5 py-1.5 bg-maroon-800 text-white rounded-xl text-xs font-bold hover:bg-maroon-900 transition-all cursor-pointer shadow-xs"
                            >
                              Reset Filter ke Bulan Ini
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedJobs.map((job, idx) => {
                        const globalIndex = pageSize > 0 ? (currentPage - 1) * pageSize + idx + 1 : idx + 1;
                        const photosList =
                          job.buktiFotoUrls && job.buktiFotoUrls.length > 0
                            ? job.buktiFotoUrls
                            : job.buktiFotoUrl
                            ? [job.buktiFotoUrl]
                            : [];

                        const matchedServer = servers.find(
                          s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer
                        );
                        const displayServerName = matchedServer
                          ? matchedServer.namaServer
                          : job.namaServer && !job.namaServer.startsWith('srv-')
                          ? job.namaServer
                          : 'Server';

                        if (isTeknisi) {
                          const isLunas = isJobHonorLunas(job);
                          return (
                            <tr
                              key={job.id}
                              className="hover:bg-slate-50/70 transition-colors border-b border-slate-100/80 group"
                            >
                              {/* No */}
                              <td className="py-3.5 px-3 text-center font-bold text-slate-400 text-xs">
                                {globalIndex}
                              </td>

                              {/* Jenis & Sub Pekerjaan */}
                              <td className="py-3.5 px-3.5">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] uppercase tracking-wide border border-indigo-200/60">
                                      {job.jenisPekerjaanNama}
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/70 rounded-md font-bold text-[10px]">
                                      <Server className="w-2.5 h-2.5 text-maroon-700" />
                                      <span>{displayServerName}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 font-semibold">
                                      <Calendar className="w-3 h-3 text-slate-400" />
                                      <span>{formatDisplayDateIndo(job.tanggal)}</span>
                                    </span>
                                  </div>
                                  <p className="font-extrabold text-slate-900 text-xs leading-snug">
                                    {job.subPekerjaanNama}
                                  </p>
                                  {job.namaKlien && (
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                                      <span className="text-slate-400">Klien:</span>
                                      <span className="font-semibold text-slate-800">{job.namaKlien}</span>
                                    </p>
                                  )}
                                </div>
                              </td>

                              {/* Teknisi */}
                              <td className="py-3.5 px-3.5">
                                <div className="space-y-1">
                                  {job.teknisiIds.map((techId, tIdx) => {
                                    const name = (job.teknisiNamas && job.teknisiNamas[tIdx]) || 'Teknisi';
                                    const veh = (job.teknisiVehicles && job.teknisiVehicles[techId]) || 'Inventaris';
                                    const isPribadi = veh === 'Pribadi';
                                    const isJalanKaki = veh === 'Jalan Kaki';
                                    const isSelf = techId === currentUser?.id || name.toLowerCase().trim() === (currentUser?.namaLengkap || '').toLowerCase().trim();
                                    return (
                                      <div key={techId} className="flex items-center space-x-1.5 text-xs">
                                        <span className={`font-bold ${isSelf ? 'text-indigo-900 underline decoration-indigo-300' : 'text-slate-800'}`}>
                                          {name} {isSelf && '(Saya)'}
                                        </span>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                            isPribadi
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              : isJalanKaki
                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                              : 'bg-slate-100 text-slate-600 border-slate-200'
                                          }`}
                                        >
                                          {isPribadi ? '🚗 Pribadi' : isJalanKaki ? '🚶 Jalan' : '🛵 Inven'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>

                              {/* Catatan Pekerjaan */}
                              <td className="py-3.5 px-3.5">
                                <p
                                  className="text-slate-700 text-xs leading-relaxed max-w-[240px] line-clamp-3"
                                  title={job.catatan || (job as any).keterangan || ''}
                                >
                                  {job.catatan || (job as any).keterangan || <span className="text-slate-400 italic">Tidak ada catatan</span>}
                                </p>
                              </td>

                              {/* Foto */}
                              <td className="py-3.5 px-3 text-center whitespace-nowrap">
                                {photosList.length > 0 ? (
                                  <div
                                    onClick={() =>
                                      setSelectedJobPhotosModal({
                                        title: `${job.subPekerjaanNama} (${job.tanggal})`,
                                        photos: photosList
                                      })
                                    }
                                    className="inline-flex flex-col items-center cursor-pointer group/photo"
                                    title="Klik untuk melihat foto bukti pekerjaan"
                                  >
                                    <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shadow-2xs group-hover/photo:scale-105 transition-transform bg-slate-100">
                                      <SafeImage
                                        src={photosList[0]}
                                        alt="Bukti"
                                        className="w-full h-full object-cover"
                                        fallbackText="Foto"
                                      />
                                      {photosList.length > 1 && (
                                        <div className="absolute inset-x-0 bottom-0 bg-slate-900/75 text-[9px] text-white font-bold text-center py-0.2">
                                          +{photosList.length - 1}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-bold text-indigo-700 mt-0.5 group-hover/photo:underline">
                                      {photosList.length} Foto
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">Tidak ada foto</span>
                                )}
                              </td>

                              {/* Keterangan Lunas/Tidak */}
                              <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                                {isLunas ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>LUNAS</span>
                                    </span>
                                    {job.honorLunasAt && (
                                      <span className="text-[10px] text-emerald-700/90 font-bold mt-1">
                                        {job.honorLunasAt.slice(0, 10)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                                      <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                      <span>BELUM LUNAS</span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium mt-1">
                                      Menunggu Pelunasan
                                    </span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr
                            key={job.id}
                            className="hover:bg-slate-50/70 transition-colors border-b border-slate-100/80 group"
                          >
                            {/* No */}
                            <td className="py-3.5 px-3 text-center font-bold text-slate-400 text-xs">
                              {globalIndex}
                            </td>

                            {/* Tanggal & Server */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap">
                              <div className="space-y-1">
                                <div className="flex items-center space-x-1.5 text-xs font-extrabold text-slate-800">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{formatDisplayDateIndo(job.tanggal)}</span>
                                </div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/70 rounded-md font-bold text-[10px]">
                                  <Server className="w-3 h-3 text-maroon-700" />
                                  <span>{displayServerName}</span>
                                </span>
                              </div>
                            </td>

                            {/* Pekerjaan & Klien */}
                            <td className="py-3.5 px-3.5">
                              <div>
                                <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] uppercase tracking-wide border border-indigo-200/60 mb-1">
                                  {job.jenisPekerjaanNama}
                                </span>
                                <p className="font-extrabold text-slate-900 text-xs leading-snug">
                                  {job.subPekerjaanNama}
                                </p>
                                {job.namaKlien && (
                                  <p className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                                    <span className="text-slate-400">Klien:</span>
                                    <span className="font-semibold text-slate-800">{job.namaKlien}</span>
                                  </p>
                                )}
                                {job.wilayahNamas && job.wilayahNamas.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {job.wilayahNamas.map((wName, wIdx) => (
                                      <span
                                        key={wIdx}
                                        className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold rounded"
                                      >
                                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                                        <span>{wName}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Teknisi & Kendaraan */}
                            <td className="py-3.5 px-3.5">
                              <div className="space-y-1">
                                {job.teknisiIds.map((techId, tIdx) => {
                                  const name = (job.teknisiNamas && job.teknisiNamas[tIdx]) || 'Teknisi';
                                  const veh = (job.teknisiVehicles && job.teknisiVehicles[techId]) || 'Inventaris';
                                  const isPribadi = veh === 'Pribadi';
                                  const isJalanKaki = veh === 'Jalan Kaki';
                                  return (
                                    <div key={techId} className="flex items-center space-x-1.5 text-xs">
                                      <span className="font-bold text-slate-900">{name}</span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                          isPribadi
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : isJalanKaki
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-slate-100 text-slate-600 border-slate-200'
                                        }`}
                                      >
                                        {isPribadi ? '🚗 Pribadi' : isJalanKaki ? '🚶 Jalan' : '🛵 Inven'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Volume & Lokasi */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap">
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center space-x-1.5">
                                  {Number(job.jumlahTitik) > 0 && (
                                    <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-bold border border-slate-200">
                                      {job.jumlahTitik} Ttk
                                    </span>
                                  )}
                                  {Number(job.panjangKabelMeter) > 0 && (
                                    <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-bold border border-slate-200">
                                      {job.panjangKabelMeter} m
                                    </span>
                                  )}
                                  {Number(job.jumlahTitik || 0) === 0 && Number(job.panjangKabelMeter || 0) === 0 && (
                                    <span className="text-slate-400 text-[10px] italic">
                                      Standar
                                    </span>
                                  )}
                                </div>
                                {job.totalTransportWilayah > 0 && (
                                  <p className="text-[10px] text-emerald-700 font-semibold">
                                    Transport: {formatRupiah(job.totalTransportWilayah)}
                                  </p>
                                )}
                              </div>
                            </td>

                            {/* Lembur & ACC */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap">
                              {job.adaLembur ? (
                                <div className="space-y-1.5">
                                  {job.lemburApproved ? (
                                    <span
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      title={`Disetujui Admin (${job.lemburApprovedBy || 'Admin'})`}
                                    >
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span>ACC ({job.menitLembur}m)</span>
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200"
                                      title="Menunggu persetujuan Admin"
                                    >
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      <span>Tunggu ACC ({job.menitLembur}m)</span>
                                    </span>
                                  )}

                                  {currentUser?.role === 'Admin' && (
                                    <div>
                                      <button
                                        type="button"
                                        disabled={syncingLemburJobId === job.id}
                                        onClick={() => handleToggleLemburAcc(job)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center space-x-1 ${
                                          syncingLemburJobId === job.id
                                            ? 'opacity-70 cursor-wait bg-slate-200 text-slate-600'
                                            : job.lemburApproved
                                            ? 'bg-slate-100 text-slate-600 hover:bg-rose-100 hover:text-rose-700 border border-slate-200'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                                        }`}
                                        title={
                                          job.lemburApproved
                                            ? 'Batalkan ACC Lembur'
                                            : 'Setujui Lembur'
                                        }
                                      >
                                        {syncingLemburJobId === job.id ? (
                                          <>
                                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                            <span>Menyimpan...</span>
                                          </>
                                        ) : job.lemburApproved ? (
                                          <span>Batal ACC</span>
                                        ) : (
                                          <span>Setujui ACC</span>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">-</span>
                              )}
                            </td>

                            {/* Estimasi Honor */}
                            <td className="py-3.5 px-3.5 whitespace-nowrap">
                              <p className="font-black text-indigo-700 text-xs">
                                {formatRupiah(job.honorPerTeknisi)}
                              </p>
                              <span className="text-[10px] font-semibold text-slate-400 block">
                                / orang
                              </span>
                              <span className="text-[9px] text-slate-400 block">
                                Tot: {formatRupiah(job.estimasiTotalHonor)}
                              </span>
                            </td>

                            {/* Bukti Foto (Thumbnail Preview) */}
                            <td className="py-3.5 px-3 text-center whitespace-nowrap">
                              {photosList.length > 0 ? (
                                <div
                                  onClick={() =>
                                    setSelectedJobPhotosModal({
                                      title: `${job.subPekerjaanNama} (${job.tanggal})`,
                                      photos: photosList
                                    })
                                  }
                                  className="inline-flex flex-col items-center cursor-pointer group/photo"
                                  title="Klik untuk melihat foto bukti pekerjaan"
                                >
                                  <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-slate-200 shadow-2xs group-hover/photo:scale-105 transition-transform bg-slate-100">
                                    <SafeImage
                                      src={photosList[0]}
                                      alt="Bukti"
                                      className="w-full h-full object-cover"
                                      fallbackText="Foto"
                                    />
                                    {photosList.length > 1 && (
                                      <div className="absolute inset-x-0 bottom-0 bg-slate-900/75 text-[9px] text-white font-bold text-center py-0.2">
                                        +{photosList.length - 1}
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-bold text-indigo-700 mt-0.5 group-hover/photo:underline">
                                    {photosList.length} Foto
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[11px] italic">Tidak ada</span>
                              )}
                            </td>

                            {/* Catatan */}
                            <td className="py-3.5 px-3.5">
                              <p
                                className="text-slate-700 text-xs leading-relaxed max-w-[200px] line-clamp-2"
                                title={job.catatan || ''}
                              >
                                {job.catatan || <span className="text-slate-400 italic">-</span>}
                              </p>
                            </td>

                            {/* Aksi (Edit & Hapus) - Sticky di sisi kanan agar selalu terlihat tanpa perlu scroll horizontal */}
                            <td className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 py-3.5 px-3 text-center whitespace-nowrap shadow-[-6px_0_10px_rgba(0,0,0,0.06)] border-l border-slate-200/90">
                              <div className="flex items-center justify-center space-x-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEditJob(job)}
                                  className="p-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-lg transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                                  title="Edit Data Pekerjaan"
                                  aria-label="Edit Data Pekerjaan"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteJobPrompt(job.id, job.namaKlien || job.subPekerjaanNama || job.jenisPekerjaanNama || 'Pekerjaan')}
                                  className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
                                  title="Hapus Data Pekerjaan"
                                  aria-label="Hapus Data Pekerjaan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Pagination Controls for Table */}
              {pageSize > 0 && totalPages > 1 && (
                <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-semibold text-[11px]">
                    Menampilkan{' '}
                    <strong>{(currentPage - 1) * pageSize + 1}</strong> -{' '}
                    <strong>{Math.min(currentPage * pageSize, filteredJobs.length)}</strong> dari{' '}
                    <strong>{filteredJobs.length}</strong> pekerjaan
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Sebelumnya</span>
                    </button>

                    <span className="px-3 py-1 font-extrabold text-slate-800 bg-white border border-slate-200 rounded-lg text-[11px]">
                      {currentPage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Selanjutnya</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* KARTU FORMAT (Grid View Rapi & Mudah) */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredJobs.length === 0 ? (
                  <div className="col-span-full py-12 px-4 text-center bg-white rounded-2xl border border-slate-200">
                    <Briefcase className="w-10 h-10 stroke-1 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Tidak ada pekerjaan yang cocok</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Sesuaikan rentang tanggal atau filter pencarian Anda.
                    </p>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="mt-3 px-3.5 py-1.5 bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 cursor-pointer"
                    >
                      Reset Filter ke Bulan Ini
                    </button>
                  </div>
                ) : (
                  paginatedJobs.map((job, idx) => {
                    const globalIndex = pageSize > 0 ? (currentPage - 1) * pageSize + idx + 1 : idx + 1;
                    const photosList =
                      job.buktiFotoUrls && job.buktiFotoUrls.length > 0
                        ? job.buktiFotoUrls
                        : job.buktiFotoUrl
                        ? [job.buktiFotoUrl]
                        : [];

                    const matchedServer = servers.find(
                      s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer
                    );
                    const displayServerName = matchedServer
                      ? matchedServer.namaServer
                      : job.namaServer && !job.namaServer.startsWith('srv-')
                      ? job.namaServer
                      : 'Server';

                    if (isTeknisi) {
                      const isLunas = isJobHonorLunas(job);
                      return (
                        <div
                          key={job.id}
                          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
                        >
                          <div className="space-y-3">
                            {/* Header Card: No, Tanggal, Server */}
                            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                              <div className="flex items-center space-x-2">
                                <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[11px] shrink-0">
                                  #{globalIndex}
                                </span>
                                <div className="flex items-center space-x-1 text-xs font-extrabold text-slate-800">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{formatDisplayDateIndo(job.tanggal)}</span>
                                </div>
                              </div>

                              <span className="px-2 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/70 font-bold rounded-md text-[10px] flex items-center gap-1">
                                <Server className="w-3 h-3 text-maroon-700" />
                                <span>{displayServerName}</span>
                              </span>
                            </div>

                            {/* Jenis & Sub Pekerjaan */}
                            <div>
                              <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] uppercase tracking-wide border border-indigo-200/60 mb-1">
                                {job.jenisPekerjaanNama}
                              </span>
                              <h4 className="font-extrabold text-slate-900 text-sm leading-snug">
                                {job.subPekerjaanNama}
                              </h4>
                              {job.namaKlien && (
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                  Klien: <strong className="text-slate-800">{job.namaKlien}</strong>
                                </p>
                              )}
                            </div>

                            {/* Teknisi */}
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-1.5 text-xs">
                              <div className="flex items-start space-x-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                                <div className="flex flex-wrap gap-1">
                                  {job.teknisiIds.map((techId, tIdx) => {
                                    const name = (job.teknisiNamas && job.teknisiNamas[tIdx]) || 'Teknisi';
                                    const veh = (job.teknisiVehicles && job.teknisiVehicles[techId]) || 'Inventaris';
                                    const isPribadi = veh === 'Pribadi';
                                    const isJalanKaki = veh === 'Jalan Kaki';
                                    const isSelf = techId === currentUser?.id || name.toLowerCase().trim() === (currentUser?.namaLengkap || '').toLowerCase().trim();
                                    return (
                                      <span
                                        key={techId}
                                        className="px-2 py-0.5 bg-white border border-slate-200 text-slate-800 rounded-md text-[10px] font-bold inline-flex items-center gap-1 shadow-2xs"
                                      >
                                        <span className={isSelf ? 'text-indigo-900 font-black' : ''}>{name} {isSelf && '(Saya)'}</span>
                                        <span className={`text-[9px] px-1 rounded ${
                                          isPribadi ? 'bg-emerald-100 text-emerald-800' : isJalanKaki ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {isPribadi ? '🚗 Pribadi' : isJalanKaki ? '🚶 Jalan' : '🛵 Inven'}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Catatan Pekerjaan */}
                              {(job.catatan || (job as any).keterangan) && (
                                <div className="pt-1.5 border-t border-slate-200/60">
                                  <p className="text-slate-600 text-xs italic leading-relaxed">
                                    "{job.catatan || (job as any).keterangan}"
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer Card: Foto & Keterangan Lunas/Tidak */}
                          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 mt-2">
                            {photosList.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedJobPhotosModal({
                                    title: `${job.subPekerjaanNama} (${job.tanggal})`,
                                    photos: photosList
                                  })
                                }
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs inline-flex items-center space-x-1.5 border border-indigo-200 shadow-2xs cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>{photosList.length} Foto Bukti</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Tidak ada foto</span>
                            )}

                            <div>
                              {isLunas ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>LUNAS</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                                  <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                  <span>BELUM LUNAS</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={job.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* Header Card: No, Tanggal, Server, & Actions */}
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center space-x-2">
                              <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[11px] shrink-0">
                                #{globalIndex}
                              </span>
                              <div className="flex items-center space-x-1 text-xs font-extrabold text-slate-800">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>{formatDisplayDateIndo(job.tanggal)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-2 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/70 font-bold rounded-md text-[10px] flex items-center gap-1">
                                <Server className="w-3 h-3 text-maroon-700" />
                                <span>{displayServerName}</span>
                              </span>

                              {currentUser?.role !== 'Teknisi' && (
                                <div className="flex items-center space-x-1 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditJob(job)}
                                    className="p-1 text-amber-600 hover:bg-amber-50 rounded-lg"
                                    title="Edit Pekerjaan"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteJobPrompt(job.id, job.namaKlien || job.jenisPekerjaanNama || 'Pekerjaan')}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg"
                                    title="Hapus Pekerjaan"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Sub Pekerjaan & Jenis Badge */}
                          <div>
                            <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] uppercase tracking-wide border border-indigo-200/60 mb-1">
                              {job.jenisPekerjaanNama}
                            </span>
                            <h4 className="font-extrabold text-slate-900 text-sm leading-snug">
                              {job.subPekerjaanNama}
                            </h4>
                            {job.namaKlien && (
                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Klien: <strong className="text-slate-800">{job.namaKlien}</strong>
                              </p>
                            )}
                          </div>

                          {/* Wilayah / Lokasi */}
                          {job.wilayahNamas && job.wilayahNamas.length > 0 && (
                            <div className="flex items-start space-x-1.5 text-xs">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                              <div className="flex flex-wrap gap-1">
                                {job.wilayahNamas.map((wName, wIdx) => (
                                  <span
                                    key={wIdx}
                                    className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold rounded"
                                  >
                                    {wName}
                                  </span>
                                ))}
                                {job.totalTransportWilayah > 0 && (
                                  <span className="text-[10px] text-emerald-700 font-semibold self-center ml-0.5">
                                    (Transport: {formatRupiah(job.totalTransportWilayah)})
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Micro-Details Box: Teknisi, Volume, Honor */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 text-xs">
                            {/* Teknisi */}
                            <div className="flex items-start space-x-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                              <div className="flex flex-wrap gap-1">
                                {job.teknisiIds.map((techId, tIdx) => {
                                  const name = (job.teknisiNamas && job.teknisiNamas[tIdx]) || 'Teknisi';
                                  const veh = (job.teknisiVehicles && job.teknisiVehicles[techId]) || 'Inventaris';
                                  const isPribadi = veh === 'Pribadi';
                                  const isJalanKaki = veh === 'Jalan Kaki';
                                  return (
                                    <span
                                      key={techId}
                                      className="px-2 py-0.5 bg-white border border-slate-200 text-slate-800 rounded-md text-[10px] font-bold inline-flex items-center gap-1 shadow-2xs"
                                    >
                                      <span>{name}</span>
                                      <span className={`text-[9px] px-1 rounded ${
                                        isPribadi ? 'bg-emerald-100 text-emerald-800' : isJalanKaki ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {isPribadi ? '🚗 Pribadi' : isJalanKaki ? '🚶 Jalan' : '🛵 Inven'}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Volume & Lembur */}
                            <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between gap-1 text-[11px]">
                              <div className="flex items-center space-x-1.5">
                                {Number(job.jumlahTitik) > 0 && (
                                  <span className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold text-[10px]">
                                    {job.jumlahTitik} Titik
                                  </span>
                                )}
                                {Number(job.panjangKabelMeter) > 0 && (
                                  <span className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold text-[10px]">
                                    {job.panjangKabelMeter} m
                                  </span>
                                )}
                                {Number(job.jumlahTitik || 0) === 0 && Number(job.panjangKabelMeter || 0) === 0 && (
                                  <span className="text-slate-400 text-[10px] italic">
                                    Standar
                                  </span>
                                )}
                              </div>

                              {job.adaLembur && (
                                <div className="flex items-center space-x-1">
                                  {job.lemburApproved ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-0.5">
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Lembur ACC ({job.menitLembur}m)</span>
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-0.5">
                                      <Clock className="w-2.5 h-2.5" />
                                      <span>Tunggu ACC ({job.menitLembur}m)</span>
                                    </span>
                                  )}
                                  {currentUser?.role === 'Admin' && (
                                    <button
                                      type="button"
                                      disabled={syncingLemburJobId === job.id}
                                      onClick={() => handleToggleLemburAcc(job)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                                        job.lemburApproved
                                          ? 'bg-slate-200 text-slate-700 hover:bg-rose-100'
                                          : 'bg-emerald-600 text-white'
                                      }`}
                                    >
                                      {job.lemburApproved ? 'Batal' : 'ACC'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Estimasi Honor */}
                            <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                              <span className="text-[11px] text-slate-500 font-semibold">Honor / Teknisi:</span>
                              <div className="text-right">
                                <span className="font-black text-indigo-700 text-sm">
                                  {formatRupiah(job.honorPerTeknisi)}
                                </span>
                                <span className="text-[9px] text-slate-400 block font-semibold">
                                  Total: {formatRupiah(job.estimasiTotalHonor)}
                                </span>
                              </div>
                            </div>

                            {/* Catatan */}
                            {job.catatan && (
                              <div className="pt-1.5 border-t border-slate-200/60">
                                <p className="text-slate-600 text-xs italic leading-relaxed">
                                  "{job.catatan}"
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Foto Bukti Strip */}
                        {photosList.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedJobPhotosModal({
                                  title: `${job.subPekerjaanNama} (${job.tanggal})`,
                                  photos: photosList
                                })
                              }
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs inline-flex items-center space-x-1.5 border border-indigo-200 shadow-2xs cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Lihat {photosList.length} Foto Bukti</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination for Card View */}
              {pageSize > 0 && totalPages > 1 && (
                <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-semibold text-[11px]">
                    Menampilkan{' '}
                    <strong>{(currentPage - 1) * pageSize + 1}</strong> -{' '}
                    <strong>{Math.min(currentPage * pageSize, filteredJobs.length)}</strong> dari{' '}
                    <strong>{filteredJobs.length}</strong> pekerjaan
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Sebelumnya</span>
                    </button>

                    <span className="px-3 py-1 font-extrabold text-slate-800 bg-white border border-slate-200 rounded-lg text-[11px]">
                      {currentPage} / {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Selanjutnya</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB TAB 2: PLANNING PEKERJAAN - MODERN, CLEAN & INTUITIVE (GAMBAR 3) */}
      {activeSubTab === 'planning' && (
        <div className="space-y-4">
          {/* 1. TOP METRIC / STATS SUMMARY CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            {/* Card 1: Total Planning */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  TOTAL PLANNING
                </span>
                <p className="text-xl sm:text-2xl font-black text-slate-900 leading-tight mt-0.5">
                  {planningStats.total}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Semua jadwal tugas terdata
                </p>
              </div>
              <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>

            {/* Card 2: Menunggu (Pending) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">
                  MENUNGGU (PENDING)
                </span>
                <p className="text-xl sm:text-2xl font-black text-amber-700 leading-tight mt-0.5">
                  {planningStats.pending}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Belum dikerjakan teknisi
                </p>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3: Sedang Proses */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                  SEDANG PROSES
                </span>
                <p className="text-xl sm:text-2xl font-black text-blue-700 leading-tight mt-0.5">
                  {planningStats.proses}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Dikerjakan di lapangan
                </p>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <Activity className="w-5 h-5" />
              </div>
            </div>

            {/* Card 4: Tugas Selesai */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
                  TUGAS SELESAI
                </span>
                <p className="text-xl sm:text-2xl font-black text-emerald-700 leading-tight mt-0.5">
                  {planningStats.selesai}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Sudah terealisasi penuh
                </p>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* 2. FILTER & SEARCH CONTROLS TOOLBAR */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Search Bar Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari tugas planning, klien, sales, teknisi, ODP, atau alamat..."
                  value={planningSearchQuery}
                  onChange={e => setPlanningSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-maroon-800/30 focus:border-maroon-800 transition-all font-medium"
                />
                {planningSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setPlanningSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
                    title="Hapus pencarian"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filters Dropdown */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Status Filter */}
                <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
                  <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={planningStatusFilter}
                    onChange={e => setPlanningStatusFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
                    title="Filter Status Planning"
                  >
                    <option value="all">Semua Status</option>
                    <option value="Pending">Pending (Menunggu)</option>
                    <option value="Proses">Sedang Proses</option>
                    <option value="Selesai">Selesai</option>
                  </select>
                </div>

                {/* Server Filter */}
                <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
                  <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={planningServerFilter}
                    onChange={e => setPlanningServerFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer pr-1 max-w-[150px] truncate"
                    title="Filter Server"
                  >
                    <option value="all">Semua Server</option>
                    {servers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.namaServer}
                      </option>
                    ))}
                  </select>
                </div>

                {/* View Mode Toggle (Table / Card) */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPlanningViewMode('table')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                      planningViewMode === 'table'
                        ? 'bg-white text-maroon-800 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Tampilan Tabel (Rapi)"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tabel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanningViewMode('cards')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer ${
                      planningViewMode === 'cards'
                        ? 'bg-white text-maroon-800 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Tampilan Kartu (Grid)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Kartu</span>
                  </button>
                </div>

                {/* Reset Filter Button */}
                {(planningSearchQuery || planningStatusFilter !== 'all' || planningServerFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlanningSearchQuery('');
                      setPlanningStatusFilter('all');
                      setPlanningServerFilter('all');
                    }}
                    className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            </div>

            {/* Showing status count bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1 pt-1 border-t border-slate-100">
              <span>
                Menampilkan <strong>{filteredPlanningTasks.length}</strong> dari {displayedPlanningTasks.length} Planning Tugas
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-slate-400">Tampilkan per halaman:</span>
                <select
                  value={planningPageSize}
                  onChange={e => setPlanningPageSize(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. CONTENT AREA: TABEL OR KARTU VIEW */}
          {planningViewMode === 'table' ? (
            /* TABEL FORMAT (GAMBAR 3) */
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10.5px]">
                    <tr>
                      <th className="p-3.5 w-12 text-center">No</th>
                      <th className="p-3.5 whitespace-nowrap">Input / Tanggal</th>
                      <th className="p-3.5 whitespace-nowrap">Sales / Server</th>
                      <th className="p-3.5">Informasi Client</th>
                      <th className="p-3.5">Lokasi & Alamat</th>
                      <th className="p-3.5">Detail ODP / Detail Tugas</th>
                      <th className="p-3.5">Plan PSB / Teknisi Target</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {paginatedPlanningTasks.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-slate-400">
                          <FileSpreadsheet className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                          <p className="font-bold text-slate-700 text-sm">Tidak ada planning tugas yang cocok</p>
                          <p className="text-xs text-slate-400 mt-0.5">Ubah kata kunci pencarian atau sesuaikan filter status/server.</p>
                          {currentUser?.role !== 'Teknisi' && (
                            <button
                              type="button"
                              onClick={handleOpenPlanningModal}
                              className="mt-3 px-3.5 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 cursor-pointer inline-flex items-center space-x-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Buat Planning Tugas Baru</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedPlanningTasks.map((plan, idx) => {
                        const globalIndex = (planningCurrentPage - 1) * planningPageSize + idx + 1;
                        const serverName =
                          servers.find(s => s.id === plan.serverId || s.id === plan.namaServer || s.namaServer === plan.namaServer)?.namaServer ||
                          (plan.namaServer && !plan.namaServer.startsWith('srv-') ? plan.namaServer : 'Server');

                        return (
                          <tr key={plan.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* NO */}
                            <td className="p-3.5 text-center font-bold text-slate-400">
                              #{globalIndex}
                            </td>

                            {/* 1. INPUT / TANGGAL */}
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="flex items-center space-x-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="font-black text-slate-900 text-xs">
                                  {formatDisplayDateIndo(plan.tanggal)}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {plan.noRegistrasi ? (
                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold">
                                    {plan.noRegistrasi}
                                  </span>
                                ) : plan.inputBy ? (
                                  <span>By: {plan.inputBy}</span>
                                ) : null}
                              </div>
                            </td>

                            {/* 2. SALES / SERVER */}
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/70 rounded-md text-[10px] font-bold">
                                <Server className="w-3 h-3 text-maroon-700" />
                                <span>{serverName}</span>
                              </span>
                              {plan.sales ? (
                                <p className="text-[11px] text-slate-600 font-semibold mt-1 flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>Sales: {plan.sales}</span>
                                </p>
                              ) : null}
                            </td>

                            {/* 3. INFORMASI CLIENT */}
                            <td className="p-3.5 min-w-[140px]">
                              <p className="font-extrabold text-slate-900 text-xs">
                                {plan.namaKlien || 'Client / Pelanggan'}
                              </p>
                              {plan.noWaKlien ? (
                                <a
                                  href={`https://wa.me/${plan.noWaKlien.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-emerald-700 hover:text-emerald-900 hover:underline font-bold mt-0.5 flex items-center gap-1"
                                  title="Chat WhatsApp Klien"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{plan.noWaKlien}</span>
                                </a>
                              ) : (
                                <p className="text-[10px] text-slate-400 italic mt-0.5">Kontak -</p>
                              )}
                            </td>

                            {/* 4. LOKASI & ALAMAT */}
                            <td className="p-3.5 min-w-[180px] max-w-xs">
                              <div className="flex items-start space-x-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-700 font-medium line-clamp-2" title={plan.alamatKlien || '-'}>
                                  {plan.alamatKlien || '-'}
                                </p>
                              </div>
                            </td>

                            {/* 5. DETAIL ODP / DETAIL TUGAS */}
                            <td className="p-3.5 min-w-[200px] max-w-sm">
                              <div className="flex items-center gap-1 flex-wrap mb-1">
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] border border-indigo-200/60">
                                  {plan.subPekerjaanNama}
                                </span>
                                {plan.detailOdp && (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-bold rounded-md text-[10px] border border-amber-200">
                                    ODP: {plan.detailOdp}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-800 font-bold line-clamp-2 leading-snug" title={plan.detailPekerjaan}>
                                {plan.detailPekerjaan}
                              </p>
                            </td>

                            {/* 6. PLAN PSB / TEKNISI TARGET */}
                            <td className="p-3.5 min-w-[160px]">
                              {plan.targetTeknisiNamas && plan.targetTeknisiNamas.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {plan.targetTeknisiNamas.map((tName, tIdx) => (
                                    <span
                                      key={tIdx}
                                      className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[10px] font-bold flex items-center gap-1 border border-slate-200"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      <span>{tName}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">Belum ditugaskan</span>
                              )}
                            </td>

                            {/* 7. STATUS */}
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-block border ${
                                  plan.status === 'Selesai'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : plan.status === 'Proses'
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                              >
                                {plan.status}
                              </span>
                            </td>

                            {/* 8. AKSI */}
                            <td className="p-3.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center space-x-1">
                                {/* Kerjakan & Simpan Realisasi */}
                                {plan.status !== 'Selesai' && (
                                  <button
                                    type="button"
                                    onClick={() => handleConvertPlanningToJob(plan)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-[10px] rounded-lg shadow-2xs flex items-center space-x-1 transition-all cursor-pointer"
                                    title="Kerjakan & Simpan Realisasi Pekerjaan"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Kerjakan</span>
                                  </button>
                                )}

                                {/* Kirim WA Notifikasi */}
                                <button
                                  type="button"
                                  onClick={() => handleManualNotifyWhatsApp(plan)}
                                  disabled={isSendingNotif}
                                  className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors shadow-2xs"
                                  title="Kirim / Ulangi Notifikasi WhatsApp ke Teknisi"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>

                                {/* Edit Planning */}
                                {currentUser?.role !== 'Teknisi' && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditPlanning(plan)}
                                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-2xs"
                                    title="Edit Planning"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Hapus Planning */}
                                {currentUser?.role !== 'Teknisi' && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePlanningPrompt(plan.id, plan.subPekerjaanNama || plan.detailPekerjaan || 'Planning')}
                                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors shadow-2xs"
                                    title="Hapus Planning"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination Bar */}
              {totalPlanningPages > 1 && (
                <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-semibold text-[11px]">
                    Menampilkan <strong>{(planningCurrentPage - 1) * planningPageSize + 1}</strong> -{' '}
                    <strong>{Math.min(planningCurrentPage * planningPageSize, filteredPlanningTasks.length)}</strong> dari{' '}
                    <strong>{filteredPlanningTasks.length}</strong> planning tugas
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={planningCurrentPage <= 1}
                      onClick={() => setPlanningCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Sebelumnya</span>
                    </button>

                    <span className="px-3 py-1 font-extrabold text-slate-800 bg-white border border-slate-200 rounded-lg text-[11px]">
                      {planningCurrentPage} / {totalPlanningPages}
                    </span>

                    <button
                      type="button"
                      disabled={planningCurrentPage >= totalPlanningPages}
                      onClick={() => setPlanningCurrentPage(p => Math.min(totalPlanningPages, p + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Selanjutnya</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* KARTU FORMAT (Grid View Rapi & Mudah) */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {paginatedPlanningTasks.length === 0 ? (
                  <div className="col-span-full py-12 px-4 text-center bg-white rounded-2xl border border-slate-200">
                    <FileSpreadsheet className="w-10 h-10 stroke-1 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Tidak ada planning tugas yang cocok</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Sesuaikan kata kunci pencarian atau filter status dan server.
                    </p>
                    {currentUser?.role !== 'Teknisi' && (
                      <button
                        type="button"
                        onClick={handleOpenPlanningModal}
                        className="mt-3 px-3.5 py-1.5 bg-maroon-800 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 cursor-pointer inline-flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Buat Planning Tugas Baru</span>
                      </button>
                    )}
                  </div>
                ) : (
                  paginatedPlanningTasks.map((plan, idx) => {
                    const globalIndex = (planningCurrentPage - 1) * planningPageSize + idx + 1;
                    const serverName =
                      servers.find(s => s.id === plan.serverId || s.id === plan.namaServer || s.namaServer === plan.namaServer)?.namaServer ||
                      (plan.namaServer && !plan.namaServer.startsWith('srv-') ? plan.namaServer : 'Server');

                    return (
                      <div
                        key={plan.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* Header Card: No, Tanggal, Server, & Actions */}
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center space-x-2">
                              <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[11px] shrink-0">
                                #{globalIndex}
                              </span>
                              <div className="flex items-center space-x-1 text-xs font-extrabold text-slate-800">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>{formatDisplayDateIndo(plan.tanggal)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="px-2 py-0.5 bg-maroon-50 text-maroon-800 border border-maroon-200/70 font-bold rounded-md text-[10px] flex items-center gap-1">
                                <Server className="w-3 h-3 text-maroon-700" />
                                <span>{serverName}</span>
                              </span>

                              {currentUser?.role !== 'Teknisi' && (
                                <div className="flex items-center space-x-1 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditPlanning(plan)}
                                    className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg"
                                    title="Edit Planning"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePlanningPrompt(plan.id, plan.subPekerjaanNama || plan.detailPekerjaan || 'Planning')}
                                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg"
                                    title="Hapus Planning"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Sub Pekerjaan & Detail ODP */}
                          <div>
                            <div className="flex items-center gap-1 flex-wrap mb-1">
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] border border-indigo-200/60">
                                {plan.subPekerjaanNama}
                              </span>
                              {plan.detailOdp && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-bold rounded-md text-[10px] border border-amber-200">
                                  ODP: {plan.detailOdp}
                                </span>
                              )}
                            </div>
                            <h4 className="font-extrabold text-slate-900 text-sm leading-snug">
                              {plan.detailPekerjaan}
                            </h4>
                          </div>

                          {/* Informasi Client */}
                          {(plan.namaKlien || plan.noWaKlien) && (
                            <div className="p-2.5 bg-slate-50 rounded-xl space-y-1 text-xs">
                              {plan.namaKlien && (
                                <p className="text-slate-800 font-bold">
                                  Klien: <strong>{plan.namaKlien}</strong>
                                </p>
                              )}
                              {plan.noWaKlien && (
                                <a
                                  href={`https://wa.me/${plan.noWaKlien.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-emerald-700 hover:underline font-bold flex items-center gap-1"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                  <span>{plan.noWaKlien}</span>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Alamat Klien */}
                          {plan.alamatKlien && (
                            <div className="flex items-start space-x-1.5 text-xs text-slate-600">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{plan.alamatKlien}</span>
                            </div>
                          )}

                          {/* Target Teknisi */}
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold block mb-1">Target Teknisi:</span>
                            {plan.targetTeknisiNamas && plan.targetTeknisiNamas.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {plan.targetTeknisiNamas.map((tName, tIdx) => (
                                  <span
                                    key={tIdx}
                                    className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[10px] font-bold border border-slate-200"
                                  >
                                    {tName}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-xs">-</span>
                            )}
                          </div>
                        </div>

                        {/* Card Footer: Status & Action Buttons */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                              plan.status === 'Selesai'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : plan.status === 'Proses'
                                ? 'bg-blue-100 text-blue-800 border-blue-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}
                          >
                            Status: {plan.status}
                          </span>

                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleManualNotifyWhatsApp(plan)}
                              disabled={isSendingNotif}
                              className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                              title="Kirim Notifikasi WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            {plan.status !== 'Selesai' && (
                              <button
                                type="button"
                                onClick={() => handleConvertPlanningToJob(plan)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center space-x-1"
                              >
                                <span>Kerjakan</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Card View Pagination */}
              {totalPlanningPages > 1 && (
                <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-semibold text-[11px]">
                    Menampilkan <strong>{(planningCurrentPage - 1) * planningPageSize + 1}</strong> -{' '}
                    <strong>{Math.min(planningCurrentPage * planningPageSize, filteredPlanningTasks.length)}</strong> dari{' '}
                    <strong>{filteredPlanningTasks.length}</strong> planning tugas
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={planningCurrentPage <= 1}
                      onClick={() => setPlanningCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Sebelumnya</span>
                    </button>

                    <span className="px-3 py-1 font-extrabold text-slate-800 bg-white border border-slate-200 rounded-lg text-[11px]">
                      {planningCurrentPage} / {totalPlanningPages}
                    </span>

                    <button
                      type="button"
                      disabled={planningCurrentPage >= totalPlanningPages}
                      onClick={() => setPlanningCurrentPage(p => Math.min(totalPlanningPages, p + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Selanjutnya</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL FEEDBACK NOTIFIKASI PLANNING */}
      {notificationFeedback && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Notifikasi Planning Tugas Terkirim!</h3>
                  <p className="text-xs text-slate-500">{notificationFeedback.plan.subPekerjaanNama}</p>
                </div>
              </div>
              <button
                onClick={() => setNotificationFeedback(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tanggal:</span>
                <strong className="text-slate-900">{notificationFeedback.plan.tanggal}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Server:</span>
                <strong className="text-slate-900">{notificationFeedback.plan.namaServer}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Detail Pekerjaan:</span>
                <span className="text-slate-800 text-right max-w-[200px] truncate">{notificationFeedback.plan.detailPekerjaan || '-'}</span>
              </div>
            </div>

            {/* List of target technicians and delivery status */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Status Pengiriman ke Teknisi:</span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notificationFeedback.results.map((res, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs shadow-2xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{res.technicianName}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{res.phone || 'Nomor HP tidak ada'}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          res.success
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {res.success ? 'Terkirim' : 'Manual WA'}
                      </span>

                      {res.directWaLink && (
                        <a
                          href={res.directWaLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center space-x-1"
                        >
                          <span>Buka WA</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setNotificationFeedback(null)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all"
              >
                Tutup & Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INPUT & EDIT DATA PEKERJAAN (UNIFIED COMPONENT) */}
      {isJobModalOpen && (
        <JobModal
          isOpen={isJobModalOpen}
          onClose={() => {
            setIsJobModalOpen(false);
            setEditingJob(null);
          }}
          onSaveJob={async (job) => {
            const res = await onSaveJob(job);
            if (res && res.success === false) {
              return res;
            }
            setIsJobModalOpen(false);
            setEditingJob(null);
            return res;
          }}
          employees={employees}
          servers={servers}
          jenisList={jenisList}
          wilayahList={wilayahList}
          currentUser={currentUser}
          editingJob={editingJob}
          googleAppsScriptUrl={googleAppsScriptUrl}
          attendanceList={attendanceList}
          settings={settings}
        />
      )}

      {/* MODAL PLANNING PEKERJAAN */}
      {isPlanningModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  {planningForm.id ? 'Edit Planning Tugas Pekerjaan' : 'Buat Planning Tugas Pekerjaan Baru'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Isi detail penugasan untuk teknisi lapangan dan informasi pelanggan
                </p>
              </div>
              <button
                onClick={handleRequestClosePlanning}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePlanningSubmit} className="space-y-3.5 text-xs font-medium">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tanggal Jadwal</label>
                  <input
                    type="date"
                    required
                    value={planningForm.tanggal}
                    onChange={e => setPlanningForm({ ...planningForm, tanggal: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sales / PIC</label>
                  <input
                    type="text"
                    placeholder="Nama sales / admin..."
                    value={planningForm.sales || ''}
                    onChange={e => setPlanningForm({ ...planningForm, sales: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* Data Klien */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  INFORMASI CLIENT / PELANGGAN
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Nama Klien</label>
                    <input
                      type="text"
                      placeholder="Contoh: Bpk. Ahmad"
                      value={planningForm.namaKlien || ''}
                      onChange={e => setPlanningForm({ ...planningForm, namaKlien: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">No. WhatsApp Klien</label>
                    <input
                      type="tel"
                      placeholder="Contoh: 08123456789"
                      value={planningForm.noWaKlien || ''}
                      onChange={e => setPlanningForm({ ...planningForm, noWaKlien: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Lokasi & Alamat Klien</label>
                  <textarea
                    rows={2}
                    placeholder="Alamat lengkap lokasi pemasangan / perbaikan..."
                    value={planningForm.alamatKlien || ''}
                    onChange={e => setPlanningForm({ ...planningForm, alamatKlien: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* Server & Jenis Pekerjaan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-bold">Server Pengerjaan</label>
                    {isPjServer && userServer && (
                      <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded font-bold">
                        Server: {userServer.namaServer}
                      </span>
                    )}
                  </div>
                  <select
                    value={planningForm.serverId || (userServer ? userServer.id : '')}
                    onChange={e => setPlanningForm({ ...planningForm, serverId: e.target.value })}
                    disabled={isPjServer && Boolean(userServer)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl disabled:bg-slate-100 disabled:text-slate-700 disabled:cursor-not-allowed font-medium"
                  >
                    {availablePlanningServers.map(s => (
                      <option key={s.id} value={s.id}>{s.namaServer}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Jenis & Sub Pekerjaan</label>
                  <select
                    value={planningForm.jenisPekerjaanId}
                    onChange={e => setPlanningForm({ ...planningForm, jenisPekerjaanId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer font-medium"
                  >
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
                </div>
              </div>

              {/* Detail ODP & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Detail ODP / Port (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Contoh: ODP-ALB-04 PORT 02"
                    value={planningForm.detailOdp || ''}
                    onChange={e => setPlanningForm({ ...planningForm, detailOdp: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Status Planning</label>
                  <select
                    value={planningForm.status || 'Pending'}
                    onChange={e => setPlanningForm({ ...planningForm, status: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer font-bold"
                  >
                    <option value="Pending">Pending (Menunggu)</option>
                    <option value="Proses">Sedang Proses</option>
                    <option value="Selesai">Selesai</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Detail Tugas Pekerjaan</label>
                <textarea
                  required
                  rows={2}
                  value={planningForm.detailPekerjaan}
                  onChange={e => setPlanningForm({ ...planningForm, detailPekerjaan: e.target.value })}
                  placeholder="Deskripsi tugas dan instruksi kerja lapangan..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Target Teknisi */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Target Teknisi Lapangan</label>
                <div className="grid grid-cols-2 gap-2 max-h-28 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {sortedEmployees
                    .filter(e => e.role === 'Teknisi')
                    .map(emp => {
                      const isChecked = planningForm.targetTeknisiIds?.includes(emp.id);
                      return (
                        <label key={emp.id} className="flex items-center space-x-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const curr = planningForm.targetTeknisiIds || [];
                              if (e.target.checked) {
                                setPlanningForm({ ...planningForm, targetTeknisiIds: [...curr, emp.id] });
                              } else {
                                setPlanningForm({
                                  ...planningForm,
                                  targetTeknisiIds: curr.filter(id => id !== emp.id)
                                });
                              }
                            }}
                            className="rounded-sm text-maroon-800 focus:ring-maroon-800"
                          />
                          <span className="truncate font-semibold">{emp.namaLengkap}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={handleRequestClosePlanning}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-maroon-800 hover:bg-maroon-900 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  {planningForm.id ? 'Perbarui Planning' : 'Simpan Planning'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MULTI-PHOTO GALLERY MODAL */}
      {selectedJobPhotosModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedJobPhotosModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Bukti Foto Pekerjaan Lapangan
                </h3>
                <p className="text-xs text-slate-500">{selectedJobPhotosModal.title}</p>
              </div>
              <button
                onClick={() => setSelectedJobPhotosModal(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedJobPhotosModal.photos.map((p, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-600 px-2 py-0.5 bg-slate-200 rounded-md">
                      Foto {idx + 1} {idx === 0 ? '(Bukti Pekerjaan)' : idx === 1 ? '(Titik/Peta GPS)' : ''}
                    </span>
                    <a
                      href={p}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-maroon-800 font-bold hover:underline"
                    >
                      Buka Asli ↗
                    </a>
                  </div>
                  <SafeImage
                    src={p}
                    alt={`Foto ${idx + 1}`}
                    className="w-full h-48 object-cover rounded-xl border border-slate-200"
                    fallbackText={`Foto Bukti ${idx + 1}`}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedJobPhotosModal(null)}
                className="px-5 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700"
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

export const MasterPekerjaanView: React.FC<MasterPekerjaanViewProps> = React.memo(
  MasterPekerjaanViewComponent,
  (prev, next) =>
    prev.initialTab === next.initialTab &&
    prev.jobs === next.jobs &&
    prev.planningTasks === next.planningTasks &&
    prev.employees === next.employees &&
    prev.servers === next.servers &&
    prev.jenisList === next.jenisList &&
    prev.wilayahList === next.wilayahList &&
    prev.currentUser === next.currentUser &&
    prev.googleAppsScriptUrl === next.googleAppsScriptUrl &&
    prev.attendanceList === next.attendanceList &&
    prev.settings === next.settings &&
    prev.honorLunasList === next.honorLunasList
);
