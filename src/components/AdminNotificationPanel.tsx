import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Check,
  Clock,
  UserCheck,
  Calendar,
  Briefcase,
  Smartphone,
  ExternalLink,
  ChevronRight,
  X,
  ArrowLeft
} from 'lucide-react';
import { AdminNotificationEvent } from '../types';
import { NotificationService } from '../services/notificationService';

interface AdminNotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  events: AdminNotificationEvent[];
  unreadCount: number;
  onMarkAllAsRead: () => void;
  onNavigate: (type: AdminNotificationEvent['type'], data?: any) => void;
  pendingApprovalsCount: number;
  onNavigateApproval: () => void;
  currentUserRole?: string;
}

export const AdminNotificationPanel: React.FC<AdminNotificationPanelProps> = ({
  isOpen,
  onClose,
  events,
  unreadCount,
  onMarkAllAsRead,
  onNavigate,
  pendingApprovalsCount,
  onNavigateApproval,
  currentUserRole
}) => {
  const [permissionStatus, setPermissionStatus] = useState<string>('default');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPermissionStatus(NotificationService.getPermissionStatus());
    }
  }, [isOpen]);

  // Handle escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleRequestPush = async () => {
    const res = await NotificationService.requestPermission();
    setPermissionStatus(res);
  };

  if (!isOpen) return null;

  const isTeknisi = currentUserRole === 'Teknisi';
  const panelTitle = isTeknisi ? 'Pusat Notifikasi' : 'Pusat Notifikasi Admin';
  const panelSubtitle = isTeknisi ? 'Aktivitas teknisi & pekerjaan real-time' : 'Aktivitas teknisi & pekerjaan real-time';

  const getEventIcon = (type: AdminNotificationEvent['type']) => {
    switch (type) {
      case 'technician_online':
        return <UserCheck className="w-4 h-4 text-emerald-600" />;
      case 'attendance_submitted':
        return <Clock className="w-4 h-4 text-sky-600" />;
      case 'planning_created':
        return <Calendar className="w-4 h-4 text-indigo-600" />;
      case 'job_submitted':
        return <Briefcase className="w-4 h-4 text-amber-600" />;
      default:
        return <Bell className="w-4 h-4 text-maroon-600" />;
    }
  };

  const formatEventTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Baru saja';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Slide-in Card Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-sm sm:max-w-md bg-white h-[100dvh] max-h-[100dvh] shadow-2xl border-l border-slate-200 flex flex-col z-10"
        >
          {/* Header with prominent Close Button */}
          <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
            <div className="flex items-center space-x-2.5 min-w-0 pr-2">
              <div className="p-2 rounded-xl bg-maroon-50 text-maroon-800 shrink-0 shadow-2xs">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-slate-900 text-sm truncate">{panelTitle}</h3>
                <p className="text-[11px] text-slate-500 truncate">{panelSubtitle}</p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className="flex items-center space-x-1 text-[11px] font-bold text-maroon-800 hover:text-maroon-900 px-2 py-1 rounded-lg hover:bg-maroon-50 transition-colors"
                  title="Tandai semua telah dibaca"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Baca Semua</span>
                </button>
              )}
              {/* Prominent Close Button (X) */}
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 hover:text-slate-950 active:scale-95 transition-all flex items-center justify-center shadow-2xs"
                title="Tutup Notifikasi (Esc)"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Push Notification Banner Prompt if not granted */}
          {permissionStatus !== 'granted' && permissionStatus !== 'unsupported' && (
            <div className="p-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center space-x-2 pr-2">
                <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-[11px] font-semibold text-amber-800 leading-tight">
                  Aktifkan Notifikasi Banner di HP/Browser
                </span>
              </div>
              <button
                onClick={handleRequestPush}
                className="text-[10px] font-extrabold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg transition-all shrink-0"
              >
                Izinkan
              </button>
            </div>
          )}

          {/* Pending Approval Shortcut Card */}
          {pendingApprovalsCount > 0 && (
            <div
              onClick={() => {
                onNavigateApproval();
                onClose();
              }}
              className="mx-3 mt-3 p-3 rounded-xl bg-maroon-50 border border-maroon-200 cursor-pointer hover:bg-maroon-100/70 transition-all flex items-center justify-between"
            >
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-maroon-600 animate-ping shrink-0" />
                <div>
                  <h5 className="text-xs font-bold text-maroon-900">
                    {pendingApprovalsCount} Approval Absensi Tertunda
                  </h5>
                  <p className="text-[11px] text-maroon-700">Teknisi menunggu persetujuan kehadiran</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-maroon-800 shrink-0" />
            </div>
          )}

          {/* Events List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-12 px-4 text-slate-400">
                <Bell className="w-10 h-10 mx-auto text-slate-300 stroke-1 mb-2" />
                <p className="text-xs font-semibold text-slate-600">Belum ada notifikasi baru</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                  Notifikasi akan otomatis muncul saat ada teknisi online, absen, planning baru, atau input pekerjaan.
                </p>
              </div>
            ) : (
              events.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => {
                    onNavigate(evt.type, evt.data);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer hover:shadow-xs ${
                    evt.read ? 'bg-white border-slate-100 hover:bg-slate-50/80' : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start space-x-2.5">
                    <div className="p-2 rounded-lg bg-white shadow-2xs border border-slate-100 shrink-0 mt-0.5">
                      {getEventIcon(evt.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-slate-900 truncate pr-1">
                          {evt.title}
                        </h5>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {formatEventTime(evt.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                        {evt.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer with prominent Close Action */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
              Real-time Active Listener
            </span>
            <button
              onClick={onClose}
              className="w-full sm:w-auto text-center font-bold text-slate-700 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-300 active:scale-98 px-5 py-2 rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 shadow-2xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>Tutup Notifikasi</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
