import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  WifiOff
} from 'lucide-react';
import { DialogService, DialogOptions } from '../utils/dialogService';

interface ActiveDialogState extends DialogOptions {
  id: number;
  resolve: (val: boolean) => void;
}

export const AppDialog: React.FC = () => {
  const [activeDialog, setActiveDialog] = useState<ActiveDialogState | null>(null);

  useEffect(() => {
    const unsubscribe = DialogService.subscribe((dialog) => {
      setActiveDialog(dialog);
    });

    // Also override standard window.alert with modern dialog as a seamless fallback
    if (typeof window !== 'undefined') {
      const nativeAlert = window.alert;
      window.alert = (msg?: any) => {
        DialogService.alert({
          message: String(msg ?? ''),
          type: 'info'
        });
      };

      return () => {
        unsubscribe();
        window.alert = nativeAlert;
      };
    }

    return unsubscribe;
  }, []);

  if (!activeDialog) return null;

  const handleConfirm = () => {
    const dialog = activeDialog;
    setActiveDialog(null);
    dialog.resolve(true);
  };

  const handleCancel = () => {
    const dialog = activeDialog;
    setActiveDialog(null);
    dialog.resolve(false);
  };

  // Safely extract string representation of message
  const rawMessage = activeDialog.message;
  const messageStr = typeof rawMessage === 'string'
    ? rawMessage
    : (rawMessage instanceof Error ? rawMessage.message : (rawMessage != null ? String(rawMessage) : ''));

  // Determine icon and color scheme based on dialog type & content
  const lowerMsg = messageStr.toLowerCase();
  const isNetworkIssue =
    lowerMsg.includes('jaringan') ||
    lowerMsg.includes('internet') ||
    lowerMsg.includes('koneksi');

  const getTypeStyle = () => {
    if (isNetworkIssue) {
      return {
        icon: <WifiOff className="w-8 h-8 text-amber-600" />,
        badgeBg: 'bg-amber-100/90 text-amber-700 border border-amber-200',
        confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30'
      };
    }

    switch (activeDialog.type) {
      case 'error':
        return {
          icon: <AlertCircle className="w-8 h-8 text-rose-600" />,
          badgeBg: 'bg-rose-100 text-rose-700 border border-rose-200',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-8 h-8 text-amber-600" />,
          badgeBg: 'bg-amber-100 text-amber-700 border border-amber-200',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30'
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
          badgeBg: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
        };
      default:
        return {
          icon: <Info className="w-8 h-8 text-maroon-700" />,
          badgeBg: 'bg-maroon-50 text-maroon-800 border border-maroon-200',
          confirmBtn: 'bg-maroon-800 hover:bg-maroon-900 text-white shadow-maroon-900/30'
        };
    }
  };

  const style = getTypeStyle();

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none"
        role="dialog"
        aria-modal="true"
      >
        {/* Backdrop dismiss only for alerts */}
        <div
          className="absolute inset-0"
          onClick={() => {
            if (!activeDialog.isConfirm) {
              handleConfirm();
            }
          }}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-sm sm:max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100/90 text-center flex flex-col items-center z-10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle decorative background glow */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-slate-100 rounded-full blur-2xl pointer-events-none opacity-60" />

          {/* Close X button top right */}
          <button
            type="button"
            onClick={activeDialog.isConfirm ? handleCancel : handleConfirm}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Tutup Dialog"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon Badge */}
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs ${style.badgeBg}`}
          >
            {style.icon}
          </div>

          {/* Title */}
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug px-2">
            {activeDialog.title || 'Pemberitahuan'}
          </h3>

          {/* Body Message */}
          <div className="mt-2.5 max-h-[60vh] overflow-y-auto px-1 w-full">
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line font-medium text-center">
              {messageStr}
            </p>
          </div>

          {/* Action Buttons */}
          <div className={`mt-5 w-full flex ${activeDialog.isConfirm ? 'gap-2.5' : 'gap-0'}`}>
            {activeDialog.isConfirm && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                {activeDialog.cancelText || 'Batal'}
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 py-2.5 px-4 font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-95 cursor-pointer ${style.confirmBtn}`}
            >
              {activeDialog.confirmText || 'Oke, Mengerti'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
