import React, { useState, useMemo } from 'react';
import {
  Server,
  MapPin,
  ListCheck,
  Users,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Phone,
  Radio,
  Search,
  Filter,
  UserCheck,
  Briefcase,
  Shield,
  Wallet,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Sparkles,
  User,
  Building2
} from 'lucide-react';
import {
  ServerData,
  WilayahPekerjaan,
  JenisPekerjaan,
  Employee
} from '../types';
import { formatRupiah, formatPeriodMonthLabel } from '../services/payroll';
import { NumericInput } from '../components/NumericInput';
import { MapLocationPicker } from '../components/MapLocationPicker';
import { parseCoordinate, isValidLatLng, formatCoordinate } from '../utils/coordinates';
import { showAppConfirm } from '../utils/dialogService';
import { sortJenisPekerjaan, StorageService } from '../services/storage';
import { getEffectiveTodayISO } from '../services/googleSheetsHelper';

export type MasterTab = 'server' | 'wilayah' | 'jenis' | 'karyawan';

interface MasterDataViewProps {
  initialTab?: MasterTab;
  servers: ServerData[];
  wilayahList: WilayahPekerjaan[];
  jenisList: JenisPekerjaan[];
  employees: Employee[];
  currentUser?: Employee | null;
  onSaveServer: (server: ServerData) => void;
  onDeleteServer: (id: string) => void;
  onSaveWilayah: (wilayah: WilayahPekerjaan) => void;
  onDeleteWilayah: (id: string) => void;
  onSaveJenis: (jenis: JenisPekerjaan) => void;
  onDeleteJenis: (id: string) => void;
  onSaveEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
}

