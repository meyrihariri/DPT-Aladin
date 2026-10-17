import React, { useState, useEffect, useRef } from 'react';
import { Menu, Bell, ShieldCheck, UserCheck, HardHat, RefreshCw, LogOut, ChevronDown, User, Camera, Trash2, Check, Image as ImageIcon } from 'lucide-react';
import { Employee, AdminNotificationEvent } from '../types';
import { AdminNotificationPanel } from './AdminNotificationPanel';
import { StorageService } from '../services/storage';
import { compressProfileImage } from '../utils/imageHelper';

interface HeaderProps {
  currentUser: Employee | null;
  onOpenSidebar: () => void;
  pendingApprovalsCount: number;
  onNavigateApproval: () => void;
  isSheetConnected: boolean;
  onSyncDatabase: () => void;
  onPullDatabase?: () => void;
  isSyncing: boolean;
  onOpenQuickAddJob?: () => void;
  logoUrl?: string;
  companyName?: string;
  adminNotificationEvents?: AdminNotificationEvent[];
  unreadEventsCount?: number;
  onMarkAllEventsRead?: () => void;
  onNavigateFromNotification?: (type: AdminNotificationEvent['type'], data?: any) => void;
  onLogout?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  currentUser,
  onOpenSidebar,
  pendingApprovalsCount,
  onNavigateApproval,
  isSheetConnected,
  onSyncDatabase,
  onPullDatabase,
  isSyncing,
  onOpenQuickAddJob,
  logoUrl,
  companyName,
  adminNotificationEvents = [],
  unreadEventsCount = 0,
  onMarkAllEventsRead,
  onNavigateFromNotification,
  onLogout
}) => {
  const [isNotifPanelOpen, setIsNotifPanelOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [userPhoto, setUserPhoto] = useState<string>('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync profile photo from local storage when currentUser changes
  useEffect(() => {
    if (currentUser?.id || currentUser?.username) {
      const savedPhoto = StorageService.getUserProfilePhoto(currentUser.id || currentUser.username);
      setUserPhoto(savedPhoto);
    } else {
      setUserPhoto('');
    }
  }, [currentUser]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    try {
      setIsProcessingPhoto(true);
      const base64 = await compressProfileImage(file, 320, 0.84);
      if (base64) {
        StorageService.saveUserProfilePhoto(currentUser.id || currentUser.username, base64);
        setUserPhoto(base64);
        setPhotoFeedback('Foto profil berhasil diperbarui pada perangkat ini!');
        setTimeout(() => setPhotoFeedback(null), 3500);
      }
    } catch (err) {
      console.error('Failed to process profile photo:', err);
      setPhotoFeedback('Gagal memproses foto. Silakan coba lagi.');
      setTimeout(() => setPhotoFeedback(null), 3500);
    } finally {
      setIsProcessingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemovePhoto = () => {
    if (!currentUser) return;
    StorageService.removeUserProfilePhoto(currentUser.id || currentUser.username);
    setUserPhoto('');
    setPhotoFeedback('Foto profil dihapus (kembali ke inisial nama).');
    setTimeout(() => setPhotoFeedback(null), 3500);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const getRoleIcon = () => {
    if (!currentUser) return null;
    switch (currentUser.role) {
      case 'Admin':
        return <ShieldCheck className="w-4 h-4 text-amber-500" />;
      case 'Penanggungjawab Server':
        return <UserCheck className="w-4 h-4 text-emerald-500" />;
      default:
        return <HardHat className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shadow-xs">
      {/* Left: Mobile Drawer Trigger & App Brand / Live Badge */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-hidden active:scale-95 transition-transform"
          aria-label="Open Sidebar"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="flex items-center space-x-3">
          {logoUrl ? (
            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 overflow-hidden p-0.5 shadow-xs flex items-center justify-center">
              <img src={logoUrl} alt="Logo Perusahaan" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-maroon-800 text-white flex items-center justify-center font-extrabold text-base shadow-xs tracking-tight">
              A
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-slate-900 tracking-tight text-sm sm:text-base leading-none">
              DPT-AlaDin
            </h1>
          </div>
        </div>
      </div>

      {/* Right: Quick Controls & Action Button */}
      <div className="flex items-center space-x-2 sm:space-x-3">

        {/* Unified Real-time Notification Bell for all roles */}
        <button
          onClick={() => setIsNotifPanelOpen(true)}
          className="relative p-2 rounded-xl bg-maroon-50 text-maroon-800 hover:bg-maroon-100 transition-colors"
          title="Pusat Notifikasi Aktivitas Teknisi & Pekerjaan"
        >
          <Bell className="w-5 h-5" />
          {((unreadEventsCount > 0) || (currentUser?.role !== 'Teknisi' && pendingApprovalsCount > 0)) && (
            <span className="absolute -top-1 -right-1 bg-maroon-800 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
              {unreadEventsCount + (currentUser?.role !== 'Teknisi' ? pendingApprovalsCount : 0)}
            </span>
          )}
        </button>

        {/* Real-time Notification Slide-out Panel */}
        <AdminNotificationPanel
          isOpen={isNotifPanelOpen}
          onClose={() => setIsNotifPanelOpen(false)}
          events={adminNotificationEvents}
          unreadCount={unreadEventsCount}
          onMarkAllAsRead={() => {
            if (onMarkAllEventsRead) onMarkAllEventsRead();
          }}
          onNavigate={(type, data) => {
            if (onNavigateFromNotification) {
              onNavigateFromNotification(type, data);
            }
          }}
          pendingApprovalsCount={currentUser?.role !== 'Teknisi' ? pendingApprovalsCount : 0}
          onNavigateApproval={onNavigateApproval}
          currentUserRole={currentUser?.role}
        />

        {/* Logged in User Profile Info (Click to open Profile & Logout Menu) */}
        {currentUser && (
          <div className="relative" ref={userMenuRef}>
            {/* Hidden File Input for Profile Photo Upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />

            <button
              type="button"
              onClick={() => setIsUserMenuOpen(prev => !prev)}
              className="p-1 sm:p-1.5 bg-maroon-50/90 hover:bg-maroon-100 border border-maroon-200/80 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95 focus:outline-hidden flex items-center justify-center"
              title={`Profil ${currentUser.namaLengkap} (${currentUser.role})`}
              aria-label="Profil Pengguna"
              aria-expanded={isUserMenuOpen}
            >
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={currentUser.namaLengkap}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover shadow-xs border border-maroon-300 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-maroon-800 text-white flex items-center justify-center font-black text-xs sm:text-sm shadow-xs shrink-0">
                  {currentUser.namaLengkap?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
            </button>

            {/* Logout & User Details Dropdown Popover */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header Profile Summary with Interactive Avatar */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center space-x-3">
                  <div className="relative group shrink-0">
                    {userPhoto ? (
                      <img
                        src={userPhoto}
                        alt={currentUser.namaLengkap}
                        className="w-12 h-12 rounded-xl object-cover shadow-xs border-2 border-maroon-200 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-maroon-800 text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0">
                        {currentUser.namaLengkap?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 p-1 bg-white hover:bg-slate-100 text-slate-700 rounded-full border border-slate-200 shadow-2xs cursor-pointer transition-all active:scale-95"
                      title="Ganti Foto Profil"
                    >
                      <Camera className="w-3 h-3 text-maroon-800" />
                    </button>
                  </div>

                  <div className="overflow-hidden min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-900 truncate">
                      {currentUser.namaLengkap}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      Role: <span className="font-bold text-maroon-800">{currentUser.role}</span>
                    </p>
                    {currentUser.namaServer && (
                      <p className="text-[10px] text-slate-400 truncate">
                        Server: <span className="font-semibold text-slate-600">{currentUser.namaServer}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Feedback Toast message */}
                {photoFeedback && (
                  <div className="mx-3 my-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 font-semibold flex items-center space-x-1.5 animate-in fade-in duration-150">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{photoFeedback}</span>
                  </div>
                )}

                {/* Fitur Ganti Foto Profil User */}
                <div className="px-3 py-2 border-b border-slate-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Foto Profil Pengguna
                  </span>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      disabled={isProcessingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{isProcessingPhoto ? 'Memproses...' : userPhoto ? 'Ubah Foto' : 'Ganti Foto'}</span>
                    </button>

                    {userPhoto && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95"
                        title="Hapus Foto Profil (Gunakan inisial nama)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    )}
                  </div>

                  <p className="text-[9px] text-slate-400 leading-tight">
                    🔒 Foto profil disimpan aman pada memori perangkat ini (tanpa mengubah Google Sheet).
                  </p>
                </div>

                {/* Account Status: Tetap / Magang */}
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span className="text-[11px] text-slate-500 font-medium">Status Karyawan:</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold text-[10px] rounded-full border border-emerald-200">
                    ● {currentUser.status || 'Tetap'}
                  </span>
                </div>

                {/* Logout Action Button */}
                <div className="p-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      if (onLogout) onLogout();
                    }}
                    className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/70 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs active:scale-95"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-700" />
                    <span>Keluar Akun / Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export const Header: React.FC<HeaderProps> = React.memo(HeaderComponent);

