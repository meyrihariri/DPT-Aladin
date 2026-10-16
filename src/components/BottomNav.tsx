import React from 'react';
import { Home, Plus, ClipboardList, CalendarCheck, Wallet } from 'lucide-react';
import { NavView } from './Sidebar';
import { isDeviceOnline } from '../utils/networkCheck';
import { showAppAlert } from '../utils/dialogService';

interface BottomNavProps {
  activeView: NavView;
  onSelectView: (view: NavView) => void;
  onOpenQuickAddJob: () => void;
  userRole?: string;
}

const BottomNavComponent: React.FC<BottomNavProps> = ({
  activeView,
  onSelectView,
  onOpenQuickAddJob,
  userRole
}) => {
  const isTeknisi = userRole === 'Teknisi';
  const isBerandaActive = isTeknisi
    ? activeView === 'teknisi_dashboard' || activeView === 'dashboard'
    : activeView === 'dashboard' || activeView === 'teknisi_dashboard';

  const handleNavClick = (target: NavView) => {
    onSelectView(target);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 px-2 pt-1 pb-safe flex items-center justify-around shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:hidden transition-all"
      aria-label="Mobile Navigation"
    >
      {/* 1. Beranda (Pengganti Lapangan) */}
      <button
        onClick={() => handleNavClick(isTeknisi ? 'teknisi_dashboard' : 'dashboard')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-1 rounded-xl transition-all cursor-pointer ${
          isBerandaActive
            ? 'text-maroon-800 font-extrabold scale-105'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        <Home className="w-5 h-5 mb-0.5 shrink-0" />
        <span className="text-[10px] tracking-tight">Beranda</span>
        {isBerandaActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-maroon-800 mt-0.5" />
        )}
      </button>

      {/* 2. Planning Pekerjaan */}
      <button
        onClick={() => handleNavClick('pekerjaan_planning')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-1 rounded-xl transition-all cursor-pointer ${
          activeView === 'pekerjaan_planning'
            ? 'text-maroon-800 font-extrabold scale-105'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        <ClipboardList className="w-5 h-5 mb-0.5 shrink-0" />
        <span className="text-[10px] tracking-tight">Planning</span>
        {activeView === 'pekerjaan_planning' && (
          <span className="w-1.5 h-1.5 rounded-full bg-maroon-800 mt-0.5" />
        )}
      </button>

      {/* 3. CENTER ACTION BUTTON: Quick Input Pekerjaan */}
      <div className="relative -top-3 flex flex-col items-center">
        <button
          onClick={() => {
            if (!isDeviceOnline()) {
              showAppAlert({
                title: 'Koneksi Terputus',
                message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nSilakan periksa koneksi internet HP Anda sebelum melakukan input pekerjaan.',
                type: 'warning'
              });
              return;
            }
            onOpenQuickAddJob();
          }}
          className="flex items-center justify-center bg-maroon-800 hover:bg-maroon-900 text-white w-12 h-12 rounded-full shadow-lg shadow-maroon-900/35 border-2 border-white active:scale-90 transition-transform cursor-pointer"
          title="Input Pekerjaan Baru"
          aria-label="Input Pekerjaan Baru"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
        <span className="text-[9px] font-bold text-maroon-900 mt-0.5">Input</span>
      </div>

      {/* 4. Absensi */}
      <button
        onClick={() => handleNavClick('approval_absensi')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-1 rounded-xl transition-all cursor-pointer ${
          activeView.startsWith('approval_')
            ? 'text-maroon-800 font-extrabold scale-105'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        <CalendarCheck className="w-5 h-5 mb-0.5 shrink-0" />
        <span className="text-[10px] tracking-tight">Absensi</span>
        {activeView.startsWith('approval_') && (
          <span className="w-1.5 h-1.5 rounded-full bg-maroon-800 mt-0.5" />
        )}
      </button>

      {/* 5. Gaji (Honor) */}
      <button
        onClick={() => handleNavClick('rekap_honor')}
        className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-1 rounded-xl transition-all cursor-pointer ${
          activeView === 'rekap_honor' || activeView === 'potongan_manual'
            ? 'text-maroon-800 font-extrabold scale-105'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        <Wallet className="w-5 h-5 mb-0.5 shrink-0" />
        <span className="text-[10px] tracking-tight">Gaji</span>
        {(activeView === 'rekap_honor' || activeView === 'potongan_manual') && (
          <span className="w-1.5 h-1.5 rounded-full bg-maroon-800 mt-0.5" />
        )}
      </button>
    </nav>
  );
};

export const BottomNav: React.FC<BottomNavProps> = React.memo(BottomNavComponent);
