import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  Wallet,
  AlertCircle,
  Building2,
  User,
  Calendar,
  X,
  RefreshCw,
  Coins,
  ArrowUpDown,
  Tag
} from 'lucide-react';
import { Employee, ServerData, PotonganManual, AppSettings } from '../types';
import { formatRupiah } from '../services/payroll';
import { showAppAlert, showAppConfirm } from '../utils/dialogService';

interface PotonganManualViewProps {
  employees: Employee[];
  servers: ServerData[];
  potonganManualList: PotonganManual[];
  onSavePotonganManual: (potongan: PotonganManual) => void;
  onDeletePotonganManual: (id: string) => void;
  onSyncDatabase?: () => Promise<void> | void;
  currentUser?: Employee | null;
  settings?: AppSettings;
}

export const PotonganManualView: React.FC<PotonganManualViewProps> = ({
  employees,
  servers,
  potonganManualList = [],
  onSavePotonganManual,
  onDeletePotonganManual,
  onSyncDatabase,
  currentUser
}) => {
  const isPjServer = currentUser?.role === 'PJ Server';
  const userServer = isPjServer && currentUser.serverId
    ? servers.find(s => s.id === currentUser.serverId)
    : null;

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServerId, setSelectedServerId] = useState<string>(() => {
    if (isPjServer && userServer) return userServer.id;
    return 'all';
  });
  const [selectedTeknisiId, setSelectedTeknisiId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'aktif' | 'lunas'>('all');
  const [filterJenis, setFilterJenis] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'tanggal_desc' | 'tanggal_asc' | 'nominal_desc' | 'nominal_asc'>('tanggal_desc');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PotonganManual | null>(null);

  // Form States
  const [formKaryawanId, setFormKaryawanId] = useState('');
  const [formServerId, setFormServerId] = useState('');
  const [formTanggal, setFormTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [formJenis, setFormJenis] = useState('Kasbon');
  const [formNominal, setFormNominal] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter eligible employees based on server if selected
  const eligibleEmployees = useMemo(() => {
    return employees.filter(e => {
      if (selectedServerId !== 'all') {
        return !e.serverId || e.serverId === selectedServerId;
      }
      return true;
    });
  }, [employees, selectedServerId]);

  // Open modal for new record
  const handleOpenAddModal = (defaultTeknisiId?: string) => {
    setEditingItem(null);
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
    setIsModalOpen(true);
  };

  // Open modal for editing existing record
  const handleOpenEditModal = (item: PotonganManual) => {
    setEditingItem(item);
    setFormKaryawanId(item.karyawanId);
    setFormServerId(item.serverId);
    setFormTanggal(item.tanggal);
    setFormJenis(item.jenisPotongan || 'Kasbon');
    setFormNominal(String(item.nominal));
    setFormKeterangan(item.keterangan || '');
    setIsModalOpen(true);
  };

  // Form submit handler
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDigits = formNominal.replace(/[^0-9]/g, '');
    const nominalNum = Number(cleanDigits) || 0;

    if (!formKaryawanId) {
      showAppAlert({
        title: 'Pilih Teknisi',
        message: 'Silakan pilih teknisi/karyawan yang bersangkutan.',
        type: 'warning'
      });
      return;
    }
    if (!formServerId) {
      showAppAlert({
        title: 'Pilih Server',
        message: 'Silakan pilih server yang mengeluarkan kasbon/potongan.',
        type: 'warning'
      });
      return;
    }
    if (nominalNum <= 0) {
      showAppAlert({
        title: 'Nominal Tidak Valid',
        message: 'Nominal potongan manual harus lebih besar dari Rp 0.',
        type: 'warning'
      });
      return;
    }

    const empObj = employees.find(e => e.id === formKaryawanId);
    const srvObj = servers.find(s => s.id === formServerId);

    const record: PotonganManual = {
      id: editingItem ? editingItem.id : `potongan-${Date.now()}`,
      tanggal: formTanggal,
      karyawanId: formKaryawanId,
      karyawanNama: empObj ? empObj.namaLengkap : formKaryawanId,
      serverId: formServerId,
      serverNama: srvObj ? srvObj.namaServer : formServerId,
      jenisPotongan: formJenis,
      nominal: nominalNum,
      keterangan: formKeterangan.trim(),
      createdAt: editingItem?.createdAt || new Date().toISOString(),
      createdById: currentUser?.id,
      createdByNama: currentUser?.namaLengkap || 'Admin',
      isLunas: editingItem?.isLunas || false,
      honorLunasId: editingItem?.honorLunasId
    };

    onSavePotonganManual(record);
    setIsModalOpen(false);
    showAppAlert({
      title: editingItem ? 'Potongan Diperbarui' : 'Potongan Berhasil Dicatat',
      message: `Catatan potongan ${record.jenisPotongan} sebesar ${formatRupiah(nominalNum)} untuk ${record.karyawanNama} berhasil disimpan ke database.`,
      type: 'success'
    });
  };

  // Delete handler with confirmation
  const handleDeleteItem = async (item: PotonganManual) => {
    const confirmed = await showAppConfirm({
      title: 'Hapus Catatan Potongan?',
      message: `Apakah Anda yakin ingin menghapus catatan ${item.jenisPotongan} senilai ${formatRupiah(item.nominal)} untuk ${item.karyawanNama}?`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });

    if (confirmed) {
      onDeletePotonganManual(item.id);
      showAppAlert({
        title: 'Berhasil Dihapus',
        message: 'Catatan potongan manual berhasil dihapus dari database.',
        type: 'success'
      });
    }
  };

  // Manual refresh from database
  const handleRefresh = async () => {
    if (onSyncDatabase) {
      setIsRefreshing(true);
      try {
        await onSyncDatabase();
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Filtered & Sorted Records
  const filteredList = useMemo(() => {
    return potonganManualList
      .filter(item => {
        // Filter Server
        if (selectedServerId !== 'all') {
          const matchId = item.serverId === selectedServerId;
          const sObj = servers.find(s => s.id === selectedServerId);
          const matchName = sObj && (item.serverNama || '').toLowerCase().trim() === sObj.namaServer.toLowerCase().trim();
          if (!matchId && !matchName) return false;
        }

        // Filter Teknisi
        if (selectedTeknisiId !== 'all') {
          const matchTechId = item.karyawanId === selectedTeknisiId;
          const empObj = employees.find(e => e.id === selectedTeknisiId);
          const matchTechName = empObj && (item.karyawanNama || '').toLowerCase().trim() === empObj.namaLengkap.toLowerCase().trim();
          if (!matchTechId && !matchTechName) return false;
        }

        // Filter Status
        if (filterStatus === 'aktif' && item.isLunas) return false;
        if (filterStatus === 'lunas' && !item.isLunas) return false;

        // Filter Jenis
        if (filterJenis !== 'all' && (item.jenisPotongan || 'Kasbon').toLowerCase() !== filterJenis.toLowerCase()) {
          return false;
        }

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (item.karyawanNama || '').toLowerCase().includes(q);
          const matchServer = (item.serverNama || '').toLowerCase().includes(q);
          const matchKet = (item.keterangan || '').toLowerCase().includes(q);
          const matchJenis = (item.jenisPotongan || '').toLowerCase().includes(q);
          const matchBy = (item.createdByNama || '').toLowerCase().includes(q);
          if (!matchName && !matchServer && !matchKet && !matchJenis && !matchBy) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'tanggal_desc') return (b.tanggal || '').localeCompare(a.tanggal || '');
        if (sortBy === 'tanggal_asc') return (a.tanggal || '').localeCompare(b.tanggal || '');
        if (sortBy === 'nominal_desc') return (b.nominal || 0) - (a.nominal || 0);
        if (sortBy === 'nominal_asc') return (a.nominal || 0) - (b.nominal || 0);
        return 0;
      });
  }, [potonganManualList, selectedServerId, selectedTeknisiId, filterStatus, filterJenis, searchQuery, sortBy, servers, employees]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalAktif = 0;
    let totalLunas = 0;
    let totalNominal = 0;

    potonganManualList.forEach(p => {
      const nom = Number(p.nominal) || 0;
      totalNominal += nom;
      if (p.isLunas) {
        totalLunas += nom;
      } else {
        totalAktif += nom;
      }
    });

    return {
      totalAktif,
      totalLunas,
      totalNominal,
      countTotal: potonganManualList.length,
      countFiltered: filteredList.length
    };
  }, [potonganManualList, filteredList]);

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2.5 bg-maroon-50 text-maroon-800 rounded-xl border border-maroon-100">
              <Receipt className="w-5 h-5 text-maroon-800" />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Potongan Manual / Kasbon
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Kelola catatan kasbon, pinjaman operasional, dan potongan manual honor teknisi
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5">
          {onSyncDatabase && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="py-2.5 px-3.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-2xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-60"
              title="Perbarui data dari Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-maroon-800' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Perbarui</span>
            </button>
          )}

          <button
            onClick={() => handleOpenAddModal()}
            className="py-2.5 px-4 bg-maroon-800 hover:bg-maroon-900 active:bg-maroon-950 text-white font-bold text-xs rounded-xl shadow-xs shadow-maroon-950/20 flex items-center space-x-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Potongan Baru</span>
          </button>
        </div>
      </div>

      {/* 2. Metrics Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Potongan Aktif */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Potongan Aktif
            </span>
            <span className="p-1.5 bg-rose-50 text-rose-700 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-rose-800 tracking-tight mt-2">
            {formatRupiah(metrics.totalAktif)}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Memotong honor berjalan
          </p>
        </div>

        {/* Card 2: Total Potongan Dilunaskan */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Sudah Dilunaskan
            </span>
            <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-emerald-800 tracking-tight mt-2">
            {formatRupiah(metrics.totalLunas)}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Lunas saat tutup buku honor
          </p>
        </div>

        {/* Card 3: Total Nominal Keseluruhan */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Total Akumulasi
            </span>
            <span className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight mt-2">
            {formatRupiah(metrics.totalNominal)}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Semua catatan kasbon & potongan
          </p>
        </div>

        {/* Card 4: Total Transaksi */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Jumlah Catatan
            </span>
            <span className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <p className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight mt-2">
            {metrics.countTotal} <span className="text-xs font-bold text-slate-500">Record</span>
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            {metrics.countFiltered} ditampilkan sesuai filter
          </p>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari teknisi, server, keterangan..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
            />
          </div>

          {/* Filter Server */}
          <div className="relative">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedServerId}
              onChange={e => setSelectedServerId(e.target.value)}
              disabled={isPjServer && !!userServer}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 appearance-none disabled:opacity-70"
            >
              <option value="all">Semua Server</option>
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.namaServer}</option>
              ))}
            </select>
          </div>

          {/* Filter Teknisi */}
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedTeknisiId}
              onChange={e => setSelectedTeknisiId(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 appearance-none"
            >
              <option value="all">Semua Teknisi</option>
              {eligibleEmployees.map(e => (
                <option key={e.id} value={e.id}>{e.namaLengkap} ({e.status})</option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 appearance-none"
            >
              <option value="all">Semua Status (Aktif & Lunas)</option>
              <option value="aktif">Aktif (Belum Lunas)</option>
              <option value="lunas">Sudah Lunas</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-bold">Jenis:</span>
            {['all', 'Kasbon', 'Pinjaman', 'Denda'].map(j => (
              <button
                key={j}
                onClick={() => setFilterJenis(j)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  filterJenis === j
                    ? 'bg-maroon-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {j === 'all' ? 'Semua' : j}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-bold">Urutkan:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700"
            >
              <option value="tanggal_desc">Tanggal Terbaru</option>
              <option value="tanggal_asc">Tanggal Terlama</option>
              <option value="nominal_desc">Nominal Terbesar</option>
              <option value="nominal_asc">Nominal Terkecil</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Table & Cards List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Receipt className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="font-extrabold text-slate-800 text-sm">Tidak Ada Catatan Potongan</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Belum ada catatan potongan manual atau kasbon yang sesuai dengan filter pencarian Anda.
            </p>
            <button
              onClick={() => handleOpenAddModal()}
              className="mt-4 py-2 px-4 bg-maroon-800 hover:bg-maroon-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer inline-flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catat Potongan Baru</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Nama Teknisi</th>
                  <th className="py-3 px-4">Server</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4">Nominal</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredList.map(item => {
                  const isLunas = Boolean(item.isLunas);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Tanggal */}
                      <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.tanggal}</span>
                        </div>
                      </td>

                      {/* Nama Teknisi */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-maroon-50 text-maroon-800 flex items-center justify-center text-[10px] font-black shrink-0 border border-maroon-100">
                            {(item.karyawanNama || 'T').charAt(0).toUpperCase()}
                          </div>
                          <span>{item.karyawanNama}</span>
                        </div>
                      </td>

                      {/* Server */}
                      <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] border border-slate-200">
                          {item.serverNama}
                        </span>
                      </td>

                      {/* Jenis Potongan */}
                      <td className="py-3.5 px-4 font-bold whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[11px] border border-indigo-100">
                          {item.jenisPotongan || 'Kasbon'}
                        </span>
                      </td>

                      {/* Nominal */}
                      <td className="py-3.5 px-4 font-black text-rose-700 whitespace-nowrap text-sm">
                        {formatRupiah(item.nominal)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isLunas ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Lunas Terpotong</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Memotong Honor</span>
                          </span>
                        )}
                      </td>

                      {/* Keterangan */}
                      <td className="py-3.5 px-4 font-medium text-slate-600 max-w-xs truncate" title={item.keterangan || '-'}>
                        {item.keterangan || '-'}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-500 hover:text-maroon-800 hover:bg-maroon-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Catatan Potongan"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Catatan Potongan"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Modal Catat / Edit Potongan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-maroon-50 text-maroon-800 rounded-xl border border-maroon-100">
                  <Receipt className="w-4 h-4" />
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  {editingItem ? 'Edit Catatan Potongan' : 'Catat Potongan / Kasbon'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 mt-4 text-xs font-semibold">
              {/* Pilih Teknisi */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Teknisi / Karyawan <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formKaryawanId}
                  onChange={e => {
                    setFormKaryawanId(e.target.value);
                    const emp = employees.find(x => x.id === e.target.value);
                    if (emp?.serverId && !isPjServer) {
                      setFormServerId(emp.serverId);
                    }
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                >
                  <option value="">-- Pilih Teknisi --</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.namaLengkap} ({e.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pilih Server */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Server Penanggung Jawab <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formServerId}
                  onChange={e => setFormServerId(e.target.value)}
                  disabled={isPjServer && !!userServer}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 disabled:opacity-70"
                >
                  <option value="">-- Pilih Server --</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.namaServer}</option>
                  ))}
                </select>
              </div>

              {/* Tanggal & Jenis Potongan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Tanggal <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formTanggal}
                    onChange={e => setFormTanggal(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Jenis Potongan <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formJenis}
                    onChange={e => setFormJenis(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                  >
                    <option value="Kasbon">Kasbon</option>
                    <option value="Pinjaman Operasional">Pinjaman Operasional</option>
                    <option value="Denda / Pelanggaran">Denda / Pelanggaran</option>
                    <option value="Lain-lain">Lain-lain</option>
                  </select>
                </div>
              </div>

              {/* Nominal */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nominal Potongan (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-rose-700 text-xs">
                    Rp
                  </span>
                  <input
                    type="text"
                    required
                    value={formNominal ? Number(formNominal.replace(/[^0-9]/g, '')).toLocaleString('id-ID') : ''}
                    onChange={e => {
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      setFormNominal(digits);
                    }}
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-rose-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800"
                  />
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Keterangan / Keperluan
                </label>
                <textarea
                  rows={2}
                  value={formKeterangan}
                  onChange={e => setFormKeterangan(e.target.value)}
                  placeholder="Contoh: Kasbon keperluan perbaikan motor operasional"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-maroon-800 hover:bg-maroon-900 active:bg-maroon-950 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  {editingItem ? 'Simpan Perubahan' : 'Catat Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