const MasterDataViewComponent: React.FC<MasterDataViewProps> = ({
  initialTab = 'server',
  servers,
  wilayahList,
  jenisList,
  employees,
  currentUser,
  onSaveServer,
  onDeleteServer,
  onSaveWilayah,
  onDeleteWilayah,
  onSaveJenis,
  onDeleteJenis,
  onSaveEmployee,
  onDeleteEmployee
}) => {
  const isPjServer = currentUser?.role === 'Penanggungjawab Server';

  // Find server managed by current user if they are Penanggung Jawab Server
  const assignedServer = React.useMemo(() => {
    if (!isPjServer || !currentUser) return null;
    return servers.find(s =>
      s.id === currentUser.serverId ||
      s.penanggungJawabId === currentUser.id ||
      (s.penanggungJawabNama && currentUser.namaLengkap && s.penanggungJawabNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim()) ||
      (currentUser.namaServer && s.namaServer.toLowerCase().trim() === currentUser.namaServer.toLowerCase().trim())
    ) || null;
  }, [isPjServer, currentUser, servers]);

  const isServerOwnedByUser = (srv: ServerData) => {
    if (!currentUser || currentUser.role === 'Admin') return true;
    if (isPjServer) {
      return (
        srv.id === currentUser.serverId ||
        srv.penanggungJawabId === currentUser.id ||
        (srv.penanggungJawabNama && currentUser.namaLengkap && srv.penanggungJawabNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim()) ||
        (currentUser.namaServer && srv.namaServer.toLowerCase().trim() === currentUser.namaServer.toLowerCase().trim())
      );
    }
    return false;
  };

  const [activeTab, setActiveTab] = useState<MasterTab>(
    isPjServer && (initialTab === 'jenis' || initialTab === 'karyawan') ? 'server' : initialTab
  );

  React.useEffect(() => {
    if (isPjServer && (initialTab === 'jenis' || initialTab === 'karyawan')) {
      setActiveTab('server');
    } else {
      setActiveTab(initialTab);
    }
  }, [initialTab, isPjServer]);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Form states
  const [serverForm, setServerForm] = useState<Partial<ServerData>>({});
  const [wilayahForm, setWilayahForm] = useState<Partial<WilayahPekerjaan>>({});
  const [jenisForm, setJenisForm] = useState<Partial<JenisPekerjaan>>({});
  const [employeeForm, setEmployeeForm] = useState<Partial<Employee>>({});
  const [honorEffectiveMonth, setHonorEffectiveMonth] = useState<string>(() => getEffectiveTodayISO().slice(0, 7));

  const getPrevMonthYYYYMM = (yyyyMm: string): string => {
    if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return '2026-09';
    const [y, m] = yyyyMm.split('-').map(Number);
    if (m <= 1) return `${y - 1}-12`;
    return `${y}-${String(m - 1).padStart(2, '0')}`;
  };

  // Auto-save draft for MasterData forms
  React.useEffect(() => {
    if (!modalOpen || editingItem) return;
    if (activeTab === 'server' && (serverForm.namaServer || serverForm.alamat)) {
      StorageService.saveMasterDataDraft('server', serverForm);
    } else if (activeTab === 'wilayah' && (wilayahForm.namaWilayah || (wilayahForm.serverId && wilayahForm.namaWilayah))) {
      StorageService.saveMasterDataDraft('wilayah', wilayahForm);
    } else if (activeTab === 'jenis' && (jenisForm.jenisPekerjaan || jenisForm.subPekerjaan)) {
      StorageService.saveMasterDataDraft('jenis', jenisForm);
    } else if (activeTab === 'karyawan' && (employeeForm.namaLengkap || employeeForm.username)) {
      StorageService.saveMasterDataDraft('karyawan', employeeForm);
    }
  }, [modalOpen, editingItem, activeTab, serverForm, wilayahForm, jenisForm, employeeForm]);

  const handleRequestCloseModal = async () => {
    const hasUnsaved = !editingItem && Boolean(
      (activeTab === 'server' && serverForm.namaServer) ||
      (activeTab === 'wilayah' && wilayahForm.namaWilayah) ||
      (activeTab === 'jenis' && (jenisForm.jenisPekerjaan || jenisForm.subPekerjaan)) ||
      (activeTab === 'karyawan' && (employeeForm.namaLengkap || employeeForm.username))
    );

    if (hasUnsaved) {
      const ok = await showAppConfirm({
        title: 'Tutup Form Master Data?',
        message: 'Isian data otomatis disimpan sebagai draf dan dapat dilanjutkan kembali.\n\nApakah Anda yakin ingin menutup form?',
        type: 'warning',
        confirmText: 'Ya, Tutup',
        cancelText: 'Lanjutkan Input'
      });
      if (!ok) return;
    }
    setModalOpen(false);
  };

  // Open Modal for New or Edit
  const handleOpenAddModal = () => {
    setEditingItem(null);
    if (activeTab === 'server') {
      const defaultPj = (isPjServer && currentUser)
        ? currentUser
        : employees.find(e => e.role === 'Penanggungjawab Server') || employees[0];
      const draft = StorageService.getMasterDataDraft('server');

      setServerForm({
        namaServer: draft?.namaServer || '',
        penanggungJawabId: draft?.penanggungJawabId || defaultPj?.id || '',
        penanggungJawabNama: draft?.penanggungJawabNama || defaultPj?.namaLengkap || '',
        alamat: draft?.alamat || defaultPj?.alamat || '-',
        lat: draft?.lat !== undefined ? draft.lat : -7.15,
        lng: draft?.lng !== undefined ? draft.lng : 113.48,
        toleransiRadiusMeter: draft?.toleransiRadiusMeter !== undefined ? draft.toleransiRadiusMeter : 100,
        honorTetapTeknisi: draft?.honorTetapTeknisi !== undefined ? draft.honorTetapTeknisi : 250000,
        targetPekerjaanBulanan: draft?.targetPekerjaanBulanan !== undefined ? draft.targetPekerjaanBulanan : 100,
        bonusTargetBulanan: draft?.bonusTargetBulanan !== undefined ? draft.bonusTargetBulanan : 100000,
        kontakPJ: draft?.kontakPJ || defaultPj?.kontak || '081234567890'
      });
    } else if (activeTab === 'wilayah') {
      const defaultServer = assignedServer || servers[0];
      const draft = StorageService.getMasterDataDraft('wilayah');

      setWilayahForm({
        namaWilayah: draft?.namaWilayah || '',
        serverId: draft?.serverId || defaultServer?.id || '',
        namaServer: draft?.namaServer || defaultServer?.namaServer || '',
        honorPJWilayah: draft?.honorPJWilayah !== undefined ? draft.honorPJWilayah : 250000,
        besaranTransport: draft?.besaranTransport !== undefined ? draft.besaranTransport : 50000
      });
    } else if (activeTab === 'jenis') {
      const draft = StorageService.getMasterDataDraft('jenis');

      setJenisForm({
        jenisPekerjaan: draft?.jenisPekerjaan || '',
        subPekerjaan: draft?.subPekerjaan || '',
        tarifDasar: draft?.tarifDasar !== undefined ? draft.tarifDasar : 100000,
        tarifTitik: draft?.tarifTitik !== undefined ? draft.tarifTitik : 20000,
        tarifTarikKabelPerMeter: draft?.tarifTarikKabelPerMeter !== undefined ? draft.tarifTarikKabelPerMeter : 2000,
        tarifLemburPerMenit: draft?.tarifLemburPerMenit !== undefined ? draft.tarifLemburPerMenit : 500,
        butuhInputTitik: draft?.butuhInputTitik !== undefined ? draft.butuhInputTitik : true,
        butuhPanjangKabel: draft?.butuhPanjangKabel !== undefined ? draft.butuhPanjangKabel : true,
        isMultiTeknisi: draft?.isMultiTeknisi !== undefined ? draft.isMultiTeknisi : true
      });
    } else if (activeTab === 'karyawan') {
      const draft = StorageService.getMasterDataDraft('karyawan');
      setHonorEffectiveMonth(getEffectiveTodayISO().slice(0, 7));

      setEmployeeForm({
        namaLengkap: draft?.namaLengkap || '',
        username: draft?.username || '',
        password: draft?.password || '123',
        role: draft?.role || 'Teknisi',
        status: draft?.status || 'Tetap',
        wilayahHandledIds: draft?.wilayahHandledIds || [],
        bonusTargetBulanan: draft?.bonusTargetBulanan !== undefined ? draft.bonusTargetBulanan : 300000,
        kontak: draft?.kontak || '',
        alamat: draft?.alamat || '',
        rekening: draft?.rekening || '',
        serverId: draft?.serverId || '',
        namaServer: draft?.namaServer || '',
        serverHonors: draft?.serverHonors || []
      });
    }
    setModalOpen(true);
  };

  const handleEditModal = (item: any) => {
    setEditingItem(item);
    if (activeTab === 'server') {
      const pjEmp = employees.find(
        e => e.id === item.penanggungJawabId ||
        (e.namaLengkap && item.penanggungJawabNama && e.namaLengkap.toLowerCase().trim() === item.penanggungJawabNama.toLowerCase().trim())
      );

      setServerForm({
        ...item,
        penanggungJawabId: pjEmp?.id || item.penanggungJawabId || '',
        penanggungJawabNama: pjEmp?.namaLengkap || item.penanggungJawabNama || '',
        alamat: pjEmp?.alamat || item.alamat || '-',
        kontakPJ: pjEmp?.kontak || item.kontakPJ || '-',
        lat: parseCoordinate(item.lat, 0),
        lng: parseCoordinate(item.lng, 0),
        toleransiRadiusMeter: Number(item.toleransiRadiusMeter) || 100,
        targetPekerjaanBulanan: item.targetPekerjaanBulanan !== undefined ? Number(item.targetPekerjaanBulanan) : 100,
        bonusTargetBulanan: item.bonusTargetBulanan !== undefined ? Number(item.bonusTargetBulanan) : 100000
      });
    }
    if (activeTab === 'wilayah') setWilayahForm(item);
    if (activeTab === 'jenis') setJenisForm(item);
    if (activeTab === 'karyawan') {
      setHonorEffectiveMonth(getEffectiveTodayISO().slice(0, 7));
      const matchedServer = servers.find(
        s => s.id === item.serverId ||
        s.penanggungJawabId === item.id ||
        (s.penanggungJawabNama && item.namaLengkap && s.penanggungJawabNama.toLowerCase().trim() === item.namaLengkap.toLowerCase().trim())
      );

      setEmployeeForm({
        ...item,
        serverId: item.serverId || matchedServer?.id || '',
        namaServer: item.namaServer || matchedServer?.namaServer || '',
        wilayahHandledIds: item.wilayahHandledIds || [],
        serverHonors: Array.isArray(item.serverHonors)
          ? item.serverHonors.map((sh: any) => ({
              ...sh,
              riwayat: Array.isArray(sh.riwayat) ? [...sh.riwayat] : undefined
            }))
          : []
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'server') {
      const parsedLat = parseCoordinate(serverForm.lat, 0);
      const parsedLng = parseCoordinate(serverForm.lng, 0);

      const matchingPj = employees.find(
        e => e.id === serverForm.penanggungJawabId ||
        (e.namaLengkap && serverForm.penanggungJawabNama && e.namaLengkap.toLowerCase().trim() === serverForm.penanggungJawabNama.toLowerCase().trim())
      );

      const finalPjNama = matchingPj?.namaLengkap || serverForm.penanggungJawabNama || 'Penanggung Jawab';
      const finalAlamat = matchingPj?.alamat || serverForm.alamat || '-';
      const finalKontak = matchingPj?.kontak || serverForm.kontakPJ || '-';

      const serverToSave: ServerData = {
        id: editingItem?.id || `srv-${Date.now()}`,
        namaServer: (serverForm.namaServer || 'Server Baru').trim(),
        penanggungJawabId: matchingPj?.id || serverForm.penanggungJawabId || employees[0]?.id || 'emp-1',
        penanggungJawabNama: finalPjNama.trim(),
        alamat: finalAlamat.trim(),
        lat: parsedLat,
        lng: parsedLng,
        toleransiRadiusMeter: Number(serverForm.toleransiRadiusMeter) || 100,
        honorTetapTeknisi: Number(serverForm.honorTetapTeknisi) || 0,
        targetPekerjaanBulanan: serverForm.targetPekerjaanBulanan !== undefined && Number(serverForm.targetPekerjaanBulanan) > 0 ? Number(serverForm.targetPekerjaanBulanan) : 100,
        bonusTargetBulanan: serverForm.bonusTargetBulanan !== undefined ? Number(serverForm.bonusTargetBulanan) : 100000,
        kontakPJ: finalKontak.trim(),
        createdAt: editingItem?.createdAt || new Date().toISOString()
      };
      onSaveServer(serverToSave);

      // Auto-sync PJ Employee record if matched
      if (matchingPj && (matchingPj.serverId !== serverToSave.id || matchingPj.namaServer !== serverToSave.namaServer)) {
        onSaveEmployee({
          ...matchingPj,
          serverId: serverToSave.id,
          namaServer: serverToSave.namaServer
        });
      }
    } else if (activeTab === 'wilayah') {
      const targetServerId = isPjServer && assignedServer ? assignedServer.id : (wilayahForm.serverId || servers[0]?.id || '');
      const selectedServer = servers.find(s => s.id === targetServerId) || assignedServer || servers[0];
      const wilayahToSave: WilayahPekerjaan = {
        id: editingItem?.id || `wil-${Date.now()}`,
        namaWilayah: wilayahForm.namaWilayah || 'Wilayah Baru',
        serverId: targetServerId,
        namaServer: selectedServer?.namaServer || 'Server Utama',
        honorPJWilayah: Number(wilayahForm.honorPJWilayah) || 0,
        besaranTransport: Number(wilayahForm.besaranTransport) || 0,
        createdAt: editingItem?.createdAt || new Date().toISOString()
      };
      onSaveWilayah(wilayahToSave);
    } else if (activeTab === 'jenis') {
      const tarifTitik = Number(jenisForm.tarifTitik) || 0;
      const tarifKabel = Number(jenisForm.tarifTarikKabelPerMeter) || 0;
      const jenisToSave: JenisPekerjaan = {
        id: editingItem?.id || `jp-${Date.now()}`,
        jenisPekerjaan: jenisForm.jenisPekerjaan || 'Pekerjaan Baru',
        subPekerjaan: jenisForm.subPekerjaan || 'Sub Pekerjaan',
        tarifDasar: Number(jenisForm.tarifDasar) || 0,
        tarifTitik,
        tarifTarikKabelPerMeter: tarifKabel,
        tarifLemburPerMenit: Number(jenisForm.tarifLemburPerMenit) || 0,
        butuhInputTitik: tarifTitik > 0 && Boolean(jenisForm.butuhInputTitik),
        butuhPanjangKabel: tarifKabel > 0 && Boolean(jenisForm.butuhPanjangKabel),
        isMultiTeknisi: Boolean(jenisForm.isMultiTeknisi),
        createdAt: editingItem?.createdAt || new Date().toISOString()
      };
      onSaveJenis(jenisToSave);
    } else if (activeTab === 'karyawan') {
      const selectedServerForPj = (employeeForm.role === 'Penanggungjawab Server' && employeeForm.serverId)
        ? servers.find(s => s.id === employeeForm.serverId)
        : undefined;

      const currentServerHonors = (employeeForm.serverHonors || []).map(sh => {
        const cleanRiwayat = Array.isArray(sh.riwayat)
          ? sh.riwayat
              .filter(r => r && r.berlakuMulai && /^\d{4}-\d{2}$/.test(r.berlakuMulai) && Number(r.nominal) >= 0)
              .sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai))
          : [];
        const latestNominal = cleanRiwayat.length > 0
          ? Number(cleanRiwayat[cleanRiwayat.length - 1].nominal) || 0
          : (Number(sh.nominal) || 0);
        const latestBerlaku = cleanRiwayat.length > 0
          ? cleanRiwayat[cleanRiwayat.length - 1].berlakuMulai
          : sh.berlakuMulai;

        return {
          serverId: sh.serverId,
          namaServer: sh.namaServer || servers.find(s => s.id === sh.serverId)?.namaServer || '',
          nominal: latestNominal,
          ...(latestBerlaku ? { berlakuMulai: latestBerlaku } : {}),
          ...(cleanRiwayat.length > 0 ? { riwayat: cleanRiwayat } : {})
        };
      }).filter(sh => sh.nominal > 0 || (sh.riwayat && sh.riwayat.some(r => r.nominal > 0)));

      const totalHonorTetap = currentServerHonors.reduce((sum, sh) => sum + sh.nominal, 0);

      const empToSave: Employee = {
        id: editingItem?.id || `emp-${Date.now()}`,
        namaLengkap: (employeeForm.namaLengkap || 'Nama Karyawan').trim(),
        username: (employeeForm.username || `user${Date.now()}`).trim(),
        password: employeeForm.password || '123',
        role: employeeForm.role || 'Teknisi',
        status: employeeForm.status || 'Tetap',
        honorTetapBulanan: totalHonorTetap,
        serverHonors: currentServerHonors,
        wilayahHandledIds: employeeForm.wilayahHandledIds || [],
        bonusTargetBulanan: Number(employeeForm.bonusTargetBulanan) || 0,
        kontak: employeeForm.kontak || '-',
        alamat: employeeForm.alamat || '-',
        rekening: employeeForm.rekening || '-',
        serverId: employeeForm.role === 'Penanggungjawab Server' ? (employeeForm.serverId || '') : undefined,
        namaServer: employeeForm.role === 'Penanggungjawab Server' ? (selectedServerForPj?.namaServer || employeeForm.namaServer || '') : undefined,
        createdAt: editingItem?.createdAt || new Date().toISOString()
      };
      onSaveEmployee(empToSave);

      // If this employee is Penanggungjawab Server, auto update and synchronize contact info with the managed server!
      const targetServerForPj = selectedServerForPj || (empToSave.role === 'Penanggungjawab Server' ? servers.find(
        s => (empToSave.serverId && s.id === empToSave.serverId) ||
        s.penanggungJawabId === empToSave.id ||
        (s.penanggungJawabNama && empToSave.namaLengkap && s.penanggungJawabNama.toLowerCase().trim() === empToSave.namaLengkap.toLowerCase().trim())
      ) : undefined);

      if (empToSave.role === 'Penanggungjawab Server' && targetServerForPj) {
        onSaveServer({
          ...targetServerForPj,
          penanggungJawabId: empToSave.id,
          penanggungJawabNama: empToSave.namaLengkap,
          alamat: empToSave.alamat && empToSave.alamat !== '-' ? empToSave.alamat : targetServerForPj.alamat,
          kontakPJ: empToSave.kontak && empToSave.kontak !== '-' ? empToSave.kontak : targetServerForPj.kontakPJ
        });
      }
    }
    StorageService.clearMasterDataDraft(activeTab);
    setModalOpen(false);
  };

  // User Request #3: Urutkan list daftar server dan karyawan berdasarkan yang terlama ke terbaru (Ascending)
  const sortedServers = [...servers].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (Number(a.id.replace(/\D/g, '')) || 0);
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (Number(b.id.replace(/\D/g, '')) || 0);
    return timeA - timeB;
  });

  const sortedEmployees = [...employees].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (Number(a.id.replace(/\D/g, '')) || 0);
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (Number(b.id.replace(/\D/g, '')) || 0);
    return timeA - timeB;
  });

  // State untuk Pencarian dan Filter Data Karyawan
  const [empSearchTerm, setEmpSearchTerm] = useState<string>('');
  const [empRoleFilter, setEmpRoleFilter] = useState<string>('all');
  const [empServerFilter, setEmpServerFilter] = useState<string>('all');

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return sortedEmployees.filter(emp => {
      // Role filter
      if (empRoleFilter !== 'all' && emp.role !== empRoleFilter) {
        return false;
      }

      // Server filter
      if (empServerFilter !== 'all') {
        const matchesServer =
          emp.serverId === empServerFilter ||
          (emp.namaServer && servers.find(s => s.id === empServerFilter)?.namaServer === emp.namaServer) ||
          emp.serverHonors?.some(sh => sh.serverId === empServerFilter || (sh.namaServer && servers.find(s => s.id === empServerFilter)?.namaServer === sh.namaServer));
        if (!matchesServer) return false;
      }

      // Search term
      if (empSearchTerm.trim()) {
        const q = empSearchTerm.toLowerCase().trim();
        const matchName = emp.namaLengkap.toLowerCase().includes(q);
        const matchUsername = (emp.username || '').toLowerCase().includes(q);
        const matchKontak = (emp.kontak || '').toLowerCase().includes(q);
        const matchAlamat = (emp.alamat || '').toLowerCase().includes(q);
        const matchRekening = (emp.rekening || '').toLowerCase().includes(q);
        const matchServer = (emp.namaServer || '').toLowerCase().includes(q);
        if (!matchName && !matchUsername && !matchKontak && !matchAlamat && !matchRekening && !matchServer) {
          return false;
        }
      }

      return true;
    });
  }, [sortedEmployees, empRoleFilter, empServerFilter, empSearchTerm, servers]);

  // Statistik Karyawan untuk KPI Card di atas tabel
  const employeeStats = useMemo(() => {
    const totalCount = sortedEmployees.length;
    const teknisiCount = sortedEmployees.filter(e => e.role === 'Teknisi').length;
    const pjCount = sortedEmployees.filter(e => e.role === 'Penanggungjawab Server').length;
    const adminCount = sortedEmployees.filter(e => e.role === 'Admin').length;
    const totalHonorTetap = sortedEmployees.reduce((sum, emp) => {
      const activeHonors = emp.serverHonors?.filter(sh => (Number(sh.nominal) || 0) > 0) || [];
      const totalEmpHonor = activeHonors.reduce((s, sh) => s + (Number(sh.nominal) || 0), 0);
      return sum + (totalEmpHonor || Number(emp.honorTetapBulanan) || 0);
    }, 0);

    return {
      totalCount,
      teknisiCount,
      pjCount,
      adminCount,
      totalHonorTetap
    };
  }, [sortedEmployees]);

  const handleDeleteServerPrompt = async (id: string, nama: string) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Data Server?',
      message: `Apakah Anda yakin ingin menghapus server "${nama}"? Data pekerjaan atau konfigurasi yang terkait dengan server ini mungkin terpengaruh.`,
      type: 'warning',
      confirmText: 'Ya, Hapus Server',
      cancelText: 'Batal'
    });
    if (confirmed) onDeleteServer(id);
  };

  const handleDeleteWilayahPrompt = async (id: string, nama: string) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Wilayah Pekerjaan?',
      message: `Apakah Anda yakin ingin menghapus wilayah "${nama}"?`,
      type: 'warning',
      confirmText: 'Ya, Hapus Wilayah',
      cancelText: 'Batal'
    });
    if (confirmed) onDeleteWilayah(id);
  };

  const handleDeleteJenisPrompt = async (id: string, jenis: string, sub: string) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Jenis Pekerjaan?',
      message: `Apakah Anda yakin ingin menghapus tarif "${jenis} - ${sub}"?`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });
    if (confirmed) onDeleteJenis(id);
  };

  const handleDeleteEmployeePrompt = async (id: string, nama: string) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Data Karyawan?',
      message: `Apakah Anda yakin ingin menghapus karyawan "${nama}"?`,
      type: 'warning',
      confirmText: 'Ya, Hapus Karyawan',
      cancelText: 'Batal'
    });
    if (confirmed) onDeleteEmployee(id);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Sub Menu Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Master Data Aplikasi: {
              activeTab === 'server' ? 'Data Server' :
              activeTab === 'wilayah' ? 'Wilayah Pekerjaan' :
              activeTab === 'jenis' ? 'Jenis Pekerjaan' : 'Data Karyawan'
            }
          </h2>
        </div>

        {(!isPjServer || activeTab === 'wilayah') && (
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-md flex items-center space-x-1.5 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Data baru</span>
          </button>
        )}
      </div>

      {/* TAB CONTENT 1: DATA SERVER */}
      {activeTab === 'server' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
            <span>
              {isPjServer
                ? `Menampilkan Server ${assignedServer ? `(${assignedServer.namaServer})` : ''}`
                : `Total ${sortedServers.length} Server Terdaftar`}
            </span>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold text-[10px]">
              Urutan: Terlama ke Terbaru
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedServers
              .filter(srv => !isPjServer || isServerOwnedByUser(srv))
              .map(srv => {
                const isOwned = isServerOwnedByUser(srv);
                return (
                  <div
                    key={srv.id}
                    className={`bg-white border ${isOwned && isPjServer ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'} rounded-2xl p-5 shadow-xs relative flex flex-col justify-between space-y-3`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-extrabold text-slate-900 text-base">{srv.namaServer}</h3>
                            {isPjServer && isOwned && (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-md">
                                Server Anda
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-indigo-600 font-semibold mt-0.5">
                            PJ: {srv.penanggungJawabNama}
                          </p>
                        </div>
                        <div className="flex items-center space-x-1">
                          {(!isPjServer || isOwned) && (
                            <button
                              onClick={() => handleEditModal(srv)}
                              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                              title="Edit Data Server"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}
                          {!isPjServer && (
                            <button
                              onClick={() => handleDeleteServerPrompt(srv.id, srv.namaServer)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                              title="Hapus Server"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 mt-2 flex items-start space-x-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>{srv.alamat}</span>
                      </p>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Koordinat GPS (Pin)</span>
                          {isValidLatLng(srv.lat, srv.lng) ? (
                            <a
                              href={`https://www.google.com/maps?q=${srv.lat},${srv.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono font-bold text-maroon-800 hover:text-maroon-900 hover:underline text-[11px] inline-flex items-center space-x-1"
                              title="Buka lokasi di Google Maps"
                            >
                              <MapPin className="w-3 h-3 text-maroon-800 flex-shrink-0" />
                              <span>{formatCoordinate(srv.lat, 4)}, {formatCoordinate(srv.lng, 4)}</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              ⚠️ Belum di-pin (0, 0)
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Toleransi Radius</span>
                          <span className="font-bold text-slate-800">{srv.toleransiRadiusMeter} Meter</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="p-3 bg-maroon-50/70 border border-maroon-100 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-maroon-800 block font-semibold">
                            Total Honor Pokok Dikeluarkan Server:
                          </span>
                          <span className="font-extrabold text-maroon-900 text-sm">
                            {(() => {
                              const totalSrv = employees.reduce((sum, emp) => {
                                const sh = emp.serverHonors?.find(
                                  h => h.serverId === srv.id ||
                                  (h.namaServer && srv.namaServer && h.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                );
                                return sum + (Number(sh?.nominal) || 0);
                              }, 0);
                              return formatRupiah(totalSrv);
                            })()}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {(() => {
                              const countTeknisi = employees.filter(emp =>
                                emp.serverHonors?.some(
                                  h => (h.serverId === srv.id || (h.namaServer && srv.namaServer && h.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())) && (Number(h.nominal) || 0) > 0
                                )
                              ).length;
                              return `${countTeknisi} Teknisi (Dikelola di Menu Karyawan)`;
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 text-slate-600">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold">{srv.kontakPJ}</span>
                        </div>
                      </div>

                      <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-emerald-800 block font-bold">
                            Target & Bonus Bulanan:
                          </span>
                          <span className="font-black text-emerald-950 text-sm">
                            {formatRupiah(srv.bonusTargetBulanan !== undefined ? srv.bonusTargetBulanan : 100000)}
                          </span>
                          <span className="text-[10px] text-slate-600 block font-semibold">
                            Target: <strong className="text-slate-900">{srv.targetPekerjaanBulanan !== undefined ? srv.targetPekerjaanBulanan : 100} Pekerjaan</strong> / bln
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100/90 px-2 py-1 rounded-lg block border border-emerald-200">
                            🎯 Capaian % × Bonus
                          </span>
                          <span className="text-[9px] text-slate-500 block mt-0.5 font-medium">
                            ≥100% Target = 100% Bonus
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: WILAYAH PEKERJAAN */}
      {activeTab === 'wilayah' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
            <span>
              {isPjServer
                ? `Wilayah pada Server Anda (${assignedServer?.namaServer || 'Server Terkait'})`
                : `Total ${wilayahList.length} Wilayah Terdaftar`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {wilayahList
              .filter(wil => !isPjServer || isServerOwnedByUser({ id: wil.serverId, namaServer: wil.namaServer } as any))
              .map(wil => {
                const isOwned = isServerOwnedByUser({ id: wil.serverId, namaServer: wil.namaServer } as any);
                return (
                  <div
                    key={wil.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-slate-900 text-sm">{wil.namaWilayah}</h3>
                        <div className="flex items-center space-x-1">
                          {(!isPjServer || isOwned) && (
                            <button
                              onClick={() => handleEditModal(wil)}
                              className="p-1 text-slate-500 hover:bg-slate-100 rounded-lg"
                              title="Edit Wilayah"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(!isPjServer || isOwned) && (
                            <button
                              onClick={() => handleDeleteWilayahPrompt(wil.id, wil.namaWilayah)}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                              title="Hapus Wilayah"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-semibold mb-3">
                        <Server className="w-3 h-3 text-slate-500" />
                        <span>{wil.namaServer}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Honor PJ Wilayah:</span>
                        <span className="font-bold text-indigo-600">{formatRupiah(wil.honorPJWilayah)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Besaran Transport:</span>
                        <span className="font-bold text-emerald-600">{formatRupiah(wil.besaranTransport)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: JENIS PEKERJAAN */}
      {activeTab === 'jenis' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortJenisPekerjaan(jenisList).map(j => (
            <div
              key={j.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{j.jenisPekerjaan}</h3>
                  <p className="text-xs text-indigo-600 font-normal">{j.subPekerjaan}</p>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleEditModal(j)}
                    className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteJenisPrompt(j.id, j.jenisPekerjaan, j.subPekerjaan)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    title="Hapus Jenis Pekerjaan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Rates Breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-400 block">Tarif Dasar</span>
                  <span className="font-extrabold text-slate-800">{formatRupiah(j.tarifDasar)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Tarif Titik</span>
                  <span className="font-extrabold text-slate-800">{formatRupiah(j.tarifTitik)} /titik</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Tarif Tarik Kabel</span>
                  <span className="font-extrabold text-slate-800">{formatRupiah(j.tarifTarikKabelPerMeter)} /m</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Tarif Lembur</span>
                  <span className="font-extrabold text-slate-800">{formatRupiah(j.tarifLemburPerMenit)} /min</span>
                </div>
              </div>

              {/* Checkbox Checklist indicators */}
              <div className="flex flex-wrap gap-2 text-[10px] font-normal">
                <span
                  className={`px-2 py-1 rounded-md flex items-center space-x-1 ${
                    j.butuhInputTitik
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-400 line-through'
                  }`}
                >
                  {j.butuhInputTitik ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  <span>Input Titik</span>
                </span>

                <span
                  className={`px-2 py-1 rounded-md flex items-center space-x-1 ${
                    j.butuhPanjangKabel
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-400 line-through'
                  }`}
                >
                  {j.butuhPanjangKabel ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  <span>Panjang Kabel</span>
                </span>

                <span
                  className={`px-2 py-1 rounded-md flex items-center space-x-1 ${
                    j.isMultiTeknisi
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>{j.isMultiTeknisi ? 'Multi Teknisi' : 'Single Teknisi'}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB CONTENT 4: DATA KARYAWAN - MODERN & INTUITIVE (GAMBAR 2) */}
      {activeTab === 'karyawan' && (
        <div className="space-y-4">
          {/* 1. TOP HEADER & ACTION BUTTON */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-maroon-700 to-rose-900 text-white flex items-center justify-center shadow-md shadow-maroon-900/20 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Data Karyawan
                  </h3>
                  <span className="px-2.5 py-0.5 bg-maroon-50 text-maroon-800 text-[10px] font-extrabold rounded-full border border-maroon-200">
                    {sortedEmployees.length} Total
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Kelola data akun, peran teknisi, honor tetap server, dan penanggung jawab
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 bg-maroon-800 hover:bg-maroon-900 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center space-x-1.5 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Karyawan Baru</span>
            </button>
          </div>

          {/* 2. TOP METRIC / STATS KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            {/* Card 1: Total Karyawan */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  TOTAL KARYAWAN
                </span>
                <p className="text-xl sm:text-2xl font-black text-slate-900 leading-tight mt-0.5">
                  {employeeStats.totalCount}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Semua akun terdaftar
                </p>
              </div>
              <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl shrink-0">
                <Users className="w-5 h-5" />
              </div>
            </div>

            {/* Card 2: Teknisi Lapangan */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block">
                  TEKNISI LAPANGAN
                </span>
                <p className="text-xl sm:text-2xl font-black text-indigo-700 leading-tight mt-0.5">
                  {employeeStats.teknisiCount}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Petugas operasional
                </p>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3: PJ Server */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-maroon-700 block">
                  PJ SERVER
                </span>
                <p className="text-xl sm:text-2xl font-black text-maroon-900 leading-tight mt-0.5">
                  {employeeStats.pjCount}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Penanggung jawab lokasi
                </p>
              </div>
              <div className="p-2.5 bg-maroon-50 text-maroon-800 rounded-xl shrink-0">
                <Server className="w-5 h-5" />
              </div>
            </div>

            {/* Card 4: Total Honor Pokok */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">
                  TOTAL HONOR TETAP
                </span>
                <p className="text-base sm:text-lg font-black text-emerald-800 leading-tight mt-0.5 truncate" title={formatRupiah(employeeStats.totalHonorTetap)}>
                  {formatRupiah(employeeStats.totalHonorTetap)}
                </p>
                <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  Akumulasi honor bulanan
                </p>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* 3. SEARCH & FILTER TOOLBAR */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* Search Bar Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari nama karyawan, username, kontak, atau rekening..."
                  value={empSearchTerm}
                  onChange={e => setEmpSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-maroon-800/30 focus:border-maroon-800 transition-all font-medium"
                />
                {empSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setEmpSearchTerm('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
                    title="Hapus pencarian"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filters Dropdown */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Role Filter */}
                <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
                  <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={empRoleFilter}
                    onChange={e => setEmpRoleFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer pr-1"
                    title="Filter berdasarkan Peran"
                  >
                    <option value="all">Semua Peran</option>
                    <option value="Teknisi">Teknisi Lapangan</option>
                    <option value="Penanggungjawab Server">PJ Server</option>
                    <option value="Admin">Administrator</option>
                  </select>
                </div>

                {/* Server Filter */}
                <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
                  <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={empServerFilter}
                    onChange={e => setEmpServerFilter(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer pr-1 max-w-[150px] truncate"
                    title="Filter berdasarkan Server"
                  >
                    <option value="all">Semua Server</option>
                    {servers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.namaServer}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reset Filter Button */}
                {(empSearchTerm || empRoleFilter !== 'all' || empServerFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmpSearchTerm('');
                      setEmpRoleFilter('all');
                      setEmpServerFilter('all');
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
                Menampilkan <strong>{filteredEmployees.length}</strong> dari {sortedEmployees.length} Karyawan Terdaftar
              </span>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold text-[10px]">
                Urutan: Terlama ke Terbaru
              </span>
            </div>
          </div>

          {/* 4. TAMPILAN MOBILE: KARTU RESPONSIF & TOUCH-FRIENDLY */}
          <div className="block md:hidden space-y-3">
            {filteredEmployees.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Tidak ada karyawan yang cocok</p>
                <p className="text-[11px] text-slate-400">Silakan sesuaikan kata kunci atau filter pencarian Anda.</p>
              </div>
            ) : (
              filteredEmployees.map((emp, idx) => {
                const activeHonors = emp.serverHonors?.filter(sh => (Number(sh.nominal) || 0) > 0) || [];
                const totalHonorPokok = activeHonors.reduce((sum, sh) => sum + (Number(sh.nominal) || 0), 0);
                const estHonorPJ = (emp.wilayahHandledIds || []).reduce((sum, wId) => sum + (wilayahList.find(x => x.id === wId)?.honorPJWilayah || 0), 0);
                const initials = emp.namaLengkap.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

                return (
                  <div
                    key={emp.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
                  >
                    {/* Header: Avatar, Nama, Role, Aksi */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-start space-x-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-maroon-700 to-rose-900 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-900 text-sm leading-tight truncate">
                            {emp.namaLengkap}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                            @{emp.username} {emp.kontak ? `• ${emp.kontak}` : ''}
                          </p>
                          {emp.wilayahHandledIds && emp.wilayahHandledIds.length > 0 && (() => {
                            const validWilayahs = emp.wilayahHandledIds
                              .map(wId => wilayahList.find(x => x.id === wId))
                              .filter((w): w is NonNullable<typeof w> => Boolean(w));
                            const rowsOfThree: typeof validWilayahs[] = [];
                            for (let i = 0; i < validWilayahs.length; i += 3) {
                              rowsOfThree.push(validWilayahs.slice(i, i + 3));
                            }
                            return (
                              <div className="mt-2 pt-1.5 border-t border-slate-100 space-y-1">
                                <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">
                                  Wilayah Handled (PJ):
                                </span>
                                <div className="space-y-1">
                                  {rowsOfThree.map((rowItems, rIdx) => (
                                    <div key={rIdx} className="flex flex-wrap items-center gap-1">
                                      {rowItems.map(w => (
                                        <span
                                          key={w.id}
                                          className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold whitespace-nowrap"
                                        >
                                          {w.namaWilayah} ({w.namaServer})
                                        </span>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[10px] font-extrabold text-emerald-700 pt-0.5">
                                  Est. Honor PJ: {formatRupiah(estHonorPJ)}
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditModal(emp)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 shadow-2xs active:scale-95"
                          title="Edit Data Karyawan"
                        >
                          <Edit className="w-3.5 h-3.5 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEmployeePrompt(emp.id, emp.namaLengkap)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 shadow-2xs active:scale-95"
                          title="Hapus Karyawan"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </button>
                      </div>
                    </div>

                    {/* Badges: Role & Status */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`px-2 py-0.5 font-bold rounded-md border ${
                        emp.role === 'Penanggungjawab Server'
                          ? 'bg-maroon-50 text-maroon-800 border-maroon-200'
                          : emp.role === 'Admin'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}>
                        {emp.role}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md border border-slate-200">
                        Status: {emp.status}
                      </span>
                      {emp.bonusTargetBulanan > 0 && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-md border border-emerald-200">
                          Bonus: {formatRupiah(emp.bonusTargetBulanan)}
                        </span>
                      )}
                    </div>

                    {/* Details Breakdown */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 text-xs">
                      {/* Honor Server */}
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold block mb-1">Honor Tetap Server:</span>
                        {activeHonors.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {activeHonors.map(sh => {
                                const srvName = sh.namaServer || servers.find(s => s.id === sh.serverId)?.namaServer || 'Server';
                                const sortedHist = Array.isArray(sh.riwayat)
                                  ? [...sh.riwayat].sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai))
                                  : [];
                                const hasHistory = sortedHist.length > 1;
                                return (
                                  <div key={sh.serverId} className="inline-flex flex-col">
                                    <span className="px-2 py-0.5 bg-maroon-50 text-maroon-900 border border-maroon-200 rounded-md text-[10px] font-bold">
                                      {srvName}: {formatRupiah(sh.nominal)}
                                    </span>
                                    {hasHistory && (
                                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5 px-1">
                                        {sortedHist.map(h => `${formatPeriodMonthLabel(h.berlakuMulai)}: ${formatRupiah(h.nominal)}`).join(' → ')}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[10px] font-extrabold text-maroon-900">
                              Total: {formatRupiah(totalHonorPokok)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">- (Rp 0)</span>
                        )}
                      </div>

                      {/* Alamat & Rekening */}
                      <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 gap-1">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Alamat:</span>
                          <span className="text-slate-700 text-xs font-medium">{emp.alamat || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Rekening:</span>
                          <span className="text-indigo-700 text-xs font-bold font-mono">{emp.rekening || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 5. TAMPILAN DESKTOP: TABEL LENGKAP DENGAN DESAIN MODERN & RAPI */}
          <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-3.5 w-12 text-center">No</th>
                    <th className="p-3.5">Karyawan</th>
                    <th className="p-3.5">Role & Status</th>
                    <th className="p-3.5">Honor Tetap Server</th>
                    <th className="p-3.5">Alamat & Rekening</th>
                    <th className="p-3.5">Bonus Target</th>
                    <th className="p-3.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-bold text-slate-700 text-sm">Tidak ada karyawan yang cocok</p>
                        <p className="text-xs text-slate-400 mt-0.5">Ubah kata kunci pencarian atau reset filter peran/server.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp, idx) => {
                      const activeHonors = emp.serverHonors?.filter(sh => (Number(sh.nominal) || 0) > 0) || [];
                      const totalHonorPokok = activeHonors.reduce((sum, sh) => sum + (Number(sh.nominal) || 0), 0);
                      const estHonorPJ = (emp.wilayahHandledIds || []).reduce((sum, wId) => sum + (wilayahList.find(x => x.id === wId)?.honorPJWilayah || 0), 0);
                      const initials = emp.namaLengkap.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors align-top">
                          <td className="p-3.5 text-center font-bold text-slate-400">
                            #{idx + 1}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-start space-x-2.5">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-maroon-700 to-rose-900 text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p className="font-extrabold text-slate-900 text-xs leading-tight">
                                  {emp.namaLengkap}
                                </p>
                                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  @{emp.username} {emp.kontak ? `• ${emp.kontak}` : ''}
                                </p>
                                {emp.wilayahHandledIds && emp.wilayahHandledIds.length > 0 && (() => {
                                  const validWilayahs = emp.wilayahHandledIds
                                    .map(wId => wilayahList.find(x => x.id === wId))
                                    .filter((w): w is NonNullable<typeof w> => Boolean(w));
                                  const rowsOfThree: typeof validWilayahs[] = [];
                                  for (let i = 0; i < validWilayahs.length; i += 3) {
                                    rowsOfThree.push(validWilayahs.slice(i, i + 3));
                                  }
                                  return (
                                    <div className="mt-2 pt-1.5 border-t border-slate-100 space-y-1">
                                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                        Wilayah Handled (PJ):
                                      </span>
                                      <div className="space-y-1">
                                        {rowsOfThree.map((rowItems, rIdx) => (
                                          <div key={rIdx} className="flex items-center gap-1.5">
                                            {rowItems.map(w => (
                                              <span
                                                key={w.id}
                                                className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold whitespace-nowrap"
                                              >
                                                {w.namaWilayah} ({w.namaServer})
                                              </span>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                      <p className="text-[10px] font-extrabold text-emerald-700 pt-0.5">
                                        Est. Honor PJ: {formatRupiah(estHonorPJ)}
                                      </p>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 space-y-1">
                            <span className={`px-2 py-0.5 font-bold rounded-md text-[10px] inline-block border ${
                              emp.role === 'Penanggungjawab Server'
                                ? 'bg-maroon-50 text-maroon-800 border-maroon-200'
                                : emp.role === 'Admin'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}>
                              {emp.role}
                            </span>
                            <span className="text-slate-500 text-[11px] block font-semibold">
                              Status: {emp.status}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {activeHonors.length > 0 ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {activeHonors.map(sh => {
                                    const srvName = sh.namaServer || servers.find(s => s.id === sh.serverId)?.namaServer || 'Server';
                                    const sortedHist = Array.isArray(sh.riwayat)
                                      ? [...sh.riwayat].sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai))
                                      : [];
                                    const hasHistory = sortedHist.length > 1;
                                    return (
                                      <div key={sh.serverId} className="inline-flex flex-col">
                                        <span className="px-2 py-0.5 bg-maroon-50 text-maroon-900 border border-maroon-200 rounded-md text-[10px] font-bold">
                                          {srvName}: {formatRupiah(sh.nominal)}
                                        </span>
                                        {hasHistory && (
                                          <span className="text-[9px] text-slate-500 font-semibold mt-0.5 px-0.5">
                                            {sortedHist.map(h => `${formatPeriodMonthLabel(h.berlakuMulai)}: ${formatRupiah(h.nominal)}`).join(' → ')}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] font-extrabold text-maroon-900">
                                  Total: {formatRupiah(totalHonorPokok)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">- (Rp 0)</span>
                            )}
                          </td>
                          <td className="p-3.5 text-slate-700">
                            <div className="flex items-start space-x-1 max-w-xs">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <p className="font-bold text-slate-800 truncate" title={emp.alamat || '-'}>
                                {emp.alamat || '-'}
                              </p>
                            </div>
                            <div className="flex items-center space-x-1 mt-0.5">
                              <CreditCard className="w-3 h-3 text-indigo-500 shrink-0" />
                              <p className="text-[11px] text-indigo-700 font-mono font-bold truncate">
                                {emp.rekening || 'Rekening: -'}
                              </p>
                            </div>
                          </td>
                          <td className="p-3.5 font-extrabold text-emerald-700">
                            {formatRupiah(emp.bonusTargetBulanan)}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleEditModal(emp)}
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-2xs"
                                title="Edit Data Karyawan"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployeePrompt(emp.id, emp.namaLengkap)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors shadow-2xs"
                                title="Hapus Karyawan"
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
          </div>
        </div>
      )}

      {/* CRUD MODAL FORM */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingItem ? 'Edit Data' : 'Tambah Data Baru'} ({activeTab.toUpperCase()})
              </h3>
              <button
                onClick={handleRequestCloseModal}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
              {/* SERVER FORM */}
              {activeTab === 'server' && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Nama Server</label>
                    <input
                      type="text"
                      required
                      value={serverForm.namaServer || ''}
                      onChange={e => setServerForm({ ...serverForm, namaServer: e.target.value })}
                      placeholder="misal: Server Utama RT/RW Net"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Pilih Karyawan Penanggung Jawab Server
                    </label>
                    <select
                      value={serverForm.penanggungJawabId || ''}
                      onChange={e => {
                        const chosenId = e.target.value;
                        const chosenEmp = employees.find(emp => emp.id === chosenId);
                        if (chosenEmp) {
                          setServerForm(prev => ({
                            ...prev,
                            penanggungJawabId: chosenEmp.id,
                            penanggungJawabNama: chosenEmp.namaLengkap,
                            alamat: chosenEmp.alamat || '-',
                            kontakPJ: chosenEmp.kontak || prev.kontakPJ || '-'
                          }));
                        }
                      }}
                      disabled={isPjServer}
                      className={`w-full p-2.5 rounded-xl text-xs font-semibold ${
                        isPjServer
                          ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                          : 'bg-slate-50 border border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="">-- Pilih Karyawan PJ Server --</option>
                      {employees
                        .filter(e => e.role === 'Penanggungjawab Server' || e.id === serverForm.penanggungJawabId)
                        .map(e => (
                          <option key={e.id} value={e.id}>
                            {e.namaLengkap} ({e.role})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-700 font-bold">Nama Penanggung Jawab Server</label>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                        🔒 Otomatis dari Data Karyawan
                      </span>
                    </div>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={serverForm.penanggungJawabNama || ''}
                      placeholder="Otomatis diambil dari Data Karyawan (Role PJ Server)..."
                      className="w-full p-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl cursor-not-allowed font-semibold"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Nama PJ Server tidak dapat diedit langsung, disinkronkan dari data karyawan terkait.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-700 font-bold">Alamat Server</label>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                        🔒 Otomatis dari Data Karyawan
                      </span>
                    </div>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={serverForm.alamat || ''}
                      placeholder="Otomatis diambil dari Alamat Karyawan PJ Server..."
                      className="w-full p-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl cursor-not-allowed font-semibold"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Alamat Server tidak dapat diedit langsung, disinkronkan dari alamat domisili karyawan PJ Server.
                    </p>
                  </div>

                  {/* Pin Peta Lokasi Server & GPS */}
                  <div className="pt-1">
                    <MapLocationPicker
                      lat={parseCoordinate(serverForm.lat, 0)}
                      lng={parseCoordinate(serverForm.lng, 0)}
                      radiusMeter={Number(serverForm.toleransiRadiusMeter) || 100}
                      serverName={serverForm.namaServer || 'Lokasi Server'}
                      onChange={(newLat, newLng) => {
                        setServerForm(prev => ({ ...prev, lat: newLat, lng: newLng }));
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Toleransi Radius (m)</label>
                      <NumericInput
                        value={serverForm.toleransiRadiusMeter ?? 100}
                        onChange={val => setServerForm({ ...serverForm, toleransiRadiusMeter: val })}
                        min={0}
                        suffix="m"
                      />
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-center">
                      <span className="text-[11px] font-bold text-slate-700 block">Honor Pokok Teknisi:</span>
                      <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                        Besaran honor pokok kini ditentukan per karyawan/teknisi pada menu <strong>Karyawan</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Target Pekerjaan Bulanan (Qty)
                        <span className="text-[10px] text-emerald-700 font-normal ml-1">
                          (Jumlah Pekerjaan)
                        </span>
                      </label>
                      <NumericInput
                        value={serverForm.targetPekerjaanBulanan ?? 100}
                        onChange={val => setServerForm({ ...serverForm, targetPekerjaanBulanan: val })}
                        min={1}
                        prefix=""
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        Besaran Bonus Target (Rp)
                        <span className="text-[10px] text-emerald-700 font-normal ml-1">
                          (Jika 100% Target)
                        </span>
                      </label>
                      <NumericInput
                        value={serverForm.bonusTargetBulanan ?? 100000}
                        onChange={val => setServerForm({ ...serverForm, bonusTargetBulanan: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Kontak Penanggung Jawab</label>
                    <input
                      type="text"
                      value={serverForm.kontakPJ || ''}
                      onChange={e => setServerForm({ ...serverForm, kontakPJ: e.target.value })}
                      placeholder="081234567890"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </>
              )}

              {/* WILAYAH FORM */}
              {activeTab === 'wilayah' && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Nama Wilayah Pekerjaan</label>
                    <input
                      type="text"
                      required
                      value={wilayahForm.namaWilayah || ''}
                      onChange={e => setWilayahForm({ ...wilayahForm, namaWilayah: e.target.value })}
                      placeholder="Wilayah RW 01 Cipinang"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Server Terhubung</label>
                    <select
                      value={wilayahForm.serverId || ''}
                      onChange={e => setWilayahForm({ ...wilayahForm, serverId: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      {[...servers]
                        .sort((a, b) => a.namaServer.localeCompare(b.namaServer, 'id', { sensitivity: 'base' }))
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.namaServer}</option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Honor PJ Wilayah (Rp)</label>
                      <NumericInput
                        value={wilayahForm.honorPJWilayah ?? 250000}
                        onChange={val => setWilayahForm({ ...wilayahForm, honorPJWilayah: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Besaran Transport (Rp)</label>
                      <NumericInput
                        value={wilayahForm.besaranTransport ?? 50000}
                        onChange={val => setWilayahForm({ ...wilayahForm, besaranTransport: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                  </div>
                </>
              )}

              {/* JENIS PEKERJAAN FORM */}
              {activeTab === 'jenis' && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Jenis Pekerjaan Utama</label>
                    <input
                      type="text"
                      required
                      value={jenisForm.jenisPekerjaan || ''}
                      onChange={e => setJenisForm({ ...jenisForm, jenisPekerjaan: e.target.value })}
                      placeholder="misal: Pemasangan Baru (PSB)"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Sub Pekerjaan</label>
                    <input
                      type="text"
                      required
                      value={jenisForm.subPekerjaan || ''}
                      onChange={e => setJenisForm({ ...jenisForm, subPekerjaan: e.target.value })}
                      placeholder="misal: Instalasi Dropcore & ONT"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Tarif Dasar (Rp)</label>
                      <NumericInput
                        value={jenisForm.tarifDasar ?? 100000}
                        onChange={val => setJenisForm({ ...jenisForm, tarifDasar: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Tarif Titik (Rp)</label>
                      <NumericInput
                        value={jenisForm.tarifTitik ?? 20000}
                        onChange={val => setJenisForm({ ...jenisForm, tarifTitik: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Tarif Cable/Meter (Rp)</label>
                      <NumericInput
                        value={jenisForm.tarifTarikKabelPerMeter ?? 2000}
                        onChange={val => setJenisForm({ ...jenisForm, tarifTarikKabelPerMeter: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Tarif Lembur/Menit (Rp)</label>
                      <NumericInput
                        value={jenisForm.tarifLemburPerMenit ?? 500}
                        onChange={val => setJenisForm({ ...jenisForm, tarifLemburPerMenit: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                  </div>

                  {/* Requirements Checklist */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="font-bold text-slate-700">Ketentuan Input Field:</p>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={jenisForm.butuhInputTitik || false}
                        onChange={e => setJenisForm({ ...jenisForm, butuhInputTitik: e.target.checked })}
                        className="rounded-sm text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Membutuhkan Input Jumlah Titik</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={jenisForm.butuhPanjangKabel || false}
                        onChange={e => setJenisForm({ ...jenisForm, butuhPanjangKabel: e.target.checked })}
                        className="rounded-sm text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Membutuhkan Input Panjang Cable (Meter)</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={jenisForm.isMultiTeknisi || false}
                        onChange={e => setJenisForm({ ...jenisForm, isMultiTeknisi: e.target.checked })}
                        className="rounded-sm text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Dapat Dikerjakan Oleh Multi Teknisi (Pembagian Honor)</span>
                    </label>
                  </div>
                </>
              )}

              {/* KARYAWAN FORM */}
              {activeTab === 'karyawan' && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Nama Lengkap</label>
                    <input
                      type="text"
                      required
                      value={employeeForm.namaLengkap || ''}
                      onChange={e => setEmployeeForm({ ...employeeForm, namaLengkap: e.target.value })}
                      placeholder="Doni Kurniawan"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Kontak / No. WhatsApp Karyawan <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={employeeForm.kontak || ''}
                      onChange={e => setEmployeeForm({ ...employeeForm, kontak: e.target.value })}
                      placeholder="misal: 081234567890"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Username Login</label>
                      <input
                        type="text"
                        required
                        value={employeeForm.username || ''}
                        onChange={e => setEmployeeForm({ ...employeeForm, username: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Password</label>
                      <input
                        type="text"
                        required
                        value={employeeForm.password || ''}
                        onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Role Akses</label>
                      <select
                        value={employeeForm.role || 'Teknisi'}
                        onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value as any })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Penanggungjawab Server">Penanggungjawab Server</option>
                        <option value="Teknisi">Teknisi</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Status Karyawan</label>
                      <select
                        value={employeeForm.status || 'Tetap'}
                        onChange={e => setEmployeeForm({ ...employeeForm, status: e.target.value as any })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <option value="Tetap">Tetap</option>
                        <option value="Freelance">Freelance</option>
                        <option value="Magang">Magang</option>
                      </select>
                    </div>
                  </div>

                  {/* Penanggung Jawab Server - Server Selection Dropdown */}
                  {employeeForm.role === 'Penanggungjawab Server' && (
                    <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-800 font-bold text-xs">
                          Tugaskan ke Server yang Dikelola <span className="text-rose-600">*</span>
                        </label>
                        <span className="text-[10px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-bold">
                          Wajib Diisi
                        </span>
                      </div>
                      <select
                        value={employeeForm.serverId || ''}
                        onChange={e => {
                          const chosenId = e.target.value;
                          const chosenServer = servers.find(s => s.id === chosenId);
                          setEmployeeForm({
                            ...employeeForm,
                            serverId: chosenId,
                            namaServer: chosenServer?.namaServer || ''
                          });
                        }}
                        className="w-full p-2.5 bg-white border border-rose-200 rounded-xl font-bold text-slate-900 text-xs focus:ring-2 focus:ring-rose-500"
                        required
                      >
                        <option value="">-- Pilih Server yang Dikelola --</option>
                        {servers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.namaServer} {s.penanggungJawabNama ? `(PJ: ${s.penanggungJawabNama})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-600">
                        Nama lengkap &amp; alamat karyawan ini akan otomatis disinkronkan menjadi <strong>Nama Penanggung Jawab</strong> &amp; <strong>Alamat Server</strong> pada server yang dipilih.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Alamat Lengkap Karyawan</label>
                    <textarea
                      rows={2}
                      value={employeeForm.alamat || ''}
                      onChange={e => setEmployeeForm({ ...employeeForm, alamat: e.target.value })}
                      placeholder="Alamat domisili/tempat tinggal..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Rekening Bank</label>
                      <input
                        type="text"
                        value={employeeForm.rekening || ''}
                        onChange={e => setEmployeeForm({ ...employeeForm, rekening: e.target.value })}
                        placeholder="misal: BCA 123456789 a.n Doni"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Bonus Target Bulanan (Rp)</label>
                      <NumericInput
                        value={employeeForm.bonusTargetBulanan ?? 300000}
                        onChange={val => setEmployeeForm({ ...employeeForm, bonusTargetBulanan: val })}
                        min={0}
                        prefix="Rp "
                      />
                    </div>
                  </div>

                  {/* PEMBAGIAN HONOR TETAP PER SERVER */}
                  <div className="space-y-2.5 border-t border-slate-100 pt-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <label className="block text-slate-800 font-bold text-xs flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-maroon-800" />
                          Besaran Honor Tetap per Server
                          {employeeForm.status === 'Tetap' && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                              Karyawan Tetap
                            </span>
                          )}
                        </label>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Tentukan besaran honor pokok yang diterima karyawan/teknisi ini dari masing-masing server (contoh: Albinet Rp 250.000, Dindanet Rp 300.000).
                        </p>
                      </div>
                      <div className="text-right shrink-0 bg-maroon-50 border border-maroon-100 px-3 py-1 rounded-xl">
                        <span className="text-[10px] text-maroon-700 block font-semibold">Total Honor Tetap</span>
                        <span className="text-xs font-black text-maroon-950">
                          {formatRupiah((employeeForm.serverHonors || []).reduce((sum, sh) => sum + (Number(sh.nominal) || 0), 0))}
                        </span>
                      </div>
                    </div>

                    <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-extrabold text-amber-900 block">
                          Periode Mulai Berlaku Tarif (Proteksi Rekap Bulan Sebelumnya)
                        </span>
                        <span className="text-[10px] text-amber-700 block">
                          Jika ada kenaikan/perubahan honor tetap, tarif bulan sebelumnya otomatis disimpan agar rekap bulan lalu tidak berubah.
                        </span>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-amber-900">Berlaku Mulai:</span>
                        <input
                          type="month"
                          value={honorEffectiveMonth}
                          onChange={e => setHonorEffectiveMonth(e.target.value || getEffectiveTodayISO().slice(0, 7))}
                          className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs font-extrabold text-slate-800 focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    {servers.length === 0 ? (
                      <p className="text-slate-400 text-xs italic">Belum ada data server di Master Data.</p>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5 max-h-80 overflow-y-auto">
                        {servers.map(srv => {
                          const currentHonors = employeeForm.serverHonors || [];
                          const honorEntry = currentHonors.find(
                            sh => sh.serverId === srv.id ||
                            (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                          );
                          const currentNominal = honorEntry ? (Number(honorEntry.nominal) || 0) : 0;
                          const currentRiwayat = Array.isArray(honorEntry?.riwayat)
                            ? [...honorEntry!.riwayat].sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai))
                            : [];
                          const isAssigned = currentNominal > 0 || currentRiwayat.length > 0;

                          return (
                            <div
                              key={srv.id}
                              className={`p-2.5 rounded-xl border transition-all ${
                                isAssigned
                                  ? 'bg-white border-maroon-200 shadow-xs ring-1 ring-maroon-100'
                                  : 'bg-white/70 border-slate-200'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-900 text-xs">{srv.namaServer}</span>
                                    {srv.penanggungJawabNama && (
                                      <span className="text-[10px] text-slate-500">
                                        (PJ: {srv.penanggungJawabNama})
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 truncate max-w-xs">{srv.alamat || '-'}</p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="w-36">
                                    <NumericInput
                                      value={currentNominal}
                                      onChange={val => {
                                        const existingIndex = currentHonors.findIndex(
                                          sh => sh.serverId === srv.id ||
                                          (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                        );
                                        const origHonor = Array.isArray(editingItem?.serverHonors)
                                          ? editingItem.serverHonors.find(
                                              (sh: any) => sh.serverId === srv.id ||
                                              (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                            )
                                          : undefined;

                                        let updated = [...currentHonors];
                                        if (existingIndex >= 0) {
                                          if (val > 0) {
                                            let nextRiwayat = Array.isArray(updated[existingIndex].riwayat)
                                              ? [...updated[existingIndex].riwayat!]
                                              : [];

                                            const origNominal = origHonor ? (Number(origHonor.nominal) || 0) : 0;
                                            if (nextRiwayat.length === 0 && origNominal > 0 && origNominal !== val) {
                                              const prevMonth = origHonor?.berlakuMulai && origHonor.berlakuMulai < honorEffectiveMonth
                                                ? origHonor.berlakuMulai
                                                : getPrevMonthYYYYMM(honorEffectiveMonth);
                                              nextRiwayat.push({
                                                berlakuMulai: prevMonth,
                                                nominal: origNominal
                                              });
                                            }

                                            if (nextRiwayat.length > 0) {
                                              const periodIdx = nextRiwayat.findIndex(r => r.berlakuMulai === honorEffectiveMonth);
                                              if (periodIdx >= 0) {
                                                nextRiwayat[periodIdx] = { berlakuMulai: honorEffectiveMonth, nominal: val };
                                              } else {
                                                nextRiwayat.push({ berlakuMulai: honorEffectiveMonth, nominal: val });
                                              }
                                              nextRiwayat.sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai));
                                            }

                                            const latestNom = nextRiwayat.length > 0
                                              ? nextRiwayat[nextRiwayat.length - 1].nominal
                                              : val;

                                            updated[existingIndex] = {
                                              ...updated[existingIndex],
                                              serverId: srv.id,
                                              namaServer: srv.namaServer,
                                              nominal: latestNom,
                                              berlakuMulai: honorEffectiveMonth,
                                              ...(nextRiwayat.length > 0 ? { riwayat: nextRiwayat } : {})
                                            };
                                          } else {
                                            updated.splice(existingIndex, 1);
                                          }
                                        } else if (val > 0) {
                                          updated.push({
                                            serverId: srv.id,
                                            namaServer: srv.namaServer,
                                            nominal: val,
                                            berlakuMulai: honorEffectiveMonth
                                          });
                                        }
                                        setEmployeeForm({
                                          ...employeeForm,
                                          serverHonors: updated
                                        });
                                      }}
                                      min={0}
                                      prefix="Rp "
                                    />
                                  </div>
                                  {isAssigned && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = currentHonors.filter(
                                          sh => sh.serverId !== srv.id &&
                                          !(sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                        );
                                        setEmployeeForm({
                                          ...employeeForm,
                                          serverHonors: updated
                                        });
                                      }}
                                      className="text-slate-400 hover:text-rose-600 px-1.5 py-1 text-xs font-bold rounded-lg hover:bg-rose-50 transition-colors"
                                      title="Nol-kan honor server ini"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* RIWAYAT TARIF PER PERIODE (BULAN) */}
                              {isAssigned && (
                                <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-600">
                                      Riwayat Tarif per Periode Bulan:
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const existingIndex = currentHonors.findIndex(
                                          sh => sh.serverId === srv.id ||
                                          (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                        );
                                        if (existingIndex < 0) return;
                                        let nextRiwayat = Array.isArray(currentHonors[existingIndex].riwayat)
                                          ? [...currentHonors[existingIndex].riwayat!]
                                          : [];
                                        if (nextRiwayat.length === 0) {
                                          const prevM = getPrevMonthYYYYMM(honorEffectiveMonth);
                                          nextRiwayat = [
                                            { berlakuMulai: prevM, nominal: currentNominal },
                                            { berlakuMulai: honorEffectiveMonth, nominal: currentNominal }
                                          ];
                                        } else {
                                          const earliestM = nextRiwayat[0].berlakuMulai;
                                          const newMonth = getPrevMonthYYYYMM(earliestM);
                                          nextRiwayat.unshift({
                                            berlakuMulai: newMonth,
                                            nominal: nextRiwayat[0].nominal
                                          });
                                        }
                                        nextRiwayat.sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai));
                                        const updated = [...currentHonors];
                                        updated[existingIndex] = {
                                          ...updated[existingIndex],
                                          nominal: nextRiwayat[nextRiwayat.length - 1].nominal,
                                          berlakuMulai: nextRiwayat[nextRiwayat.length - 1].berlakuMulai,
                                          riwayat: nextRiwayat
                                        };
                                        setEmployeeForm({ ...employeeForm, serverHonors: updated });
                                      }}
                                      className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition-colors"
                                    >
                                      + Atur Tarif Bulan Sebelumnya
                                    </button>
                                  </div>

                                  {currentRiwayat.length > 0 && (
                                    <div className="space-y-1.5 bg-slate-50/90 p-2 rounded-lg border border-slate-200/80">
                                      {currentRiwayat.map((histItem, hIdx) => (
                                        <div key={hIdx} className="flex items-center justify-between gap-2 text-xs">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-semibold text-slate-500">Mulai:</span>
                                            <input
                                              type="month"
                                              value={histItem.berlakuMulai}
                                              onChange={e => {
                                                const newMonth = e.target.value;
                                                if (!newMonth) return;
                                                const existingIndex = currentHonors.findIndex(
                                                  sh => sh.serverId === srv.id ||
                                                  (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                                );
                                                if (existingIndex < 0) return;
                                                const nextRiwayat = [...currentRiwayat];
                                                nextRiwayat[hIdx] = { ...nextRiwayat[hIdx], berlakuMulai: newMonth };
                                                nextRiwayat.sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai));
                                                const updated = [...currentHonors];
                                                updated[existingIndex] = {
                                                  ...updated[existingIndex],
                                                  nominal: nextRiwayat[nextRiwayat.length - 1].nominal,
                                                  berlakuMulai: nextRiwayat[nextRiwayat.length - 1].berlakuMulai,
                                                  riwayat: nextRiwayat
                                                };
                                                setEmployeeForm({ ...employeeForm, serverHonors: updated });
                                              }}
                                              className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-800"
                                            />
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <div className="w-32">
                                              <NumericInput
                                                value={histItem.nominal}
                                                onChange={newNom => {
                                                  const existingIndex = currentHonors.findIndex(
                                                    sh => sh.serverId === srv.id ||
                                                    (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                                  );
                                                  if (existingIndex < 0) return;
                                                  const nextRiwayat = [...currentRiwayat];
                                                  nextRiwayat[hIdx] = { ...nextRiwayat[hIdx], nominal: newNom };
                                                  nextRiwayat.sort((a, b) => a.berlakuMulai.localeCompare(b.berlakuMulai));
                                                  const updated = [...currentHonors];
                                                  updated[existingIndex] = {
                                                    ...updated[existingIndex],
                                                    nominal: nextRiwayat[nextRiwayat.length - 1].nominal,
                                                    berlakuMulai: nextRiwayat[nextRiwayat.length - 1].berlakuMulai,
                                                    riwayat: nextRiwayat
                                                  };
                                                  setEmployeeForm({ ...employeeForm, serverHonors: updated });
                                                }}
                                                min={0}
                                                prefix="Rp "
                                              />
                                            </div>
                                            {currentRiwayat.length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const existingIndex = currentHonors.findIndex(
                                                    sh => sh.serverId === srv.id ||
                                                    (sh.namaServer && srv.namaServer && sh.namaServer.toLowerCase().trim() === srv.namaServer.toLowerCase().trim())
                                                  );
                                                  if (existingIndex < 0) return;
                                                  const nextRiwayat = currentRiwayat.filter((_, idx) => idx !== hIdx);
                                                  const updated = [...currentHonors];
                                                  updated[existingIndex] = {
                                                    ...updated[existingIndex],
                                                    nominal: nextRiwayat[nextRiwayat.length - 1]?.nominal ?? currentNominal,
                                                    berlakuMulai: nextRiwayat[nextRiwayat.length - 1]?.berlakuMulai,
                                                    riwayat: nextRiwayat.length > 1 ? nextRiwayat : undefined
                                                  };
                                                  setEmployeeForm({ ...employeeForm, serverHonors: updated });
                                                }}
                                                className="text-slate-400 hover:text-rose-600 px-1 py-0.5 text-xs font-bold rounded hover:bg-rose-50"
                                                title="Hapus periode tarif ini"
                                              >
                                                ✕
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* PENANGGUNG JAWAB WILAYAH CHECKLIST */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-700 font-bold">
                        Penanggung Jawab Wilayah (Teknisi)
                      </label>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Bisa pilih &gt; 1 wilayah lintas server
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-44 overflow-y-auto space-y-2">
                      {wilayahList.length === 0 ? (
                        <p className="text-slate-400 text-xs italic">Belum ada data wilayah di Master Data.</p>
                      ) : (
                        wilayahList.map(w => {
                          const isChecked = (employeeForm.wilayahHandledIds || []).includes(w.id);
                          return (
                            <label
                              key={w.id}
                              className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${
                                isChecked
                                  ? 'bg-indigo-50/80 border-indigo-200 text-indigo-900 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => {
                                    const current = employeeForm.wilayahHandledIds || [];
                                    const next = e.target.checked
                                      ? [...current, w.id]
                                      : current.filter(id => id !== w.id);
                                    setEmployeeForm({ ...employeeForm, wilayahHandledIds: next });
                                  }}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                  <p className="text-xs font-bold">{w.namaWilayah}</p>
                                  <p className="text-[10px] text-slate-500 font-normal">Server: {w.namaServer}</p>
                                </div>
                              </div>
                              <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                +{formatRupiah(w.honorPJWilayah)}/bln
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {/* ESTIMASI HONOR PENANGGUNGJAWAB WILAYAH */}
                    <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider">
                          Estimasi Honor PJ Wilayah
                        </p>
                        <p className="text-[10px] text-emerald-600 font-medium">
                          {(employeeForm.wilayahHandledIds || []).length} Wilayah dipilih
                        </p>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-700">
                        {formatRupiah(
                          (employeeForm.wilayahHandledIds || []).reduce((acc, wId) => {
                            const w = wilayahList.find(x => x.id === wId);
                            return acc + (w ? w.honorPJWilayah : 0);
                          }, 0)
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={handleRequestCloseModal}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const MasterDataView: React.FC<MasterDataViewProps> = React.memo(MasterDataViewComponent);
