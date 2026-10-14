import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Download,
  Printer,
  Eye,
  FileText,
  User,
  DollarSign,
  Briefcase,
  X,
  CheckCircle,
  AlertCircle,
  Calendar,
  Filter,
  Server,
  UserCheck,
  RotateCcw,
  FileDown,
  Loader2,
  Layers,
  MapPin,
  Clock,
  Sparkles,
  MinusCircle,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  Search,
  BadgeCheck,
  CheckCheck,
  FileCheck,
  History,
  Undo2
} from 'lucide-react';
import {
  Employee,
  ServerData,
  WilayahPekerjaan,
  JenisPekerjaan,
  JobRecord,
  AttendanceRecord,
  PayrollRecap,
  AppSettings,
  PotonganManual,
  JenisPotonganManual,
  HonorLunasRecord
} from '../types';
import { calculatePayrollForEmployee, formatRupiah, checkTechnicianHasPulang, checkTechnicianAttendanceApproved } from '../services/payroll';
import { generateJobHonorPdfReport, generateIndividualSlipPdf } from '../utils/generatePdfReport';
import { OfficialSlipGajiDocument } from '../components/OfficialSlipGajiDocument';
import { showAppAlert, showAppConfirm } from '../utils/dialogService';
import { EditPresensiModal } from '../components/EditPresensiModal';
import { getEffectiveTodayISO, sanitizeDateString } from '../services/googleSheetsHelper';

interface HitungRekapHonorViewProps {
  employees: Employee[];
  servers: ServerData[];
  wilayahList: WilayahPekerjaan[];
  jenisList: JenisPekerjaan[];
  jobs: JobRecord[];
  attendance: AttendanceRecord[];
  potonganManualList?: PotonganManual[];
  onSavePotonganManual?: (potongan: PotonganManual) => void;
  onDeletePotonganManual?: (id: string) => void;
  honorLunasList?: HonorLunasRecord[];
  onSaveHonorLunas?: (settlements: HonorLunasRecord[], updatedJobs: JobRecord[], updatedPotongan: PotonganManual[]) => Promise<void> | void;
  onDeleteHonorLunas?: (settlementId: string) => Promise<void> | void;
  onSyncDatabase?: () => Promise<void> | void;
  settings?: AppSettings;
  currentUser?: Employee | null;
  initialTab?: 'rekap' | 'pekerjaan' | 'potongan' | 'riwayat_lunas';
  onUpdateAttendance?: (record: AttendanceRecord) => Promise<any> | void;
  onNavigateAbsenManual?: () => void;
}

type DatePreset = 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days' | 'all' | 'custom';

