import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Server,
  MapPin,
  ListCheck,
  Users,
  Briefcase,
  FileSpreadsheet,
  CheckSquare,
  Calculator,
  Settings,
  LogOut,
  X,
  HardHat,
  ChevronRight,
  ChevronDown,
  Home,
  ClipboardList,
  CalendarCheck,
  Wallet,
  Receipt,
  UserCheck,
  AlertTriangle,
  Clock,
  FileText,
  Building,
  Bell,
  Database,
  Code
} from 'lucide-react';
import { Employee } from '../types';

export type NavView =
  | 'dashboard'
  | 'teknisi_dashboard'
  | 'master_server'
  | 'master_wilayah'
  | 'master_jenis_pekerjaan'
  | 'master_karyawan'
  | 'pekerjaan_daftar'
  | 'pekerjaan_planning'
  | 'approval_absensi'
  | 'approval_perlu'
  | 'approval_harian'
  | 'approval_izin'
  | 'approval_histori'
  | 'absen_manual'
  | 'absen_manual_form'
  | 'absen_manual_pekerjaan'
  | 'absen_manual_riwayat'
  | 'rekap_honor'
  | 'potongan_manual'
  | 'pengaturan'
  | 'pengaturan_profil'
  | 'pengaturan_jam_kerja'
  | 'pengaturan_notifikasi'
  | 'pengaturan_google_sheets'
  | 'pengaturan_panduan_sheets';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  currentUser: Employee | null;
  onLogout: () => void;
  logoUrl?: string;
  companyName?: string;
  pendingApprovalsCount?: number;
}

