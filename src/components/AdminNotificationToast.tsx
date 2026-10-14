import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserCheck, Calendar, Briefcase, Clock, X, ChevronRight } from 'lucide-react';
import { AdminNotificationEvent } from '../types';

interface AdminNotificationToastProps {
  event: AdminNotificationEvent | null;
  onClose: () => void;
  onClick: (event: AdminNotificationEvent) => void;
}

export const AdminNotificationToast: React.FC<AdminNotificationToastProps> = ({
  event,
  onClose,
  onClick
}) => {
  if (!event) return null;

  const getIcon = () => {
    switch (event.type) {
      case 'technician_online':
        return <UserCheck className="w-5 h-5 text-emerald-600" />;
      case 'attendance_submitted':
        return <Clock className="w-5 h-5 text-sky-600" />;
      case 'planning_created':
        return <Calendar className="w-5 h-5 text-indigo-600" />;
      case 'job_submitted':
        return <Briefcase className="w-5 h-5 text-amber-600" />;
      default:
        return <UserCheck className="w-5 h-5 text-maroon-600" />;
    }
  };

  const getBorderColor = () => {
    switch (event.type) {
      case 'technician_online':
        return 'border-emerald-200 bg-emerald-50/95';
      case 'attendance_submitted':
        return 'border-sky-200 bg-sky-50/95';
      case 'planning_created':
        return 'border-indigo-200 bg-indigo-50/95';
      case 'job_submitted':
        return 'border-amber-200 bg-amber-50/95';
      default:
        return 'border-maroon-200 bg-maroon-50/95';
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-md pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`p-3.5 rounded-2xl shadow-xl border backdrop-blur-md ${getBorderColor()} flex items-start space-x-3 transition-all`}
        >
          <div className="p-2 rounded-xl bg-white shadow-xs shrink-0 mt-0.5">
            {getIcon()}
          </div>

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => onClick(event)}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 truncate">
                {event.title}
              </h4>
              <span className="text-[10px] text-slate-500 ml-2 shrink-0">
                Baru saja
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5 line-clamp-2 leading-relaxed">
              {event.body}
            </p>
            <div className="flex items-center text-[11px] font-bold text-maroon-800 mt-1.5 space-x-0.5">
              <span>Buka Menu</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-colors shrink-0"
            title="Tutup Notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