const HitungRekapHonorViewComponent: React.FC<HitungRekapHonorViewProps> = ({
  employees,
  servers,
  wilayahList,
  jenisList,
  jobs,
  attendance,
  potonganManualList = [],
  onSavePotonganManual,
  onDeletePotonganManual,
  honorLunasList = [],
  onSaveHonorLunas,
  onDeleteHonorLunas,
  onSyncDatabase,
  settings,
  currentUser,
  initialTab = 'rekap',
  onUpdateAttendance,
  onNavigateAbsenManual
}) => {
  const [editingPresensiRecord, setEditingPresensiRecord] = useState<AttendanceRecord | null>(null);

  const handleQuickFixPulang = (emp: Employee, tanggal: string, serverId?: string) => {
    // Look for existing attendance record for this technician on this date
    const existing = attendance.find(a => {
      if (a.tanggal !== tanggal) return false;
      if (a.teknisiId === emp.id) return true;
      if (a.teknisiNama && emp.namaLengkap && a.teknisiNama.toLowerCase().trim() === emp.namaLengkap.toLowerCase().trim()) return true;
      return false;
    });

    if (existing) {
      setEditingPresensiRecord(existing);
    } else {
      const targetServer = servers.find(s => s.id === serverId) || servers[0];
      const newRecord: AttendanceRecord = {
        id: `att-${Date.now()}`,
        tanggal: tanggal,
        teknisiId: emp.id,
        teknisiNama: emp.namaLengkap,
        jamMasuk: '08:00',
        jamPulang: '17:00',
        serverId: targetServer ? targetServer.id : '',
        serverNama: targetServer ? targetServer.namaServer : '',
        status: 'Hadir',
        isApproved: true,
        needsApproval: false,
        potonganOtomatis: 0,
        keteranganPulang: 'Absen pulang diinput manual oleh Admin dari Rekap Honor'
      };
      setEditingPresensiRecord(newRecord);
    }
  };

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

  // 1. Filter States
  const [activePreset, setActivePreset] = useState<DatePreset>('this_month');
  
  // Default date range: current month dynamically calculated
  const [startDate, setStartDate] = useState<string>(() => {
    const today = getEffectiveTodayISO();
    return `${today.substring(0, 7)}-01`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });

  // Filter per server & per teknisi (locked to assigned server if PJ Server)
  const [selectedServerId, setSelectedServerId] = useState<string>(
    isPjServer && userServer ? userServer.id : 'all'
  );
  const [selectedTeknisiId, setSelectedTeknisiId] = useState<string>('all');

  React.useEffect(() => {
    if (isPjServer && userServer) {
      setSelectedServerId(userServer.id);
    }
  }, [isPjServer, userServer]);

  // Active view tab: 'rekap' (per teknisi) vs 'pekerjaan' (data jobs) vs 'potongan' (kasbon / potongan manual) vs 'riwayat_lunas' (riwayat honor lunas)
  const [activeTab, setActiveTab] = useState<'rekap' | 'pekerjaan' | 'potongan' | 'riwayat_lunas'>(initialTab || 'rekap');

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Modal & Download states
  const [selectedPayrollModal, setSelectedPayrollModal] = useState<PayrollRecap | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDownloadingSingleSlip, setIsDownloadingSingleSlip] = useState(false);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);

  // Modal Potongan Manual / Kasbon
  const [isModalPotonganOpen, setIsModalPotonganOpen] = useState(false);
  const [editingPotongan, setEditingPotongan] = useState<PotonganManual | null>(null);
  const [formKaryawanId, setFormKaryawanId] = useState<string>('');
  const [formServerId, setFormServerId] = useState<string>('');
  const [formTanggal, setFormTanggal] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formJenis, setFormJenis] = useState<string>('Kasbon');
  const [formNominal, setFormNominal] = useState<string>('');
  const [formKeterangan, setFormKeterangan] = useState<string>('');
  const [searchPotonganQuery, setSearchPotonganQuery] = useState<string>('');

  // Modal & States for "Lunaskan Honor"
  const [isModalSettleOpen, setIsModalSettleOpen] = useState(false);
  const [settleTanggal, setSettleTanggal] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [settleNominalMap, setSettleNominalMap] = useState<Record<string, string>>({});
  const [settleCatatan, setSettleCatatan] = useState<string>('');
  const [isSettlingHonor, setIsSettlingHonor] = useState(false);
  const [searchRiwayatLunasQuery, setSearchRiwayatLunasQuery] = useState<string>('');
  const [showAllRiwayat, setShowAllRiwayat] = useState<boolean>(true);
  const [selectedSettlementDetail, setSelectedSettlementDetail] = useState<HonorLunasRecord | null>(null);

  // Open Add Potongan Modal
  const handleOpenAddPotonganModal = (defaultTeknisiId?: string) => {
    setEditingPotongan(null);
    const techId = defaultTeknisiId || (selectedTeknisiId !== 'all' ? selectedTeknisiId : (eligibleEmployees[0]?.id || ''));
    setFormKaryawanId(techId);

    if (isPjServer && userServer) {
      setFormServerId(userServer.id);
    } else if (selectedServerId !== 'all') {
      setFormServerId(selectedServerId);
    } else {
      const empObj = employees.find(e => e.id === techId);
      setFormServerId(empObj?.serverId || servers[0]?.id || '');
    }

    setFormTanggal(new Date().toISOString().slice(0, 10));
    setFormJenis('Kasbon');
    setFormNominal('');
    setFormKeterangan('');
    setIsModalPotonganOpen(true);
  };

  // Open Edit Potongan Modal
  const handleOpenEditPotonganModal = (item: PotonganManual) => {
    setEditingPotongan(item);
    setFormKaryawanId(item.karyawanId);
    setFormServerId(item.serverId);
    setFormTanggal(item.tanggal);
    setFormJenis(item.jenisPotongan || 'Kasbon');
    setFormNominal(String(item.nominal));
    setFormKeterangan(item.keterangan || '');
    setIsModalPotonganOpen(true);
  };

  // Submit Potongan Manual Form
  const handleSavePotonganForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDigits = formNominal.replace(/[^0-9]/g, '');
    const nominalNum = Number(cleanDigits) || 0;

    if (!formKaryawanId) {
      showAppAlert({ title: 'Pilih Teknisi', message: 'Silakan pilih teknisi/karyawan yang bersangkutan.', type: 'warning' });
      return;
    }
    if (!formServerId) {
      showAppAlert({ title: 'Pilih Server', message: 'Silakan pilih server yang mengeluarkan kasbon/potongan.', type: 'warning' });
      return;
    }
    if (nominalNum <= 0) {
      showAppAlert({ title: 'Nominal Tidak Valid', message: 'Nominal potongan manual harus lebih besar dari Rp 0.', type: 'warning' });
      return;
    }

    const empObj = employees.find(e => e.id === formKaryawanId);
    const srvObj = servers.find(s => s.id === formServerId);

    const record: PotonganManual = {
      id: editingPotongan ? editingPotongan.id : `potongan-${Date.now()}`,
      tanggal: formTanggal,
      karyawanId: formKaryawanId,
      karyawanNama: empObj ? empObj.namaLengkap : formKaryawanId,
      serverId: formServerId,
      serverNama: srvObj ? srvObj.namaServer : formServerId,
      jenisPotongan: formJenis,
      nominal: nominalNum,
      keterangan: formKeterangan.trim(),
      createdAt: editingPotongan?.createdAt || new Date().toISOString(),
      createdById: currentUser?.id,
      createdByNama: currentUser?.namaLengkap || 'Admin'
    };

    if (onSavePotonganManual) {
      onSavePotonganManual(record);
    }
    setIsModalPotonganOpen(false);
    showAppAlert({
      title: editingPotongan ? 'Potongan Diperbarui' : 'Potongan Berhasil Dicatat',
      message: `Potongan ${record.jenisPotongan} sebesar ${formatRupiah(nominalNum)} untuk ${record.karyawanNama} pada server ${record.serverNama} telah otomatis memotong honor tetap pada rekap gaji.`,
      type: 'success'
    });
  };

  // Delete Potongan Confirmation
  const handleDeletePotongan = async (id: string, namaKaryawan: string, nominal: number) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Potongan Manual?',
      message: `Hapus catatan potongan ${formatRupiah(nominal)} untuk teknisi ${namaKaryawan}? Honor tetap karyawan akan kembali normal seperti semula.`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });
    if (confirmed && onDeletePotonganManual) {
      onDeletePotonganManual(id);
      showAppAlert({
        title: 'Berhasil Dihapus',
        message: 'Catatan potongan manual berhasil dihapus.',
        type: 'success'
      });
    }
  };

  // Apply date preset helpers
  const handleApplyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'this_month') {
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(lastDay.toISOString().slice(0, 10));
    } else if (preset === 'last_month') {
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(lastDay.toISOString().slice(0, 10));
    } else if (preset === 'last_7_days') {
      const past = new Date(now);
      past.setDate(now.getDate() - 7);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'last_30_days') {
      const past = new Date(now);
      past.setDate(now.getDate() - 30);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'all') {
      setStartDate('2025-01-01');
      setEndDate('2030-12-31');
    }
  };

  const handleResetFilters = () => {
    handleApplyPreset('this_month');
    setSelectedServerId(isPjServer && userServer ? userServer.id : 'all');
    setSelectedTeknisiId('all');
  };

  // Alphabetically sorted dropdown lists (only employees with role 'Teknisi' receive honor/gaji)
  const eligibleEmployees = useMemo(
    () => employees.filter(e => e.role === 'Teknisi'),
    [employees]
  );
  const sortedServers = useMemo(
    () => [...servers].sort((a, b) => a.namaServer.localeCompare(b.namaServer, 'id', { sensitivity: 'base' })),
    [servers]
  );
  const sortedEmployees = useMemo(
    () => [...eligibleEmployees].sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap, 'id', { sensitivity: 'base' })),
    [eligibleEmployees]
  );

  // Filtered list of technicians (PJS and Admin excluded from honor recap)
  const displayedEmployees = useMemo(() => {
    if (selectedTeknisiId === 'all') {
      return eligibleEmployees;
    }
    return eligibleEmployees.filter(emp => emp.id === selectedTeknisiId);
  }, [eligibleEmployees, selectedTeknisiId]);

  // Compute payroll for filtered technicians according to date range & server (pass honorLunasList & employees)
  const payrollList: PayrollRecap[] = useMemo(() => {
    return displayedEmployees.map(emp =>
      calculatePayrollForEmployee(
        emp,
        servers,
        wilayahList,
        jenisList,
        jobs,
        attendance,
        {
          startDate,
          endDate,
          serverId: selectedServerId
        },
        potonganManualList,
        settings,
        honorLunasList,
        employees
      )
    );
  }, [displayedEmployees, servers, wilayahList, jenisList, jobs, attendance, startDate, endDate, selectedServerId, potonganManualList, settings, honorLunasList, employees]);

  // Set of settled job IDs and potongan IDs mapped per technician
  const settledJobIdsByTechMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (honorLunasList || []).forEach(hl => {
      if (!hl.isParsial && hl.teknisiId && hl.jobIds && Array.isArray(hl.jobIds)) {
        if (!map.has(hl.teknisiId)) map.set(hl.teknisiId, new Set());
        const set = map.get(hl.teknisiId)!;
        hl.jobIds.forEach(id => { if (id) set.add(id); });
      }
    });
    return map;
  }, [honorLunasList]);

  const settledPotonganIdsByTechMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (honorLunasList || []).forEach(hl => {
      if (!hl.isParsial && hl.teknisiId && hl.potonganIds && Array.isArray(hl.potonganIds)) {
        if (!map.has(hl.teknisiId)) map.set(hl.teknisiId, new Set());
        const set = map.get(hl.teknisiId)!;
        hl.potonganIds.forEach(id => { if (id) set.add(id); });
      }
    });
    return map;
  }, [honorLunasList]);

  // Filtered potongan manual according to date range, server, and technician (unsettled only for this technician)
  const filteredPotongan = useMemo(() => {
    return (potonganManualList || []).filter(p => {
      const settledPotSet = settledPotonganIdsByTechMap.get(p.karyawanId);
      if (settledPotSet && settledPotSet.has(p.id)) return false;
      if (p.isLunas || p.honorLunasId) return false;

      const d = (p.tanggal || '').slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      if (selectedServerId !== 'all') {
        const s = servers.find(x => x.id === selectedServerId);
        const matches = s
          ? (p.serverId === s.id || (p.serverNama && p.serverNama.toLowerCase().trim() === s.namaServer.toLowerCase().trim()))
          : (p.serverId === selectedServerId);
        if (!matches) return false;
      }
      if (selectedTeknisiId !== 'all' && p.karyawanId !== selectedTeknisiId) return false;
      if (searchPotonganQuery.trim()) {
        const q = searchPotonganQuery.toLowerCase().trim();
        const matchName = (p.karyawanNama || '').toLowerCase().includes(q);
        const matchServer = (p.serverNama || '').toLowerCase().includes(q);
        const matchKet = (p.keterangan || '').toLowerCase().includes(q);
        const matchJenis = (p.jenisPotongan || '').toLowerCase().includes(q);
        if (!matchName && !matchServer && !matchKet && !matchJenis) return false;
      }
      return true;
    });
  }, [potonganManualList, startDate, endDate, selectedServerId, selectedTeknisiId, searchPotonganQuery, servers, settledPotonganIdsByTechMap]);

  const grandTotalPotonganManual = useMemo(() => {
    return filteredPotongan.reduce((sum, p) => sum + (Number(p.nominal) || 0), 0);
  }, [filteredPotongan]);

  // Filter jobs according to date range, server, technician and settlement status
  // PENTING: Pekerjaan multi-teknisi tetap aktif untuk teknisi yang belum dilunaskan honornya
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Exclude settled jobs specific to technician context
      if (selectedTeknisiId !== 'all') {
        const settledSet = settledJobIdsByTechMap.get(selectedTeknisiId);
        if (settledSet && settledSet.has(job.id)) return false;
      } else {
        // Jika filter semua teknisi, pekerjaan hanya disembunyikan jika SEMUA teknisi yang bertugas sudah dilunaskan
        const techList = job.teknisiIds || [];
        if (techList.length > 0) {
          const isFullySettledForAllTechs = techList.every(tId => {
            const settledSet = settledJobIdsByTechMap.get(tId);
            return settledSet && settledSet.has(job.id);
          });
          if (isFullySettledForAllTechs) return false;
        }
      }

      const d = (job.tanggal || '').slice(0, 10);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      if (selectedServerId !== 'all') {
        const s = servers.find(x => x.id === selectedServerId);
        const matches = s
          ? (job.serverId === s.id || job.serverId === s.namaServer || (job.namaServer && job.namaServer.toLowerCase().trim() === s.namaServer.toLowerCase().trim()))
          : (job.serverId === selectedServerId || (job.namaServer && job.namaServer.toLowerCase().trim() === selectedServerId.toLowerCase().trim()));
        if (!matches) return false;
      }
      if (selectedTeknisiId !== 'all') {
        if (!job.teknisiIds.includes(selectedTeknisiId)) return false;
        // PENTING SESUAI ATURAN SISTEM:
        // 1. Teknisi yang tidak melakukan absen pulang tidak akan dihitung pada rekap gaji & pekerjaan.
        // 2. Teknisi yang absen lewat dari jam masuk + toleransi perlu approval Admin sebelum honor masuk ke rekap gaji.
        const emp = employees.find(e => e.id === selectedTeknisiId);
        if (emp) {
          const hasPulang = checkTechnicianHasPulang(emp, job.tanggal, attendance);
          if (!hasPulang) return false;
          const attApproval = checkTechnicianAttendanceApproved(emp, job.tanggal, attendance, settings);
          if (!attApproval.isEligible) return false;
        }
      }
      return true;
    });
  }, [jobs, startDate, endDate, selectedServerId, selectedTeknisiId, servers, employees, attendance, settings, settledJobIdsByTechMap]);

  // Filtered Riwayat Honor Lunas
  const filteredRiwayatLunas = useMemo(() => {
    return (honorLunasList || []).filter(hl => {
      // Filter Tanggal (jika tidak memilih Tampilkan Semua Riwayat)
      if (!showAllRiwayat && (startDate || endDate)) {
        const tglLunas = (hl.tanggalLunas || '').slice(0, 10);
        const inTglLunas = (!startDate || tglLunas >= startDate) && (!endDate || tglLunas <= endDate);
        const inPeriodOverlap = (!startDate || !hl.periodeAkhir || hl.periodeAkhir >= startDate) && (!endDate || !hl.periodeAwal || hl.periodeAwal <= endDate);
        if (!inTglLunas && !inPeriodOverlap) return false;
      }

      if (selectedServerId !== 'all') {
        const s = servers.find(x => x.id === selectedServerId);
        const targetName = s ? s.namaServer.toLowerCase().trim() : selectedServerId.toLowerCase().trim();
        const hlServerName = (hl.namaServer || '').toLowerCase().trim();
        const hlServerId = (hl.serverId || '').toLowerCase().trim();
        
        const isAllServerSettled = hlServerId === 'all' || hlServerName === 'semua server' || !hlServerId;
        const isServerMatched = (s && hlServerId === s.id.toLowerCase().trim()) ||
          hlServerName === targetName ||
          hlServerId === selectedServerId.toLowerCase().trim();

        if (!isAllServerSettled && !isServerMatched) return false;
      }

      if (selectedTeknisiId !== 'all') {
        const emp = employees.find(e => e.id === selectedTeknisiId);
        const empName = emp ? emp.namaLengkap.toLowerCase().trim() : '';
        const hlEmpName = (hl.teknisiNama || '').toLowerCase().trim();
        const matchId = hl.teknisiId === selectedTeknisiId;
        const matchName = Boolean(empName && hlEmpName === empName);
        if (!matchId && !matchName) return false;
      }

      if (searchRiwayatLunasQuery.trim()) {
        const q = searchRiwayatLunasQuery.toLowerCase().trim();
        const matchName = (hl.teknisiNama || '').toLowerCase().includes(q);
        const matchServer = (hl.namaServer || '').toLowerCase().includes(q);
        const matchKet = (hl.catatan || '').toLowerCase().includes(q);
        const matchOleh = (hl.dilunaskanOleh || '').toLowerCase().includes(q);
        const matchTgl = (hl.tanggalLunas || '').toLowerCase().includes(q);
        if (!matchName && !matchServer && !matchKet && !matchOleh && !matchTgl) return false;
      }
      return true;
    });
  }, [honorLunasList, showAllRiwayat, startDate, endDate, selectedServerId, selectedTeknisiId, searchRiwayatLunasQuery, servers, employees]);

  const totalSettledAmount = useMemo(() => {
    return filteredRiwayatLunas.reduce((sum, hl) => sum + (Number(hl.totalHonorNett) || 0), 0);
  }, [filteredRiwayatLunas]);

  // Summary Metrics
  const grandTotalPayroll = useMemo(() => {
    return payrollList.reduce((sum, p) => sum + p.totalHonorNett, 0);
  }, [payrollList]);

  // Count eligible technicians who have pending honor
  const eligibleSettlementRecaps = useMemo(() => {
    return payrollList.filter(p => p.totalHonorNett > 0 || p.totalPekerjaanCount > 0 || p.honorTetapServer > 0);
  }, [payrollList]);

  const grandTotalTitik = useMemo(() => {
    return filteredJobs.reduce((sum, j) => sum + (j.jumlahTitik || 0), 0);
  }, [filteredJobs]);

  const grandTotalKabel = useMemo(() => {
    return filteredJobs.reduce((sum, j) => sum + (j.panjangKabelMeter || 0), 0);
  }, [filteredJobs]);

  // Names of selected filters for display
  const selectedServerName = useMemo(() => {
    if (selectedServerId === 'all') return 'Semua Server';
    const s = servers.find(x => x.id === selectedServerId);
    return s ? s.namaServer : selectedServerId;
  }, [selectedServerId, servers]);

  const selectedTeknisiName = useMemo(() => {
    if (selectedTeknisiId === 'all') return 'Semua Teknisi';
    const e = employees.find(x => x.id === selectedTeknisiId);
    return e ? `${e.namaLengkap} (${e.status})` : selectedTeknisiId;
  }, [selectedTeknisiId, employees]);

  // Buka Modal Konfirmasi Lunaskan Honor
  const handleOpenSettleModal = () => {
    if (eligibleSettlementRecaps.length === 0 || grandTotalPayroll <= 0) {
      showAppAlert({
        title: 'Tidak Ada Honor yang Perlu Dilunaskan',
        message: 'Tidak ada honor teknisi bernilai lebih dari Rp 0 pada filter rentang tanggal, server, dan teknisi yang dipilih saat ini.',
        type: 'info'
      });
      return;
    }
    setSettleTanggal(new Date().toISOString().slice(0, 10));
    const initialNominalMap: Record<string, string> = {};
    eligibleSettlementRecaps.forEach(rec => {
      initialNominalMap[rec.teknisiId] = rec.totalHonorNett.toLocaleString('id-ID');
    });
    setSettleNominalMap(initialNominalMap);
    setSettleCatatan(`Pelunasan Honor Periode ${startDate} s/d ${endDate} (${selectedServerName})`);
    setIsModalSettleOpen(true);
  };

  // Hitung total nominal yang dilunaskan dari input form modal
  const modalTotalNominalDilunasi = useMemo(() => {
    return eligibleSettlementRecaps.reduce((sum, rec) => {
      const rawVal = settleNominalMap[rec.teknisiId];
      if (rawVal !== undefined && rawVal.trim().length > 0) {
        const num = Number(rawVal.replace(/[^0-9]/g, '')) || 0;
        return sum + num;
      }
      return sum + rec.totalHonorNett;
    }, 0);
  }, [eligibleSettlementRecaps, settleNominalMap]);

  // Eksekusi Pelunasan Honor: Tandai pekerjaan & potongan lunas, simpan ke HonorLunas & Google Sheets
  const handleExecuteLunaskanHonor = async () => {
    if (!onSaveHonorLunas) return;
    try {
      setIsSettlingHonor(true);
      const todayISO = settleTanggal || getEffectiveTodayISO();
      const nowISO = new Date().toISOString();
      const settlementBatchId = `batch-${Date.now()}`;

      const newSettlements: HonorLunasRecord[] = [];
      const updatedJobIdSet = new Set<string>();
      const updatedPotonganIdSet = new Set<string>();

      eligibleSettlementRecaps.forEach(recap => {
        const rawNominal = settleNominalMap[recap.teknisiId];
        const nominalPaid = rawNominal !== undefined && rawNominal.trim().length > 0
          ? (Number(rawNominal.replace(/[^0-9]/g, '')) || 0)
          : recap.totalHonorNett;

        if (nominalPaid <= 0) return; // Lewati jika tidak ada pembayaran

        const totalTagihan = recap.totalHonorNett;
        const isParsial = nominalPaid < totalTagihan;
        const sisaHonor = Math.max(0, totalTagihan - nominalPaid);

        // Kumpulkan pekerjaan teknisi ini yang masuk dalam filter saat ini
        const techJobs = filteredJobs.filter(j => j.teknisiIds && j.teknisiIds.includes(recap.teknisiId));
        const techJobIds = techJobs.map(j => j.id);

        // Jika pelunasan penuh, tandai pekerjaan dan potongan sebagai lunas
        if (!isParsial) {
          techJobIds.forEach(id => updatedJobIdSet.add(id));
          const techPotongan = filteredPotongan.filter(p => p.karyawanId === recap.teknisiId);
          techPotongan.map(p => p.id).forEach(id => updatedPotonganIdSet.add(id));
        }

        const recordId = `hl-${Date.now()}-${recap.teknisiId}`;
        const hlRecord: HonorLunasRecord = {
          id: recordId,
          tanggalLunas: todayISO,
          periodeAwal: startDate,
          periodeAkhir: endDate,
          serverId: selectedServerId,
          namaServer: selectedServerName,
          teknisiId: recap.teknisiId,
          teknisiNama: recap.teknisiNama,
          statusKaryawan: recap.statusKaryawan,
          jobCount: recap.totalPekerjaanCount,
          totalPekerjaanCount: recap.totalPekerjaanCount,
          honorTetapServer: recap.honorTetapServer,
          honorPJWilayah: recap.honorPJWilayah,
          honorDasarPekerjaan: recap.honorDasarPekerjaan,
          honorTitik: recap.honorTitik,
          honorPanjangKabel: recap.honorPanjangKabel,
          honorLembur: recap.honorLembur,
          honorTransportKendaraan: recap.honorTransportKendaraan,
          bonusTarget: recap.bonusTarget,
          potonganTerlambatAbsen: recap.potonganTerlambatAbsen,
          potonganManualKasbon: recap.potonganManualKasbon,
          totalHonorGross: recap.totalHonorGross,
          totalPotongan: recap.totalPotongan,
          totalTagihanAwal: totalTagihan,
          totalHonorNett: nominalPaid,
          sisaHonor: sisaHonor,
          isParsial: isParsial,
          catatan: settleCatatan.trim() || (isParsial ? `Pelunasan Sebagian Honor (${formatRupiah(nominalPaid)} dari ${formatRupiah(totalTagihan)}) Periode ${startDate} s/d ${endDate}` : `Pelunasan Penuh Honor Periode ${startDate} s/d ${endDate}`),
          dilunaskanOleh: currentUser?.namaLengkap || 'Admin',
          dilunaskanAt: nowISO,
          waktuPelunasan: nowISO,
          jobIds: techJobIds,
          potonganIds: !isParsial ? filteredPotongan.filter(p => p.karyawanId === recap.teknisiId).map(p => p.id) : []
        };
        newSettlements.push(hlRecord);
      });

      if (newSettlements.length === 0) {
        showAppAlert({
          title: 'Nominal Tidak Valid',
          message: 'Nominal honor yang dilunaskan harus lebih besar dari Rp 0.',
          type: 'warning'
        });
        setIsSettlingHonor(false);
        return;
      }

      // Tandai pekerjaan yang dilunaskan penuh (hanya jika seluruh teknisi pada job tersebut sudah dilunaskan)
      const updatedJobs = jobs.map(j => {
        if (updatedJobIdSet.has(j.id)) {
          const allTechsSettled = (j.teknisiIds || []).every(tId => {
            const isSettlingNow = newSettlements.some(ns => ns.teknisiId === tId && !ns.isParsial);
            const wasAlreadySettled = (honorLunasList || []).some(hl => hl.teknisiId === tId && !hl.isParsial && hl.jobIds?.includes(j.id));
            return isSettlingNow || wasAlreadySettled;
          });
          if (allTechsSettled) {
            return {
              ...j,
              isHonorLunas: true,
              honorLunasId: settlementBatchId,
              honorLunasAt: nowISO
            };
          }
        }
        return j;
      });

      // Tandai potongan kasbon yang dilunaskan penuh
      const updatedPotongan = (potonganManualList || []).map(p => {
        if (updatedPotonganIdSet.has(p.id)) {
          return {
            ...p,
            isLunas: true,
            honorLunasId: settlementBatchId
          };
        }
        return p;
      });

      await onSaveHonorLunas(newSettlements, updatedJobs, updatedPotongan);

      setIsModalSettleOpen(false);
      showAppAlert({
        title: 'Honor Berhasil Dilunaskan!',
        message: `Berhasil melunaskan honor untuk ${newSettlements.length} teknisi dengan total ${formatRupiah(modalTotalNominalDilunasi)} pada tanggal ${todayISO}.\n\nData telah dicatat ke sheet HonorLunas pada Google Sheets dan secara otomatis honor yang sudah dilunaskan tidak akan masuk pada hitungan rekap lagi.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Gagal melunaskan honor:', err);
      showAppAlert({
        title: 'Gagal Melunaskan Honor',
        message: `Terjadi kendala saat memproses pelunasan: ${err.message || 'Silakan coba lagi'}`,
        type: 'error'
      });
    } finally {
      setIsSettlingHonor(false);
    }
  };

  // Batalkan / Rollback pelunasan honor
  const handleDeleteSettlement = async (settlement: HonorLunasRecord) => {
    const confirmed = await showAppConfirm({
      title: 'Batalkan Pelunasan Honor?',
      message: `Batalkan status lunas untuk ${settlement.teknisiNama} (Periode ${settlement.periodeAwal} s/d ${settlement.periodeAkhir}, Total ${formatRupiah(settlement.totalHonorNett)})?\n\nHonor pekerjaan dan kasbon terkait akan kembali aktif dan masuk ke hitungan rekap honor.`,
      type: 'warning',
      confirmText: 'Ya, Batalkan Pelunasan',
      cancelText: 'Kembali'
    });

    if (confirmed && onDeleteHonorLunas) {
      await onDeleteHonorLunas(settlement.id);
      if (onSyncDatabase) {
        await onSyncDatabase();
      }
      showAppAlert({
        title: 'Pelunasan Dibatalkan',
        message: 'Status pelunasan honor berhasil dibatalkan. Pekerjaan telah kembali ke daftar hitung rekap honor aktif.',
        type: 'success'
      });
    }
  };

  // Handle Download PDF Resmi with Kop Perusahaan
  const handleDownloadPdfReport = async () => {
    try {
      setIsGeneratingPdf(true);
      setPdfSuccessMessage(null);

      let labelPreset = 'Kustom';
      if (activePreset === 'this_month') labelPreset = 'Bulan Berjalan';
      else if (activePreset === 'last_month') labelPreset = 'Bulan Lalu';
      else if (activePreset === 'last_7_days') labelPreset = '7 Hari Terakhir';
      else if (activePreset === 'last_30_days') labelPreset = '30 Hari Terakhir';
      else if (activePreset === 'all') labelPreset = 'Semua Riwayat';

      await generateJobHonorPdfReport({
        jobs: filteredJobs,
        payrollList,
        settings,
        servers,
        employees: eligibleEmployees,
        dateRange: {
          startDate,
          endDate,
          label: labelPreset
        },
        filterServerId: selectedServerId,
        filterServerName: selectedServerName,
        filterTeknisiName: selectedTeknisiName
      });

      setPdfSuccessMessage('Laporan PDF resmi dengan kop perusahaan berhasil diunduh!');
      setTimeout(() => setPdfSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Gagal membuat laporan PDF:', err);
      showAppAlert({
        title: 'Gagal Membuat PDF',
        message: 'Terjadi kesalahan saat membuat file PDF. Silakan coba lagi.',
        type: 'error'
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Download individual slip PDF
  const handleDownloadSingleSlipPdf = async (recap: PayrollRecap) => {
    try {
      setIsDownloadingSingleSlip(true);
      await generateIndividualSlipPdf({
        recap,
        settings,
        servers,
        employees,
        filterServerId: selectedServerId,
        filterServerName: selectedServerName
      });
    } catch (err) {
      console.error('Gagal membuat PDF slip:', err);
      showAppAlert({
        title: 'Gagal Download Slip',
        message: 'Terjadi kesalahan saat memproses file slip PDF.',
        type: 'error'
      });
    } finally {
      setIsDownloadingSingleSlip(false);
    }
  };

  // Signature info for individual slip
  const slipSignInfo = useMemo(() => {
    if (!selectedPayrollModal) return { roleTitle: 'Pimpinan / Penanggung Jawab Server', personName: 'Bendahara' };
    const cleanFilterServerName = (selectedServerName || '').trim();
    const cleanFilterServerId = (selectedServerId || '').trim();
    const isAllServers = !cleanFilterServerId || cleanFilterServerId === 'all' || cleanFilterServerName.toLowerCase() === 'semua server';

    if (isAllServers) {
      const bendaharaEmp = employees?.find(e => 
        e.namaLengkap.toLowerCase().includes('bendahara') || 
        e.username?.toLowerCase().includes('bendahara')
      );
      return {
        roleTitle: 'Manager Keuangan',
        personName: bendaharaEmp?.namaLengkap || 'Bendahara'
      };
    }

    let targetServer: ServerData | undefined = undefined;
    if (cleanFilterServerId && cleanFilterServerId !== 'all') {
      targetServer = servers?.find(s => s.id === cleanFilterServerId);
    }
    if (!targetServer && cleanFilterServerName && cleanFilterServerName.toLowerCase() !== 'semua server') {
      targetServer = servers?.find(s => 
        s.namaServer.toLowerCase().trim() === cleanFilterServerName.toLowerCase() ||
        s.id.toLowerCase().trim() === cleanFilterServerName.toLowerCase()
      );
    }
    let pjName = '';
    if (targetServer) {
      if (targetServer.penanggungJawabNama && targetServer.penanggungJawabNama.trim()) {
        pjName = targetServer.penanggungJawabNama.trim();
      } else if (targetServer.penanggungJawabId && employees) {
        const emp = employees.find(e => 
          e.id === targetServer!.penanggungJawabId || 
          e.namaLengkap.toLowerCase().trim() === targetServer!.penanggungJawabId.toLowerCase().trim()
        );
        if (emp) pjName = emp.namaLengkap;
      }
    }
    return {
      roleTitle: targetServer ? `Pimpinan / Penanggung Jawab Server ${targetServer.namaServer}` : 'Pimpinan / Penanggung Jawab Server',
      personName: pjName || 'Pimpinan / Penanggung Jawab Server'
    };
  }, [selectedPayrollModal, selectedServerId, selectedServerName, servers, employees]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Nama Teknisi',
      'Status',
      'Total Jobs',
      'Honor Tetap Server',
      'Honor PJ Wilayah',
      'Honor Dasar Pekerjaan',
      'Honor Titik',
      'Honor Kabel',
      'Honor Lembur',
      'Honor Transport Kendaraan',
      'Bonus Target',
      'Potongan Absen',
      'Total Honor Nett'
    ];

    const rows = payrollList.map(p => [
      `"${p.teknisiNama}"`,
      p.statusKaryawan,
      p.totalPekerjaanCount,
      p.honorTetapServer,
      p.honorPJWilayah,
      p.honorDasarPekerjaan,
      p.honorTitik,
      p.honorPanjangKabel,
      p.honorLembur,
      p.honorTransportKendaraan,
      p.bonusTarget,
      p.potonganTerlambatAbsen,
      p.totalHonorNett
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_honor_dpt_aladin_${startDate}_sd_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isFiltered =
    activePreset !== 'this_month' ||
    (!isPjServer && selectedServerId !== 'all') ||
    selectedTeknisiId !== 'all';

  return (
    <div className="space-y-5 pb-20">
      {/* 1. Header Title & Main Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-maroon-50 text-maroon-800 rounded-xl">
              <Calculator className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Hitung & Rekapitulasi Honor Teknisi
            </h2>
          </div>
        </div>

        {/* Action Buttons: Lunaskan Honor, Potongan Manual, PDF Resmi & Export CSV */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Button Lunaskan Honor (Lunas Dibayar) */}
          {currentUser?.role !== 'Teknisi' && (
            <button
              id="btn-lunaskan-honor"
              onClick={handleOpenSettleModal}
              disabled={grandTotalPayroll <= 0 && filteredJobs.length === 0}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Tandai dan lunaskan semua honor sesuai filter tanggal, server, dan teknisi. Data akan disimpan di sheet HonorLunas dan tidak akan terhitung ulang."
            >
              <CheckCheck className="w-4 h-4 text-emerald-100" />
              <span>Lunaskan Honor</span>
              <span className="text-[10px] bg-emerald-800/80 text-emerald-100 px-1.5 py-0.2 rounded-full font-extrabold">
                Lunas Dibayar
              </span>
            </button>
          )}

          {/* Button Potongan Manual / Kasbon */}
          <button
            id="btn-tambah-potongan-manual"
            onClick={() => handleOpenAddPotonganModal()}
            className="py-2.5 px-3.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 active:bg-rose-200 text-rose-700 font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
            title="Catat pemotongan manual atau kasbon karyawan pada server tertentu (otomatis memotong honor tetap)"
          >
            <MinusCircle className="w-4 h-4 text-rose-600" />
            <span>Potongan Manual / Kasbon</span>
            {filteredPotongan.length > 0 && (
              <span className="text-[10px] bg-rose-600 text-white font-extrabold px-1.5 py-0.2 rounded-full">
                {filteredPotongan.length}
              </span>
            )}
          </button>

          {/* Download Official PDF Report */}
          <button
            id="btn-download-pdf-laporan"
            onClick={handleDownloadPdfReport}
            disabled={isGeneratingPdf}
            className="py-2.5 px-4 bg-maroon-800 hover:bg-maroon-900 active:bg-maroon-950 text-white font-bold text-xs rounded-xl shadow-sm flex items-center space-x-2 transition-all disabled:opacity-50 cursor-pointer"
            title="Download laporan resmi data pekerjaan & honor teknisi lengkap dengan kop surat perusahaan"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Membuat PDF Resmi...</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 text-amber-300" />
                <span>Download Laporan PDF</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-200 border border-amber-400/40 px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">
                  Kop Resmi
                </span>
              </>
            )}
          </button>

          {/* Export CSV */}
          <button
            id="btn-export-csv"
            onClick={handleExportCSV}
            className="py-2.5 px-3.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
            title="Export data rekap honor ke spreadsheet CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          {/* Absen Manual Admin Button */}
          {currentUser?.role === 'Admin' && onNavigateAbsenManual && (
            <button
              onClick={onNavigateAbsenManual}
              className="py-2.5 px-3.5 bg-maroon-800 text-white font-bold text-xs rounded-xl hover:bg-maroon-900 shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Buka menu Absen Manual untuk menyelesaikan teknisi yang kendala absen"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Absen Manual</span>
            </button>
          )}
        </div>
      </div>

      {/* Notification Banner on PDF Success */}
      {pdfSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-xs animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{pdfSuccessMessage}</span>
          </div>
          <button
            onClick={() => setPdfSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. FILTER CONTROLS PANEL: Rentang Tanggal, Pilihan Server, Pilihan Teknisi */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-maroon-800" />
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Filter Parameter Laporan & Penggajian
            </h3>
          </div>

          {isFiltered && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-slate-500 hover:text-maroon-800 font-medium flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          {/* 1. Filter Rentang Tanggal (Span 6 cols) */}
          <div className="md:col-span-6 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-maroon-800" />
                <span>Rentang Tanggal:</span>
              </label>

              {/* Quick Preset Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('this_month')}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                    activePreset === 'this_month'
                      ? 'bg-maroon-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('last_month')}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                    activePreset === 'last_month'
                      ? 'bg-maroon-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Bulan Lalu
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('last_7_days')}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                    activePreset === 'last_7_days'
                      ? 'bg-maroon-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('all')}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                    activePreset === 'all'
                      ? 'bg-maroon-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Semua
                </button>
              </div>
            </div>

            {/* Date Inputs: Dari s/d Sampai */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="text-[10px] text-slate-400 absolute left-2.5 top-1 font-semibold">Dari</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setActivePreset('custom');
                  }}
                  className="w-full pt-4 pb-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                />
              </div>
              <div className="relative">
                <span className="text-[10px] text-slate-400 absolute left-2.5 top-1 font-semibold">Sampai</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setActivePreset('custom');
                  }}
                  className="w-full pt-4 pb-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                />
              </div>
            </div>
          </div>

          {/* 2. Filter Pilihan Server (Span 3 cols) - Disembunyikan untuk PJ Server karena otomatis merekap server terkait */}
          {!isPjServer && (
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-maroon-800" />
                <span>Filter Server:</span>
              </label>
              <select
                id="select-filter-server"
                value={selectedServerId}
                onChange={e => setSelectedServerId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
              >
                <option value="all">Semua Server ({servers.length} Lokasi)</option>
                {sortedServers.map(srv => (
                  <option key={srv.id} value={srv.id}>
                    {srv.namaServer} ({srv.alamat || 'Tower'})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 block truncate">
                {selectedServerId === 'all'
                  ? 'Termasuk semua server & BTS'
                  : `Hanya pekerjaan pada server ${selectedServerName}`}
              </span>
            </div>
          )}

          {/* 3. Filter Pilihan Teknisi (Span 3 cols untuk Admin, Span 6 cols untuk PJ Server) */}
          <div className={`${isPjServer ? 'md:col-span-6' : 'md:col-span-3'} space-y-1.5`}>
            <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
              <UserCheck className="w-3.5 h-3.5 text-maroon-800" />
              <span>Filter Teknisi:</span>
            </label>
            <select
              id="select-filter-teknisi"
              value={selectedTeknisiId}
              onChange={e => setSelectedTeknisiId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
            >
              <option value="all">Semua Teknisi ({employees.length} Orang)</option>
              {sortedEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.namaLengkap} — {emp.status}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-400 block truncate">
              {selectedTeknisiId === 'all'
                ? 'Semua data honor teknisi aktif'
                : `Fokus pada teknisi ${selectedTeknisiName}`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Summary Hero Card (Dark Navy / Maroon Theme) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-maroon-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-maroon-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-maroon-300 uppercase tracking-wider bg-maroon-900/50 px-2 py-0.5 rounded-md border border-maroon-800/60">
                TOTAL PENGELUARAN HONOR ({startDate} s/d {endDate})
              </span>
              {selectedServerId !== 'all' && (
                <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-md">
                  Server: {selectedServerName}
                </span>
              )}
              {selectedTeknisiId !== 'all' && (
                <span className="text-[10px] font-semibold bg-indigo-400/20 text-indigo-300 border border-indigo-400/40 px-2 py-0.5 rounded-md">
                  Teknisi: {selectedTeknisiName}
                </span>
              )}
            </div>

            <h3 className="text-3xl sm:text-4xl font-black text-amber-300 tracking-tight">
              {formatRupiah(grandTotalPayroll)}
            </h3>

            <p className="text-xs text-slate-300">
              Akumulasi penggajian untuk {payrollList.length} teknisi terpilih dengan total {filteredJobs.length} pekerjaan lapangan.
            </p>
          </div>

          {/* Quick Metrics Badges */}
          <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-xs space-y-1.5 min-w-[210px]">
            <div className="flex justify-between items-center space-x-3">
              <span className="text-slate-300">Total Pekerjaan:</span>
              <strong className="text-white text-sm font-bold">{filteredJobs.length} Jobs</strong>
            </div>
            <div className="flex justify-between items-center space-x-3 text-[11px]">
              <span className="text-slate-300">Total Titik / Tarik:</span>
              <span className="text-amber-200 font-semibold">{grandTotalTitik} Titik | {grandTotalKabel}m</span>
            </div>
            {grandTotalPotonganManual > 0 && (
              <div className="flex justify-between items-center space-x-3 text-[11px] text-rose-300">
                <span>Total Kasbon / Potongan:</span>
                <span className="font-bold">-{formatRupiah(grandTotalPotonganManual)}</span>
              </div>
            )}
            <div className="flex justify-between items-center space-x-3 pt-1 border-t border-white/10">
              <span className="text-slate-300">Gaji Diterbitkan:</span>
              <strong className="text-emerald-400 font-bold">Siap Ditransfer</strong>
            </div>

            {currentUser?.role !== 'Teknisi' && grandTotalPayroll > 0 && (
              <button
                type="button"
                onClick={handleOpenSettleModal}
                className="w-full mt-2 py-2 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md cursor-pointer"
              >
                <CheckCheck className="w-4 h-4 text-slate-950" />
                <span>Lunaskan Honor Terfilter</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Sub-Navigation Tabs: Rekap per Teknisi vs Data Pekerjaan vs Potongan Manual vs Riwayat Honor Lunas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveTab('rekap')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-maroon-800 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Rincian Rekapitulasi per Teknisi ({payrollList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pekerjaan')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'pekerjaan'
              ? 'bg-maroon-800 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Daftar Data Pekerjaan Lapangan ({filteredJobs.length} Jobs)</span>
        </button>

        <button
          onClick={() => setActiveTab('potongan')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'potongan'
              ? 'bg-rose-700 text-white shadow-xs'
              : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-100'
          }`}
        >
          <MinusCircle className="w-4 h-4" />
          <span>Catatan Potongan Manual & Kasbon ({filteredPotongan.length})</span>
          {grandTotalPotonganManual > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold ${activeTab === 'potongan' ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-700'}`}>
              -{formatRupiah(grandTotalPotonganManual)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('riwayat_lunas')}
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'riwayat_lunas'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat Honor Lunas (Sheet HonorLunas: {honorLunasList?.length || 0})</span>
        </button>
      </div>

      {/* 5. TAB 1: MAIN PAYROLL TABLE (REKAP HONOR PER TEKNISI) */}
      {activeTab === 'rekap' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
              <Calculator className="w-4 h-4 text-maroon-800" />
              <span>Daftar Rekapitulasi Honor Teknisi</span>
              <span className="text-xs font-normal text-slate-500">
                ({startDate} s/d {endDate})
              </span>
            </h3>

            <div className="text-xs text-slate-500 font-medium">
              Menampilkan {payrollList.length} teknisi
            </div>
          </div>

          {/* TAB 1 Content: Mobile Cards & Desktop Table */}
          {payrollList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Calculator className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600">Tidak ada data teknisi yang sesuai dengan filter.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Sesuaikan rentang tanggal atau filter status teknisi.</p>
            </div>
          ) : (
            <div>
              {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
              <div className="block md:hidden divide-y divide-slate-100">
                {payrollList.map(item => {
                  const totalHonorJobs =
                    item.honorDasarPekerjaan +
                    item.honorTitik +
                    item.honorPanjangKabel +
                    item.honorLembur +
                    item.honorTransportKendaraan;
                  const honorServerWilayah = item.honorTetapServer + item.honorPJWilayah;

                  return (
                    <div key={item.teknisiId} className="p-3.5 space-y-3 hover:bg-slate-50/60 transition-colors">
                      {/* Header: Nama Teknisi & Total Jobs */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-black text-slate-900 text-sm leading-tight">{item.teknisiNama}</h4>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded text-[10px]">
                              {item.statusKaryawan}
                            </span>
                          </div>
                          {item.bonusTarget > 0 && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-extrabold">
                              +Bonus Target: {formatRupiah(item.bonusTarget)}
                            </span>
                          )}
                        </div>

                        <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-black shrink-0">
                          {item.totalPekerjaanCount} Jobs
                        </span>
                      </div>

                      {/* Breakdown Financial Grid */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Server & Wilayah</span>
                          <span className="font-extrabold text-slate-900 text-xs">{formatRupiah(honorServerWilayah)}</span>
                          <span className="text-[9px] text-slate-400 block font-medium">
                            (Srv: {formatRupiah(item.honorTetapServer)} + Wil: {formatRupiah(item.honorPJWilayah)})
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Honor Pekerjaan</span>
                          <span className="font-extrabold text-maroon-800 text-xs">{formatRupiah(totalHonorJobs)}</span>
                          <span className="text-[9px] text-slate-400 block font-medium">
                            Dasar + Ttk + Kbl + Lmbr
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Potongan</span>
                          {item.totalPotongan > 0 ? (
                            <div>
                              <span className="font-extrabold text-rose-600 text-xs">-{formatRupiah(item.totalPotongan)}</span>
                              {item.potonganManualKasbon > 0 && (
                                <span className="text-[9px] text-rose-500 block font-semibold">
                                  Kasbon: -{formatRupiah(item.potonganManualKasbon)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">Rp 0</span>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Honor Bersih</span>
                          <span className="font-black text-emerald-600 text-sm block">
                            {formatRupiah(item.totalHonorNett)}
                          </span>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-100">
                        <button
                          onClick={() => handleOpenAddPotonganModal(item.teknisiId)}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl inline-flex items-center space-x-1 transition-colors cursor-pointer text-xs border border-rose-200 shadow-2xs active:scale-95"
                          title={`Catat potongan kasbon untuk ${item.teknisiNama}`}
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                          <span>+ Kasbon</span>
                        </button>
                        <button
                          onClick={() => setSelectedPayrollModal(item)}
                          className="px-3 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white font-bold rounded-xl inline-flex items-center space-x-1.5 transition-colors cursor-pointer text-xs shadow-xs active:scale-95"
                          title="Lihat rincian lengkap slip gaji teknisi"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Rincian Slip</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Smartphone Total Summary Box */}
                <div className="p-3.5 bg-slate-100/90 border-t-2 border-slate-200 text-xs space-y-1.5 font-bold">
                  <div className="flex justify-between items-center text-slate-700">
                    <span>TOTAL AKUMULASI ({filteredJobs.length} Jobs)</span>
                    <span className="text-rose-600 font-extrabold">
                      Potongan: -{formatRupiah(payrollList.reduce((s, p) => s + p.totalPotongan, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 text-sm">
                    <span className="text-slate-900 font-black">Grand Total Nett:</span>
                    <span className="text-emerald-700 font-black text-base">{formatRupiah(grandTotalPayroll)}</span>
                  </div>
                </div>
              </div>

              {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Nama Teknisi</th>
                      <th className="p-3.5">Pekerjaan</th>
                      <th className="p-3.5">Honor Server & Wilayah</th>
                      <th className="p-3.5">Honor Pekerjaan</th>
                      <th className="p-3.5">Bonus Target</th>
                      <th className="p-3.5">Potongan</th>
                      <th className="p-3.5">Total Honor Nett</th>
                      <th className="p-3.5 text-center">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {payrollList.map(item => {
                      const totalHonorJobs =
                        item.honorDasarPekerjaan +
                        item.honorTitik +
                        item.honorPanjangKabel +
                        item.honorLembur +
                        item.honorTransportKendaraan;
                      const honorServerWilayah = item.honorTetapServer + item.honorPJWilayah;

                      return (
                        <tr key={item.teknisiId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <p className="font-bold text-slate-900 text-sm">{item.teknisiNama}</p>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded-md text-[10px]">
                                {item.statusKaryawan}
                              </span>
                              {item.bonusTarget > 0 && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                  +Bonus Target
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5 font-bold text-slate-800">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-bold">
                              {item.totalPekerjaanCount} Jobs
                            </span>
                          </td>

                          <td className="p-3.5">
                            <p className="font-bold text-slate-900">{formatRupiah(honorServerWilayah)}</p>
                            <span className="text-[10px] text-slate-400 block">
                              (Srv: {formatRupiah(item.honorTetapServer)} + Wil: {formatRupiah(item.honorPJWilayah)})
                            </span>
                            {item.serverBreakdowns && item.serverBreakdowns.filter(sb => sb.honorTetapServer > 0).length > 1 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.serverBreakdowns.filter(sb => sb.honorTetapServer > 0).map(sb => (
                                  <span key={sb.serverId} className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-semibold">
                                    {sb.serverNama}: {formatRupiah(sb.honorTetapServer)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.potonganManualKasbon > 0 && (
                              <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
                                Kasbon: -{formatRupiah(item.potonganManualKasbon)}
                              </span>
                            )}
                          </td>

                          <td className="p-3.5">
                            <p className="font-bold text-maroon-800">{formatRupiah(totalHonorJobs)}</p>
                            <span className="text-[10px] text-slate-400 block">
                              (Dasar + Titik + Kabel + Lembur + Transport)
                            </span>
                          </td>

                          <td className="p-3.5">
                            <p className={`font-bold ${item.bonusTarget > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {item.bonusTarget > 0 ? `+${formatRupiah(item.bonusTarget)}` : 'Rp 0'}
                            </p>
                            {item.bonusTargetDetails && item.bonusTargetDetails.length > 0 && item.bonusTarget > 0 && (
                              <span className="text-[10px] text-emerald-600 block">
                                ({item.bonusTargetDetails.filter(b => b.bonusAmount > 0).map(b => `${b.serverNama}: ${b.percentage}%`).join(', ')})
                              </span>
                            )}
                          </td>

                          <td className="p-3.5 text-rose-600 font-bold">
                            {item.totalPotongan > 0 ? (
                              <>
                                <span>-{formatRupiah(item.totalPotongan)}</span>
                                <div className="text-[9px] text-slate-400 font-normal mt-0.5 space-y-0.5">
                                  {item.potonganTerlambatAbsen > 0 && (
                                    <div>Absen: -{formatRupiah(item.potonganTerlambatAbsen)}</div>
                                  )}
                                  {item.potonganManualKasbon > 0 && (
                                    <div className="text-rose-600 font-semibold">
                                      Kasbon: -{formatRupiah(item.potonganManualKasbon)}
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <span className="text-slate-400 font-normal">Rp 0</span>
                            )}
                          </td>

                          <td className="p-3.5 font-black text-emerald-600 text-sm">
                            {formatRupiah(item.totalHonorNett)}
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => setSelectedPayrollModal(item)}
                                className="px-2.5 py-1.5 bg-maroon-50 text-maroon-800 hover:bg-maroon-100 font-bold rounded-xl inline-flex items-center space-x-1 transition-colors cursor-pointer text-xs"
                                title="Lihat rincian lengkap slip gaji teknisi"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Slip</span>
                              </button>
                              <button
                                onClick={() => handleOpenAddPotonganModal(item.teknisiId)}
                                className="px-2 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-xl inline-flex items-center space-x-0.5 transition-colors cursor-pointer text-xs"
                                title={`Catat potongan kasbon untuk ${item.teknisiNama}`}
                              >
                                <MinusCircle className="w-3.5 h-3.5" />
                                <span>Kasbon</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {payrollList.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          Tidak ada data teknisi yang sesuai dengan filter.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Total Footer Row */}
                  {payrollList.length > 0 && (
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 text-xs">
                      <tr>
                        <td className="p-3.5">TOTAL AKUMULASI</td>
                        <td className="p-3.5">{filteredJobs.length} Jobs</td>
                        <td className="p-3.5">
                          {formatRupiah(payrollList.reduce((s, p) => s + (p.honorTetapServer + p.honorPJWilayah), 0))}
                        </td>
                        <td className="p-3.5 text-maroon-800">
                          {formatRupiah(payrollList.reduce((s, p) => s + (p.honorDasarPekerjaan + p.honorTitik + p.honorPanjangKabel + p.honorLembur + p.honorTransportKendaraan), 0))}
                        </td>
                        <td className="p-3.5 text-emerald-700">
                          +{formatRupiah(payrollList.reduce((s, p) => s + p.bonusTarget, 0))}
                        </td>
                        <td className="p-3.5 text-rose-600">
                          -{formatRupiah(payrollList.reduce((s, p) => s + p.totalPotongan, 0))}
                        </td>
                        <td className="p-3.5 font-black text-emerald-700 text-sm">
                          {formatRupiah(grandTotalPayroll)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. TAB 2: DATA PEKERJAAN LAPANGAN (JOB RECORDS) */}
      {activeTab === 'pekerjaan' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-maroon-800" />
                <span>Rincian Data Pekerjaan Lapangan</span>
              </h3>
              <p className="text-xs text-slate-500">
                Pekerjaan yang tercatat pada rentang {startDate} s/d {endDate}
              </p>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Total {filteredJobs.length} pekerjaan terdata
            </div>
          </div>

          {/* TAB 2 Content: Mobile Cards & Desktop Table */}
          {filteredJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-600">Tidak ada data pekerjaan yang tercatat pada rentang tanggal dan server ini.</p>
            </div>
          ) : (
            <div>
              {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
              <div className="block md:hidden divide-y divide-slate-100">
                {filteredJobs.map((job, idx) => {
                  const srvObj = servers.find(s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer);
                  const displayServerName = srvObj ? srvObj.namaServer : (job.namaServer && !job.namaServer.startsWith('srv-') ? job.namaServer : '-');

                  const wilStr = job.wilayahNamas && job.wilayahNamas.length > 0
                    ? job.wilayahNamas.join(', ')
                    : displayServerName;

                  return (
                    <div key={job.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                      {/* Header: No, Tanggal & Total Honor Job */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                          <span className="text-[10px] text-slate-400 font-extrabold">#{idx + 1}</span>
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{job.tanggal.slice(0, 10)}</span>
                        </div>
                        <span className="font-black text-indigo-700 text-sm">
                          {formatRupiah(job.estimasiTotalHonor || 0)}
                        </span>
                      </div>

                      {/* Job Title & Sub */}
                      <div>
                        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md text-[10px] uppercase tracking-wide border border-indigo-200/60 mb-0.5">
                          {job.jenisPekerjaanNama}
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-xs leading-snug">
                          {job.subPekerjaanNama}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-1">
                          <Server className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-700">{displayServerName}</span>
                          {wilStr !== displayServerName && (
                            <span className="text-slate-400">({wilStr})</span>
                          )}
                        </p>
                      </div>

                      {/* Technicians Tag List */}
                      <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-100 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Teknisi Bertugas:</span>
                        <div className="flex flex-wrap gap-1">
                          {job.teknisiNamas.map((nama, nIdx) => {
                            const tId = job.teknisiIds ? job.teknisiIds[nIdx] : undefined;
                            const namaClean = (nama || '').toLowerCase().trim();
                            const emp = employees.find(e => 
                              (tId && (e.id === tId || e.username === tId || `emp-${e.username}` === tId)) || 
                              e.namaLengkap === nama ||
                              (e.namaLengkap && namaClean && e.namaLengkap.toLowerCase().trim() === namaClean) ||
                              (e.namaLengkap && namaClean && (e.namaLengkap.toLowerCase().includes(namaClean) || namaClean.includes(e.namaLengkap.toLowerCase())))
                            );
                            const hasPulang = emp ? checkTechnicianHasPulang(emp, job.tanggal, attendance) : true;
                            const attApproved = emp ? checkTechnicianAttendanceApproved(emp, job.tanggal, attendance, settings) : { isEligible: true };
                            const isFullyEligible = hasPulang && attApproved.isEligible;

                            return (
                              <span
                                key={nIdx}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                                  isFullyEligible
                                    ? 'bg-white border border-slate-200 text-slate-800'
                                    : !hasPulang
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                <span>{nama}</span>
                                {!hasPulang && (
                                  <span className="text-[9px] font-bold text-rose-600 flex items-center gap-1">
                                    <span>(Belum Pulang)</span>
                                    {onUpdateAttendance && emp && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickFixPulang(emp, job.tanggal, job.serverId);
                                        }}
                                        className="text-[9px] bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer inline-flex items-center gap-0.5"
                                        title="Input Jam Pulang Teknisi"
                                      >
                                        <Clock className="w-2.5 h-2.5" />
                                        <span>Set</span>
                                      </button>
                                    )}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Specs details row */}
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                        <div className="flex items-center space-x-1.5 font-bold">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700">
                            {job.jumlahTitik || 0} Ttk
                          </span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700">
                            {job.panjangKabelMeter || 0} m
                          </span>
                          {job.menitLembur ? (
                            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                              +{job.menitLembur}m Lembur
                            </span>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 font-semibold">Honor / Tek: </span>
                          <span className="font-extrabold text-slate-800">{formatRupiah(job.honorPerTeknisi || 0)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3">No</th>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Pekerjaan & Sub</th>
                      <th className="p-3">Server & Wilayah</th>
                      <th className="p-3">Teknisi Bertugas</th>
                      <th className="p-3 text-center">Titik / Kabel</th>
                      <th className="p-3 text-center">Lembur</th>
                      <th className="p-3">Kendaraan</th>
                      <th className="p-3 text-right">Honor Job</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredJobs.map((job, idx) => {
                      const srvObj = servers.find(s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer);
                      const displayServerName = srvObj ? srvObj.namaServer : (job.namaServer && !job.namaServer.startsWith('srv-') ? job.namaServer : '-');

                      const wilStr = job.wilayahNamas && job.wilayahNamas.length > 0
                        ? job.wilayahNamas.join(', ')
                        : displayServerName;

                      return (
                        <tr key={job.id} className="hover:bg-slate-50/80">
                          <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                            {job.tanggal.slice(0, 10)}
                          </td>
                          <td className="p-3">
                            <p className="font-bold text-slate-900">{job.jenisPekerjaanNama}</p>
                            <p className="text-[11px] text-slate-500">{job.subPekerjaanNama}</p>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 block">{displayServerName}</span>
                            <span className="text-[10px] text-slate-500 block truncate max-w-[160px]">{wilStr}</span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {job.teknisiNamas.map((nama, nIdx) => {
                                const tId = job.teknisiIds ? job.teknisiIds[nIdx] : undefined;
                                const namaClean = (nama || '').toLowerCase().trim();
                                const emp = employees.find(e => 
                                  (tId && (e.id === tId || e.username === tId || `emp-${e.username}` === tId)) || 
                                  e.namaLengkap === nama ||
                                  (e.namaLengkap && namaClean && e.namaLengkap.toLowerCase().trim() === namaClean) ||
                                  (e.namaLengkap && namaClean && (e.namaLengkap.toLowerCase().includes(namaClean) || namaClean.includes(e.namaLengkap.toLowerCase())))
                                );
                                const hasPulang = emp ? checkTechnicianHasPulang(emp, job.tanggal, attendance) : true;
                                const attApproved = emp ? checkTechnicianAttendanceApproved(emp, job.tanggal, attendance, settings) : { isEligible: true };
                                const isFullyEligible = hasPulang && attApproved.isEligible;

                                return (
                                  <span
                                    key={nIdx}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                                      isFullyEligible
                                        ? 'bg-slate-100 text-slate-700'
                                        : !hasPulang
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                    }`}
                                    title={
                                      isFullyEligible
                                        ? 'Absensi Lengkap & Terverifikasi'
                                        : !hasPulang
                                        ? 'Belum Absen Pulang: Honor tidak dihitung'
                                        : `Perlu Approval: ${attApproved.reason || 'Absen terlambat belum disetujui Admin'}`
                                    }
                                  >
                                    {nama}
                                    {!hasPulang && (
                                      <span className="text-[9px] font-bold text-rose-600 flex items-center gap-1">
                                        <span>(Belum Pulang)</span>
                                        {onUpdateAttendance && emp && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleQuickFixPulang(emp, job.tanggal, job.serverId);
                                            }}
                                            className="text-[9px] bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold px-1.5 py-0.5 rounded shadow-2xs transition-all cursor-pointer inline-flex items-center gap-0.5"
                                            title="Input Jam Pulang Teknisi agar pekerjaan ini otomatis terhitung ke honor"
                                          >
                                            <Clock className="w-2.5 h-2.5" />
                                            <span>Set Pulang</span>
                                          </button>
                                        )}
                                      </span>
                                    )}
                                    {hasPulang && !attApproved.isEligible && (
                                      <span className="text-[9px] font-bold text-amber-700 flex items-center gap-1">
                                        <span>(Perlu Approval)</span>
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold text-slate-800 block">{job.jumlahTitik || 0} ttk</span>
                            <span className="text-[10px] text-slate-500 block">{job.panjangKabelMeter || 0} m</span>
                          </td>
                          <td className="p-3 text-center">
                            {job.menitLembur ? (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
                                {job.menitLembur} mnt
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            {job.teknisiVehicles && Object.keys(job.teknisiVehicles).length > 0 ? (
                              <div className="space-y-0.5 text-[10px]">
                                {Object.entries(job.teknisiVehicles).map(([tId, v]) => {
                                  const emp = employees.find(e => e.id === tId);
                                  return (
                                    <div key={tId} className="text-slate-600">
                                      <span className="font-semibold">{emp?.namaLengkap.split(' ')[0] || 'Tek'}:</span>{' '}
                                      <span className={v === 'Pribadi' ? 'text-indigo-700 font-bold' : ''}>{v}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black text-slate-900">
                            {formatRupiah(job.estimasiTotalHonor || 0)}
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

      {/* 6.5 TAB 3: CATATAN POTONGAN MANUAL & KASBON */}
      {activeTab === 'potongan' && (
        <div className="space-y-4">
          {/* Banner Informasi Aturan Potongan Manual */}
          <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-900 text-sm">Ketentuan Sistem Potongan Manual & Kasbon:</h4>
              <p className="text-slate-700 leading-relaxed">
                Potongan manual berlaku jika ada karyawan/teknisi yang melakukan kasbon atau keperluan lainnya pada server tertentu. 
                <strong> Potongan manual diambil dari Honor Tetap karyawan dan dikeluarkan/dibebankan oleh server yang bersangkutan.</strong> Potongan manual secara otomatis masuk pada rekap gaji untuk memotong honor tetap teknisi pada periode berjalan.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Header Tab 3 */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
                  <MinusCircle className="w-4 h-4 text-rose-600" />
                  <span>Daftar Potongan Manual & Kasbon Karyawan</span>
                  <span className="text-xs font-normal text-slate-500">
                    ({startDate} s/d {endDate})
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total {filteredPotongan.length} data potongan tercatat • Akumulasi: <strong className="text-rose-600 font-bold">{formatRupiah(grandTotalPotonganManual)}</strong>
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchPotonganQuery}
                    onChange={e => setSearchPotonganQuery(e.target.value)}
                    placeholder="Cari nama / keterangan..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                  />
                </div>
                <button
                  onClick={() => handleOpenAddPotonganModal()}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Potongan</span>
                </button>
              </div>
            </div>

            {/* TAB 3 Content: Mobile Cards & Desktop Table */}
            {filteredPotongan.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <MinusCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">Belum ada catatan potongan manual atau kasbon pada periode ini.</p>
                <p className="text-xs text-slate-400 mt-1">Gunakan tombol "Tambah Potongan" untuk mencatat kasbon karyawan pada server terkait.</p>
              </div>
            ) : (
              <div>
                {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredPotongan.map(item => (
                    <div key={item.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                      {/* Header: Tanggal & Nominal */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.tanggal}</span>
                        </div>
                        <span className="font-black text-rose-600 text-sm">
                          -{formatRupiah(item.nominal)}
                        </span>
                      </div>

                      {/* Technician & Server & Type */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-slate-900 text-sm">{item.karyawanNama}</p>
                          <div className="flex items-center space-x-1.5 text-slate-500 text-xs mt-0.5">
                            <Server className="w-3 h-3 text-slate-400" />
                            <span>{item.serverNama}</span>
                            <span className="px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold">
                              {item.jenisPotongan || 'Kasbon'}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={() => handleOpenEditPotonganModal(item)}
                            className="p-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Edit data potongan"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePotongan(item.id, item.karyawanNama, item.nominal)}
                            className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            title="Hapus potongan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Notes / Keperluan */}
                      {item.keterangan && (
                        <p className="text-slate-600 text-xs italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                          "{item.keterangan}"
                        </p>
                      )}

                      <div className="text-[10px] text-slate-400">
                        Dicatat oleh: <span className="font-semibold text-slate-600">{item.createdByNama || 'Admin'}</span>
                      </div>
                    </div>
                  ))}

                  {/* Smartphone Total Summary Box */}
                  <div className="p-3.5 bg-slate-100/90 border-t-2 border-slate-200 text-xs flex justify-between items-center font-bold">
                    <span className="text-slate-700">TOTAL POTONGAN ({filteredPotongan.length} Kasbon):</span>
                    <span className="text-rose-600 font-black text-sm">-{formatRupiah(grandTotalPotonganManual)}</span>
                  </div>
                </div>

                {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3.5">Tanggal</th>
                        <th className="p-3.5">Nama Teknisi</th>
                        <th className="p-3.5">Server yang Mengeluarkan</th>
                        <th className="p-3.5">Jenis Potongan</th>
                        <th className="p-3.5">Nominal Potongan</th>
                        <th className="p-3.5">Keterangan / Keperluan</th>
                        <th className="p-3.5">Dicatat Oleh</th>
                        <th className="p-3.5 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredPotongan.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-slate-600 font-semibold whitespace-nowrap">
                            {item.tanggal}
                          </td>
                          <td className="p-3.5">
                            <p className="font-bold text-slate-900">{item.karyawanNama}</p>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-semibold text-[11px]">
                              {item.serverNama}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-bold text-[10px]">
                              {item.jenisPotongan || 'Kasbon'}
                            </span>
                          </td>
                          <td className="p-3.5 font-extrabold text-rose-600 text-sm whitespace-nowrap">
                            -{formatRupiah(item.nominal)}
                          </td>
                          <td className="p-3.5 text-slate-700 max-w-xs">
                            <p className="truncate">{item.keterangan || '-'}</p>
                          </td>
                          <td className="p-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                            {item.createdByNama || 'Admin'}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => handleOpenEditPotonganModal(item)}
                                className="p-1.5 text-slate-600 hover:text-maroon-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Edit data potongan"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeletePotongan(item.id, item.karyawanNama, item.nominal)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Hapus potongan"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredPotongan.length > 0 && (
                      <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 text-xs">
                        <tr>
                          <td colSpan={4} className="p-3.5 text-right uppercase tracking-wider">Total Potongan Terpilih:</td>
                          <td className="p-3.5 text-rose-600 font-black text-sm">
                            -{formatRupiah(grandTotalPotonganManual)}
                          </td>
                          <td colSpan={3} className="p-3.5 text-slate-500 font-normal">
                            ({filteredPotongan.length} transaksi kasbon)
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6.7 TAB 4: RIWAYAT HONOR LUNAS (SHEET HONORLUNAS) */}
      {activeTab === 'riwayat_lunas' && (
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-2xl p-4 text-xs text-emerald-950 flex items-start space-x-3">
            <BadgeCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-extrabold text-slate-900 text-sm">Database Riwayat Pelunasan Honor (Sheet HonorLunas):</h4>
              <p className="text-slate-700 leading-relaxed">
                Semua transaksi honor yang telah diproses dengan status <strong>Lunas Dibayar</strong> dicatat secara permanen pada sheet <strong>HonorLunas</strong> di Google Sheets. Honor yang sudah berstatus lunas <strong>secara otomatis tidak akan dihitung atau terjumlah kembali</strong> pada rekapitulasi honor berjalan.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Header Tab 4 */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center space-x-2">
                  <History className="w-4 h-4 text-emerald-700" />
                  <span>Daftar Riwayat Honor Lunas (Sheet HonorLunas)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total {filteredRiwayatLunas.length} transaksi pelunasan • Total Dilunaskan: <strong className="text-emerald-700 font-bold">{formatRupiah(totalSettledAmount)}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle Semua Riwayat vs Sesuai Tanggal */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShowAllRiwayat(true)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      showAllRiwayat ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua Riwayat ({honorLunasList?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllRiwayat(false)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      !showAllRiwayat ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Filter Tanggal ({startDate} s/d {endDate})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchRiwayatLunasQuery}
                    onChange={e => setSearchRiwayatLunasQuery(e.target.value)}
                    placeholder="Cari teknisi / server / catatan..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                  />
                </div>
              </div>
            </div>

            {/* TAB 4 Content: Mobile Cards & Desktop Table */}
            {filteredRiwayatLunas.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">Belum ada riwayat honor yang dilunaskan sesuai filter.</p>
                <p className="text-xs text-slate-400 mt-1">Gunakan tombol "Lunaskan Honor" pada menu Rekapitulasi untuk memproses pembayaran dan menyimpan data ke sheet HonorLunas.</p>
              </div>
            ) : (
              <div>
                {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredRiwayatLunas.map(item => (
                    <div key={item.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                      {/* Header: Tanggal Lunas & Status Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Lunas: {item.tanggalLunas}</span>
                        </div>
                        {item.isParsial ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded-md font-extrabold text-[10px]">
                            Sebagian (Sisa: {formatRupiah(item.sisaHonor || 0)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-md font-extrabold text-[10px]">
                            Lunas Penuh
                          </span>
                        )}
                      </div>

                      {/* Technician & Server & Periode */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-extrabold text-slate-900 text-sm">{item.teknisiNama}</h4>
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                              {item.statusKaryawan}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Server: <strong className="text-slate-700">{item.namaServer}</strong> • Periode: <span className="font-semibold text-slate-700">{item.periodeAwal} s/d {item.periodeAkhir}</span>
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={() => setSelectedSettlementDetail(item)}
                            className="p-1.5 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                            title="Lihat rincian pelunasan honor"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {currentUser?.role === 'Admin' && (
                            <button
                              onClick={() => handleDeleteSettlement(item)}
                              className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Batalkan pelunasan honor"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Settlement Figures Grid */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Rincian Komponen</span>
                          <span className="text-slate-700 font-medium block">
                            {item.jobCount || item.totalPekerjaanCount || 0} Jobs
                          </span>
                          {item.totalPotongan > 0 && (
                            <span className="text-rose-600 text-[10px] font-bold block">
                              Potongan: -{formatRupiah(item.totalPotongan)}
                            </span>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Nominal Dilunaskan</span>
                          <span className="font-black text-emerald-600 text-sm block">
                            {formatRupiah(item.totalHonorNett)}
                          </span>
                          {item.totalTagihanAwal && item.totalTagihanAwal !== item.totalHonorNett && (
                            <span className="text-[9px] text-slate-400 block">
                              (Tagihan Awal: {formatRupiah(item.totalTagihanAwal)})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400">
                        Dilunaskan oleh: <span className="font-semibold text-slate-600">{item.dilunaskanOleh || 'Admin'}</span>
                      </div>
                    </div>
                  ))}

                  {/* Smartphone Total Summary Box */}
                  <div className="p-3.5 bg-slate-100/90 border-t-2 border-slate-200 text-xs flex justify-between items-center font-bold">
                    <span className="text-slate-700">TOTAL DILUNASKAN ({filteredRiwayatLunas.length} Transaksi):</span>
                    <span className="text-emerald-700 font-black text-sm">{formatRupiah(totalSettledAmount)}</span>
                  </div>
                </div>

                {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3.5">Tanggal Lunas</th>
                        <th className="p-3.5">Periode Honor</th>
                        <th className="p-3.5">Teknisi</th>
                        <th className="p-3.5">Server</th>
                        <th className="p-3.5 text-center">Status</th>
                        <th className="p-3.5">Rincian Komponen</th>
                        <th className="p-3.5">Potongan</th>
                        <th className="p-3.5">Nominal Dilunaskan</th>
                        <th className="p-3.5">Petugas</th>
                        <th className="p-3.5 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredRiwayatLunas.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-slate-600 font-semibold whitespace-nowrap">
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{item.tanggalLunas}</span>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-800 font-bold whitespace-nowrap">
                            {item.periodeAwal} s/d {item.periodeAkhir}
                          </td>
                          <td className="p-3.5">
                            <p className="font-bold text-slate-900">{item.teknisiNama}</p>
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                              {item.statusKaryawan}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-semibold text-[11px]">
                              {item.namaServer}
                            </span>
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            {item.isParsial ? (
                              <div className="space-y-0.5">
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded-md font-bold text-[10px] block">
                                  Sebagian
                                </span>
                                {item.sisaHonor !== undefined && item.sisaHonor > 0 && (
                                  <span className="text-[9px] text-slate-500 block font-medium">
                                    Sisa: {formatRupiah(item.sisaHonor)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-md font-bold text-[10px]">
                                Lunas Penuh
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-[11px] text-slate-600 space-y-0.5">
                            <div>Jobs: <strong>{item.jobCount || item.totalPekerjaanCount || 0} Jobs</strong></div>
                            <div>Tetap+Wil: {formatRupiah(item.honorTetapServer + item.honorPJWilayah)}</div>
                            <div>Pekerjaan: {formatRupiah(item.honorDasarPekerjaan + item.honorTitik + item.honorPanjangKabel + item.honorLembur + item.honorTransportKendaraan)}</div>
                            {item.bonusTarget > 0 && (
                              <div className="text-emerald-600 font-semibold">Bonus: +{formatRupiah(item.bonusTarget)}</div>
                            )}
                          </td>
                          <td className="p-3.5 text-rose-600 font-bold whitespace-nowrap">
                            {item.totalPotongan > 0 ? `-${formatRupiah(item.totalPotongan)}` : 'Rp 0'}
                          </td>
                          <td className="p-3.5 font-black text-emerald-600 text-sm whitespace-nowrap">
                            <p>{formatRupiah(item.totalHonorNett)}</p>
                            {item.totalTagihanAwal && item.totalTagihanAwal !== item.totalHonorNett && (
                              <span className="text-[10px] text-slate-400 font-normal block">
                                dari total {formatRupiah(item.totalTagihanAwal)}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-slate-500 text-[11px] whitespace-nowrap">
                            {item.dilunaskanOleh || 'Admin'}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                onClick={() => setSelectedSettlementDetail(item)}
                                className="p-1.5 text-slate-600 hover:text-maroon-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Lihat rincian pelunasan honor"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {currentUser?.role === 'Admin' && (
                                <button
                                  onClick={() => handleDeleteSettlement(item)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Batalkan pelunasan honor (kembalikan ke belum lunas)"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredRiwayatLunas.length > 0 && (
                      <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 text-xs">
                        <tr>
                          <td colSpan={7} className="p-3.5 text-right uppercase tracking-wider">Total Dilunaskan:</td>
                          <td className="p-3.5 text-emerald-700 font-black text-sm">
                            {formatRupiah(totalSettledAmount)}
                          </td>
                          <td colSpan={2} className="p-3.5 text-slate-500 font-normal">
                            ({filteredRiwayatLunas.length} data transaksi lunas)
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT POTONGAN MANUAL & KASBON */}
      {isModalPotonganOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-rose-50 text-rose-700 rounded-xl">
                  <MinusCircle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {editingPotongan ? 'Edit Potongan Manual' : 'Catat Potongan Manual / Kasbon'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Memotong Honor Tetap karyawan dan dibebankan ke server bersangkutan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalPotonganOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePotonganForm} className="space-y-4 text-xs">
              {/* Info Callout */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
                <strong>Ketentuan:</strong> Potongan manual kasbon ini akan secara otomatis memotong <strong>Honor Tetap</strong> karyawan pada rekapitulasi gaji, dan pengeluarannya dibebankan pada <strong>Server yang dipilih</strong>.
              </div>

              {/* 1. Pilih Teknisi / Karyawan */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Pilih Teknisi / Karyawan <span className="text-rose-600">*</span>
                </label>
                <select
                  value={formKaryawanId}
                  onChange={e => {
                    const techId = e.target.value;
                    setFormKaryawanId(techId);
                    if (!isPjServer && selectedServerId === 'all') {
                      const empObj = employees.find(x => x.id === techId);
                      if (empObj?.serverId) setFormServerId(empObj.serverId);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                  required
                >
                  <option value="">-- Pilih Teknisi --</option>
                  {sortedEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.namaLengkap} ({emp.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Pilih Server yang Mengeluarkan */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Server yang Mengeluarkan Potongan / Kasbon <span className="text-rose-600">*</span>
                </label>
                <select
                  value={formServerId}
                  onChange={e => setFormServerId(e.target.value)}
                  disabled={isPjServer && !!userServer}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800 disabled:opacity-60"
                  required
                >
                  <option value="">-- Pilih Server --</option>
                  {sortedServers.map(srv => (
                    <option key={srv.id} value={srv.id}>
                      {srv.namaServer} ({srv.alamat || 'Tower'})
                    </option>
                  ))}
                </select>
                {isPjServer && userServer && (
                  <p className="text-[10px] text-slate-400 italic">
                    Terkunci pada server yang Anda kelola ({userServer.namaServer})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 3. Tanggal */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    Tanggal Potongan <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    value={formTanggal}
                    onChange={e => setFormTanggal(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                    required
                  />
                </div>

                {/* 4. Jenis Potongan */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    Jenis Potongan <span className="text-rose-600">*</span>
                  </label>
                  <select
                    value={formJenis}
                    onChange={e => setFormJenis(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                    required
                  >
                    <option value="Kasbon">Kasbon</option>
                    <option value="Pinjaman Karyawan">Pinjaman Karyawan</option>
                    <option value="Operasional Server">Operasional Server</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              {/* 5. Nominal Potongan */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  Nominal Potongan (Rp) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rp</span>
                  <input
                    type="text"
                    value={formNominal}
                    onChange={e => {
                      const num = e.target.value.replace(/[^0-9]/g, '');
                      setFormNominal(num ? Number(num).toLocaleString('id-ID') : '');
                    }}
                    placeholder="Contoh: 150.000"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-rose-600 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                    required
                  />
                </div>

                {/* Quick nominal buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[50000, 100000, 200000, 500000, 1000000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFormNominal(amt.toLocaleString('id-ID'))}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] rounded-lg transition-colors cursor-pointer"
                    >
                      +{formatRupiah(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Keterangan */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Keterangan / Keperluan
                </label>
                <textarea
                  rows={2}
                  value={formKeterangan}
                  onChange={e => setFormKeterangan(e.target.value)}
                  placeholder="Contoh: Kasbon darurat perbaikan motor, uang makan lembur, pinjaman pribadi, dll."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-maroon-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalPotonganOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  <MinusCircle className="w-4 h-4" />
                  <span>{editingPotongan ? 'Simpan Perubahan' : 'Simpan Potongan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. DETAIL PAYROLL MODAL / SLIP GAJI TEKNISI */}
      {selectedPayrollModal && (
        <div className="slip-modal-backdrop fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="slip-modal-card bg-slate-100 rounded-3xl max-w-4xl w-full p-3 sm:p-5 shadow-2xl border border-slate-200 my-auto max-h-[95vh] overflow-y-auto">
            {/* Header Toolbar (No Print) */}
            <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-maroon-50 text-maroon-800 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                    Pratinjau Slip Gaji Resmi
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Format Dokumen Standar A4 • {selectedPayrollModal.teknisiNama}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSingleSlipPdf(selectedPayrollModal)}
                  disabled={isDownloadingSingleSlip}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                  title="Unduh file dokumen slip gaji format PDF"
                >
                  {isDownloadingSingleSlip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memproses PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Unduh File PDF</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-[#800020] hover:bg-maroon-900 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                  title="Cetak langsung dokumen slip gaji ke printer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Slip (Print)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPayrollModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Tutup pratinjau"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Paper Document Container */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <OfficialSlipGajiDocument
                recap={selectedPayrollModal}
                settings={settings}
                servers={servers}
                employees={employees}
                selectedServerId={selectedServerId}
                selectedServerName={selectedServerName}
                slipSignInfo={slipSignInfo}
              />
            </div>

            {/* Footer Toolbar (No Print) */}
            <div className="no-print mt-4 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <p className="text-[11px] italic">
                * Tombol & navigasi aplikasi di atas otomatis tersembunyi saat dicetak (hasil cetak hanya dokumen resmi di atas).
              </p>
              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleDownloadSingleSlipPdf(selectedPayrollModal)}
                  disabled={isDownloadingSingleSlip}
                  className="px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-200 text-slate-800 hover:bg-slate-300 font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPayrollModal(null)}
                  className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
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

      {/* MODAL KONFIRMASI LUNASKAN HONOR */}
      {isModalSettleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <span className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl">
                  <CheckCheck className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="font-black text-slate-900 text-base sm:text-lg leading-tight">
                    Form Pelunasan Honor Teknisi
                  </h3>
                  <p className="text-xs text-slate-500">
                    Proses pelunasan honor (pembayaran penuh atau sebagian) dan simpan ke sheet <strong>HonorLunas</strong> Google Sheets
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalSettleOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Parameter Filter Callout */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                  <Filter className="w-3.5 h-3.5 text-maroon-800" />
                  <span>Acuan Parameter Pelunasan:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-700">
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Periode Honor:</span>
                    <strong className="text-slate-900 font-bold text-xs">{startDate} s/d {endDate}</strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Server:</span>
                    <strong className="text-slate-900 font-bold text-xs">{selectedServerName}</strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Penerima:</span>
                    <strong className="text-slate-900 font-bold text-xs">{eligibleSettlementRecaps.length} Teknisi</strong>
                  </div>
                </div>
              </div>

              {/* Input Tanggal Pelunasan */}
              <div className="space-y-1.5 bg-emerald-50/60 border border-emerald-200/80 p-3.5 rounded-2xl">
                <label className="font-extrabold text-emerald-950 flex items-center space-x-2 text-xs">
                  <Calendar className="w-4 h-4 text-emerald-700" />
                  <span>Tanggal Pelunasan (Tanggal Pembayaran):</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                  <input
                    type="date"
                    value={settleTanggal}
                    onChange={e => setSettleTanggal(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <div className="text-[11px] text-emerald-800 font-medium">
                    Tanggal resmi pelunasan ini akan dicatat pada kolom <strong>Tanggal Lunas</strong> di Google Sheets.
                  </div>
                </div>
              </div>

              {/* Rincian Teknisi & Input Nominal yang Dilunasi */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-slate-800 block text-xs">
                    Nominal Honor yang Dilunasi ({eligibleSettlementRecaps.length} Teknisi):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const fullMap: Record<string, string> = {};
                      eligibleSettlementRecaps.forEach(rec => {
                        fullMap[rec.teknisiId] = rec.totalHonorNett.toLocaleString('id-ID');
                      });
                      setSettleNominalMap(fullMap);
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                  >
                    Set Semua Lunas Penuh (100%)
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-white shadow-xs">
                  {eligibleSettlementRecaps.map(rec => {
                    const rawVal = settleNominalMap[rec.teknisiId];
                    const numVal = rawVal !== undefined && rawVal.trim().length > 0
                      ? (Number(rawVal.replace(/[^0-9]/g, '')) || 0)
                      : rec.totalHonorNett;
                    const isPartial = numVal < rec.totalHonorNett;
                    const sisa = Math.max(0, rec.totalHonorNett - numVal);

                    return (
                      <div key={rec.teknisiId} className="p-3 space-y-2 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-slate-900 text-xs">{rec.teknisiNama}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                {rec.statusKaryawan}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Total Hak Honor Periode Ini: <strong className="text-slate-800 font-bold">{formatRupiah(rec.totalHonorNett)}</strong> ({rec.totalPekerjaanCount} Jobs)
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div>
                            {isPartial ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-extrabold text-[10px] whitespace-nowrap">
                                Sebagian
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-extrabold text-[10px] whitespace-nowrap">
                                Lunas Penuh
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Input Nominal Per Teknisi */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 border-t border-slate-100">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                            <input
                              type="text"
                              value={settleNominalMap[rec.teknisiId] !== undefined ? settleNominalMap[rec.teknisiId] : rec.totalHonorNett.toLocaleString('id-ID')}
                              onChange={e => {
                                const cleanDigits = e.target.value.replace(/[^0-9]/g, '');
                                const num = Number(cleanDigits) || 0;
                                setSettleNominalMap(prev => ({
                                  ...prev,
                                  [rec.teknisiId]: num > 0 ? num.toLocaleString('id-ID') : ''
                                }));
                              }}
                              placeholder="0"
                              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-700"
                            />
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSettleNominalMap(prev => ({
                                  ...prev,
                                  [rec.teknisiId]: rec.totalHonorNett.toLocaleString('id-ID')
                                }));
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                            >
                              100%
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const half = Math.round(rec.totalHonorNett / 2);
                                setSettleNominalMap(prev => ({
                                  ...prev,
                                  [rec.teknisiId]: half.toLocaleString('id-ID')
                                }));
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                            >
                              50%
                            </button>
                          </div>
                        </div>

                        {/* Sisa Tagihan jika sebagian */}
                        {isPartial && (
                          <div className="text-[11px] text-amber-700 font-semibold flex items-center justify-between bg-amber-50/80 px-2.5 py-1 rounded-lg">
                            <span>Sisa honor yang belum dibayar:</span>
                            <strong className="text-amber-900 font-black">{formatRupiah(sisa)}</strong>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ringkasan Total Pelunasan */}
              <div className="bg-emerald-900 text-white p-4 rounded-2xl space-y-2 shadow-inner">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-200">Total Hak Honor Terpilih:</span>
                  <strong className="font-bold">{formatRupiah(grandTotalPayroll)}</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-200">Total Nominal yang Dilunasi:</span>
                  <strong className="text-emerald-300 font-black text-sm">{formatRupiah(modalTotalNominalDilunasi)}</strong>
                </div>
                {modalTotalNominalDilunasi < grandTotalPayroll && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-emerald-800 text-amber-300 font-semibold">
                    <span>Sisa Total Honor Belum Dibayar:</span>
                    <strong className="font-black">{formatRupiah(Math.max(0, grandTotalPayroll - modalTotalNominalDilunasi))}</strong>
                  </div>
                )}
              </div>

              {/* Input Catatan Pelunasan */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block text-xs">
                  Catatan / Keterangan Pelunasan:
                </label>
                <textarea
                  rows={2}
                  value={settleCatatan}
                  onChange={e => setSettleCatatan(e.target.value)}
                  placeholder="Contoh: Pembayaran transfer honor via Bank BCA periode September 2026 server AlbiNet"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalSettleOpen(false)}
                  disabled={isSettlingHonor}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteLunaskanHonor}
                  disabled={isSettlingHonor || modalTotalNominalDilunasi <= 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSettlingHonor ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memproses Pelunasan & Menyimpan ke Sheet...</span>
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4" />
                      <span>Lunaskan Honor ({formatRupiah(modalTotalNominalDilunasi)})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETAIL RIWAYAT HONOR LUNAS */}
      {selectedSettlementDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                  <BadgeCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Rincian Pelunasan Honor
                  </h3>
                  <p className="text-xs text-slate-500">
                    ID: {selectedSettlementDetail.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedSettlementDetail(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl space-y-1.5 border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Teknisi:</span>
                  <strong className="text-slate-900 font-bold">{selectedSettlementDetail.teknisiNama}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Server:</span>
                  <span className="font-semibold text-slate-800">{selectedSettlementDetail.namaServer}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Periode Honor:</span>
                  <span className="font-semibold text-slate-800">{selectedSettlementDetail.periodeAwal} s/d {selectedSettlementDetail.periodeAkhir}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal Pelunasan:</span>
                  <span className="font-semibold text-emerald-700">{selectedSettlementDetail.tanggalLunas}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dilunaskan Oleh:</span>
                  <span className="text-slate-700">{selectedSettlementDetail.dilunaskanOleh}</span>
                </div>
                {selectedSettlementDetail.catatan && (
                  <div className="pt-1.5 border-t border-slate-200 text-slate-600 italic">
                    "{selectedSettlementDetail.catatan}"
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-2xl p-3 space-y-1.5">
                <h5 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">Rincian Komponen Honor:</h5>
                <div className="flex justify-between text-slate-600">
                  <span>Honor Tetap Server:</span>
                  <span>{formatRupiah(selectedSettlementDetail.honorTetapServer)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Honor PJ Wilayah:</span>
                  <span>{formatRupiah(selectedSettlementDetail.honorPJWilayah)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Honor Pekerjaan ({selectedSettlementDetail.jobCount} Jobs):</span>
                  <span>{formatRupiah(selectedSettlementDetail.honorDasarPekerjaan + selectedSettlementDetail.honorTitik + selectedSettlementDetail.honorPanjangKabel + selectedSettlementDetail.honorLembur + selectedSettlementDetail.honorTransportKendaraan)}</span>
                </div>
                {selectedSettlementDetail.bonusTarget > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Bonus Target:</span>
                    <span>+{formatRupiah(selectedSettlementDetail.bonusTarget)}</span>
                  </div>
                )}
                {selectedSettlementDetail.totalPotongan > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Total Potongan & Kasbon:</span>
                    <span>-{formatRupiah(selectedSettlementDetail.totalPotongan)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-emerald-700">
                  <span>Total Honor Nett (Lunas):</span>
                  <span>{formatRupiah(selectedSettlementDetail.totalHonorNett)}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedSettlementDetail(null)}
                  className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const HitungRekapHonorView: React.FC<HitungRekapHonorViewProps> = React.memo(HitungRekapHonorViewComponent);