const SidebarComponent: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  currentUser,
  onLogout,
  logoUrl,
  companyName,
  pendingApprovalsCount
}) => {
  if (!isOpen) return null;

  const role = currentUser?.role || 'Teknisi';

  const isApprovalActive = activeView.startsWith('approval_');
  const isAbsenManualActive = activeView.startsWith('absen_manual');
  const isPengaturanActive = activeView.startsWith('pengaturan');

  // Point 1: Semua sub menu pada navigasi sidebar dalam keadaan tertutup secara default.
  // Hanya terbuka ketika di klik oleh pengguna.
  // Point 2: Ketika beralih ke menu lain, menu yang ada sub menunya dan sedang terbuka otomatis tertutup.
  const [expandedSections, setExpandedSections] = useState<{
    approval: boolean;
    absenManual: boolean;
    pengaturan: boolean;
  }>(() => ({
    approval: activeView.startsWith('approval_'),
    absenManual: activeView.startsWith('absen_manual'),
    pengaturan: activeView.startsWith('pengaturan')
  }));

  // Otomatis menutup menu yang ada sub menunya ketika beralih ke menu lain
  useEffect(() => {
    const isApproval = activeView.startsWith('approval_');
    const isAbsenManual = activeView.startsWith('absen_manual');
    const isPengaturan = activeView.startsWith('pengaturan');

    setExpandedSections({
      approval: isApproval,
      absenManual: isAbsenManual,
      pengaturan: isPengaturan
    });
  }, [activeView]);

  const toggleSection = (section: 'approval' | 'absenManual' | 'pengaturan', defaultView?: NavView) => {
    const isCurrentlyOpen = expandedSections[section];
    if (isCurrentlyOpen) {
      // Tutup submenu jika sedang terbuka
      setExpandedSections(prev => ({
        ...prev,
        [section]: false
      }));
    } else {
      // Buka submenu ini dan otomatis tutup submenu lainnya
      setExpandedSections({
        approval: section === 'approval',
        absenManual: section === 'absenManual',
        pengaturan: section === 'pengaturan'
      });
      // Jika defaultView ditentukan, buka halamannya dan lakukan sinkronisasi database on-demand
      if (defaultView) {
        const prefix = section === 'absenManual' ? 'absen_manual' : section;
        const targetView = activeView.startsWith(prefix) ? activeView : defaultView;
        onSelectView(targetView);
      }
    }
  };

  const handleNavClick = (view: NavView) => {
    // Otomatis menutup submenu lain yang tidak sesuai dengan menu tujuan
    const isApproval = view.startsWith('approval_');
    const isAbsenManual = view.startsWith('absen_manual');
    const isPengaturan = view.startsWith('pengaturan');

    setExpandedSections({
      approval: isApproval,
      absenManual: isAbsenManual,
      pengaturan: isPengaturan
    });

    onSelectView(view);
    // On smartphone / tablet screen (< 1024px), close sidebar drawer on navigation.
    // On desktop screen (>= 1024px), keep sidebar visible.
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Reusable Sidebar Internal Content
  const sidebarContent = (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Mobile Drawer Close Button (Only on <lg) */}
      <div className="lg:hidden p-2.5 pb-0 flex justify-end shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-maroon-900/60 transition-colors cursor-pointer"
          title="Tutup Menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Menu Links */}
      <nav className="flex-1 px-3 py-3 space-y-4 text-sm">
          {/* Section: Main & Teknisi Field */}
          <div>
            <p className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider mb-1.5 px-3">
              Utama
            </p>
            <div className="space-y-1">
              {role === 'Teknisi' ? (
                <>
                  <button
                    onClick={() => handleNavClick('teknisi_dashboard')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${
                      activeView === 'teknisi_dashboard' || activeView === 'dashboard'
                        ? 'bg-maroon-800 text-white shadow-xs'
                        : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Home className="w-4 h-4 text-rose-300" />
                      <span>Beranda Teknisi</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-70" />
                  </button>

                  <button
                    onClick={() => handleNavClick('approval_absensi')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${
                      activeView === 'approval_absensi'
                        ? 'bg-maroon-800 text-white shadow-xs'
                        : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <CalendarCheck className="w-4 h-4 text-rose-300" />
                      <span>Absensi Kehadiran</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-70" />
                  </button>

                  <button
                    onClick={() => handleNavClick('rekap_honor')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${
                      activeView === 'rekap_honor'
                        ? 'bg-maroon-800 text-white shadow-xs'
                        : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Wallet className="w-4 h-4 text-rose-300" />
                      <span>Gaji & Estimasi Honor</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-70" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${
                    activeView === 'dashboard'
                      ? 'bg-maroon-800 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <LayoutDashboard className="w-4 h-4 text-rose-300" />
                    <span>Dashboard Ringkasan</span>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </button>
              )}
            </div>
          </div>

          {/* Section: Master Data (Admin & PJ Server) */}
          {role === 'Admin' && (
            <div>
              <p className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider mb-1.5 px-3">
                Master Data
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => handleNavClick('master_server')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'master_server'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <Server className="w-4 h-4 text-rose-300" />
                  <span>Data Server</span>
                </button>

                <button
                  onClick={() => handleNavClick('master_wilayah')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'master_wilayah'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>Data Wilayah Pekerjaan</span>
                </button>

                <button
                  onClick={() => handleNavClick('master_jenis_pekerjaan')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'master_jenis_pekerjaan'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <ListCheck className="w-4 h-4 text-amber-400" />
                  <span>Data Jenis Pekerjaan</span>
                </button>

                <button
                  onClick={() => handleNavClick('master_karyawan')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'master_karyawan'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4 text-rose-300" />
                  <span>Data Karyawan</span>
                </button>
              </div>
            </div>
          )}

          {/* Section: Master Server & Wilayah & Planning Khusus PJ Server */}
          {role === 'Penanggungjawab Server' && (
            <div>
              <p className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider mb-1.5 px-3">
                Kelola Server & Planning
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => handleNavClick('master_server')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'master_server'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <Server className="w-4 h-4 text-rose-300" />
                  <span>Data Server</span>
                </button>

                <button
                  onClick={() => handleNavClick('master_wilayah')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'master_wilayah'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>Data Wilayah</span>
                </button>

                <button
                  onClick={() => handleNavClick('pekerjaan_daftar')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'pekerjaan_daftar'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <Briefcase className="w-4 h-4 text-rose-300" />
                  <span>Daftar Pekerjaan Teknisi</span>
                </button>

                <button
                  onClick={() => handleNavClick('pekerjaan_planning')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'pekerjaan_planning'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  <span>Planning Pekerjaan</span>
                </button>
              </div>
            </div>
          )}

          {/* Section: Master Pekerjaan (Hanya Admin & Teknisi) */}
          {role !== 'Penanggungjawab Server' && (
            <div>
              <p className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider mb-1.5 px-3">
                Pekerjaan & Planning
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => handleNavClick('pekerjaan_daftar')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'pekerjaan_daftar'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <Briefcase className="w-4 h-4 text-rose-300" />
                  <span>Daftar Pekerjaan Teknisi</span>
                </button>

                <button
                  onClick={() => handleNavClick('pekerjaan_planning')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer ${
                    activeView === 'pekerjaan_planning'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'hover:bg-maroon-900/40 text-slate-300 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-rose-300" />
                  <span>Planning Pekerjaan</span>
                </button>
              </div>
            </div>
          )}

          {/* Section: Operational & Payroll */}
          {(role === 'Admin' || role === 'Penanggungjawab Server') && (
            <div>
              <p className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider mb-1.5 px-3">
                Operasional & Gaji
              </p>
              <div className="space-y-1">
                {/* 1. PARENT: Approval Absensi */}
                <div>
                  <button
                    onClick={() => toggleSection('approval', 'approval_perlu')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer text-left ${
                      isApprovalActive
                        ? 'bg-maroon-900/60 text-white font-bold border-l-2 border-amber-400'
                        : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 text-left">
                      <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-left whitespace-nowrap">Approval Absensi</span>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                      {pendingApprovalsCount && pendingApprovalsCount > 0 ? (
                        <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          {pendingApprovalsCount}
                        </span>
                      ) : (
                        <span className="bg-maroon-700 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                          !
                        </span>
                      )}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSection('approval');
                        }}
                        className="p-1 hover:text-white rounded cursor-pointer"
                        title="Buka / Tutup Submenu"
                      >
                        {expandedSections.approval ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </span>
                    </div>
                  </button>

                  {/* Submenu Approval Absensi */}
                  {expandedSections.approval && (
                    <div className="ml-5 pl-2.5 border-l-2 border-maroon-800/80 space-y-0.5 my-1">
                      <button
                        onClick={() => handleNavClick('approval_perlu')}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          activeView === 'approval_perlu' || activeView === 'approval_absensi'
                            ? 'bg-maroon-800 text-white font-bold shadow-xs'
                            : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0 text-left">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Perlu Approval</span>
                        </div>
                        {pendingApprovalsCount && pendingApprovalsCount > 0 ? (
                          <span className="bg-amber-500 text-slate-950 text-[9px] px-1.5 py-0.2 rounded-full font-black shrink-0">
                            {pendingApprovalsCount}
                          </span>
                        ) : null}
                      </button>

                      <button
                        onClick={() => handleNavClick('approval_harian')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          activeView === 'approval_harian'
                            ? 'bg-maroon-800 text-white font-bold shadow-xs'
                            : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-left whitespace-nowrap">Absen Harian</span>
                      </button>

                      <button
                        onClick={() => handleNavClick('approval_izin')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          activeView === 'approval_izin'
                            ? 'bg-maroon-800 text-white font-bold shadow-xs'
                            : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="text-left whitespace-nowrap">Izin & Cuti</span>
                      </button>

                      <button
                        onClick={() => handleNavClick('approval_histori')}
                        className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          activeView === 'approval_histori'
                            ? 'bg-maroon-800 text-white font-bold shadow-xs'
                            : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                        }`}
                      >
                        <ClipboardList className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span className="text-left whitespace-nowrap">Semua Data Histori</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. PARENT: Absen Manual (Admin) */}
                {role === 'Admin' && (
                  <div>
                    <button
                      onClick={() => toggleSection('absenManual', 'absen_manual_form')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer text-left ${
                        isAbsenManualActive
                          ? 'bg-maroon-900/60 text-white font-bold border-l-2 border-emerald-400'
                          : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 text-left">
                        <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-left whitespace-nowrap">Absen Manual (Admin)</span>
                      </div>
                      <div className="flex items-center shrink-0 ml-2">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSection('absenManual');
                          }}
                          className="p-1 hover:text-white rounded cursor-pointer"
                          title="Buka / Tutup Submenu"
                        >
                          {expandedSections.absenManual ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Submenu Absen Manual */}
                    {expandedSections.absenManual && (
                      <div className="ml-5 pl-2.5 border-l-2 border-maroon-800/80 space-y-0.5 my-1">
                        <button
                          onClick={() => handleNavClick('absen_manual_form')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'absen_manual_form' || activeView === 'absen_manual'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <CalendarCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Form Absen Manual</span>
                        </button>

                        <button
                          onClick={() => handleNavClick('absen_manual_pekerjaan')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'absen_manual_pekerjaan'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Pekerjaan Tanpa Absen</span>
                        </button>

                        <button
                          onClick={() => handleNavClick('absen_manual_riwayat')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'absen_manual_riwayat'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Riwayat Absensi</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Hitung & Rekap Honor */}
                <button
                  onClick={() => handleNavClick('rekap_honor')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer text-left ${
                    activeView === 'rekap_honor'
                      ? 'bg-maroon-800 text-white font-bold'
                      : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 text-left">
                    <Calculator className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-left whitespace-nowrap">Hitung & Rekap Honor</span>
                  </div>
                  <ChevronRight className="w-4 h-4 opacity-70 shrink-0" />
                </button>

                {/* 4. Potongan Manual / Kasbon (Hanya Admin, pada PJ Server sudah terintegrasi di Hitung & Rekap Honor) */}
                {role === 'Admin' && (
                  <button
                    onClick={() => handleNavClick('potongan_manual')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer text-left ${
                      activeView === 'potongan_manual'
                        ? 'bg-maroon-800 text-white font-bold'
                        : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 text-left">
                      <Receipt className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-left whitespace-nowrap">Potongan Manual / Kasbon</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-70 shrink-0" />
                  </button>
                )}

                {/* 5. PARENT: Pengaturan Aplikasi & Database */}
                {role === 'Admin' && (
                  <div>
                    <button
                      onClick={() => toggleSection('pengaturan', 'pengaturan_profil')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors cursor-pointer text-left ${
                        isPengaturanActive
                          ? 'bg-maroon-900/60 text-white font-bold border-l-2 border-slate-300'
                          : 'text-slate-300 hover:bg-maroon-900/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0 text-left">
                        <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-left whitespace-nowrap">Pengaturan Aplikasi</span>
                      </div>
                      <div className="flex items-center shrink-0 ml-2">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSection('pengaturan');
                          }}
                          className="p-1 hover:text-white rounded cursor-pointer"
                          title="Buka / Tutup Submenu"
                        >
                          {expandedSections.pengaturan ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Submenu Pengaturan Aplikasi */}
                    {expandedSections.pengaturan && (
                      <div className="ml-5 pl-2.5 border-l-2 border-maroon-800/80 space-y-0.5 my-1">
                        <button
                          onClick={() => handleNavClick('pengaturan_profil')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'pengaturan_profil' || activeView === 'pengaturan'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Profil Perusahaan</span>
                        </button>

                        <button
                          onClick={() => handleNavClick('pengaturan_jam_kerja')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'pengaturan_jam_kerja'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Jam Kerja & Potongan</span>
                        </button>

                        <button
                          onClick={() => handleNavClick('pengaturan_notifikasi')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'pengaturan_notifikasi'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Notifikasi & Whatsapp Gateway</span>
                        </button>

                        <button
                          onClick={() => handleNavClick('pengaturan_google_sheets')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'pengaturan_google_sheets'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Integrasi Google Sheet</span>
                        </button>

                        <button
                          onClick={() => handleNavClick('pengaturan_panduan_sheets')}
                          className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            activeView === 'pengaturan_panduan_sheets'
                              ? 'bg-maroon-800 text-white font-bold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-maroon-900/40 font-medium'
                          }`}
                        >
                          <Code className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="text-left whitespace-nowrap">Struktur Column & Code Apps Script</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>
    </div>
  );

  return (
    <>
      {/* MOBILE DRAWER (Hanya tampil pada smartphone & tablet < lg saat dibuka) */}
      <div className="fixed inset-0 z-50 flex lg:hidden">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={onClose}
        />

        {/* Drawer Panel */}
        <aside className="relative w-64 max-w-[85vw] bg-[#1a040b] text-slate-300 h-full shadow-2xl flex flex-col z-10 border-r border-maroon-950/80 animate-in slide-in-from-left duration-200">
          {sidebarContent}
        </aside>
      </div>

      {/* DESKTOP PERSISTENT SIDEBAR (Selalu tampil di desktop >= lg, dapat disembunyikan dengan klik icon menu 3 garis) */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-[#1a040b] text-slate-300 h-[calc(100vh-4rem)] sticky top-16 shadow-xl flex-col z-20 border-r border-maroon-950/80">
        {sidebarContent}
      </aside>
    </>
  );
};

export const Sidebar: React.FC<SidebarProps> = React.memo(SidebarComponent);
