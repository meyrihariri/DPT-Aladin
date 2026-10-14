import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, CheckCircle2, UserCheck, Calendar, ShieldCheck, AlertCircle } from 'lucide-react';
import { AttendanceRecord } from '../types';

interface EditPresensiModalProps {
  record: AttendanceRecord;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedRecord: AttendanceRecord) => Promise<any> | void;
}

export const EditPresensiModal: React.FC<EditPresensiModalProps> = ({
  record,
  isOpen,
  onClose,
  onSave
}) => {
  const initialJamPulang = record.jamPulang && record.jamPulang !== '-' && record.jamPulang.trim()
    ? record.jamPulang
    : '17:00';

  const [jamMasuk, setJamMasuk] = useState<string>(record.jamMasuk || '08:00');
  const [jamPulang, setJamPulang] = useState<string>(initialJamPulang);
  const [status, setStatus] = useState<AttendanceRecord['status']>(
    record.status === 'Ditolak' ? 'Ditolak' : 'Hadir'
  );
  const [keteranganPulang, setKeteranganPulang] = useState<string>(
    record.keteranganPulang || 'Absen pulang diverifikasi oleh Admin'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const setPresetTime = (time: string) => {
    setJamPulang(time);
  };

  const setCurrentTime = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setJamPulang(`${hh}:${mm}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const isApproved = status !== 'Ditolak';
      const updated: AttendanceRecord = {
        ...record,
        jamMasuk: jamMasuk || '08:00',
        jamPulang: jamPulang || '17:00',
        status: status,
        isApproved: isApproved,
        needsApproval: false,
        isManual: true,
        keteranganPulang: keteranganPulang || 'Diverifikasi oleh Admin',
        potonganOtomatis: status === 'Ditolak' ? (record.potonganOtomatis || 25000) : 0
      };

      await onSave(updated);
      onClose();
    } catch (err) {
      console.error('Failed to save attendance record:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base leading-tight">
                  Input / Verifikasi Jam Pulang
                </h3>
                <p className="text-xs text-slate-700 font-normal">
                  Memastikan pekerjaan teknisi terhitung di rekap honor
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
            {/* Info Box */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-500" /> Teknisi:
                </span>
                <span className="font-bold text-slate-800 text-sm">{record.teknisiNama}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Tanggal:
                </span>
                <span className="font-mono text-xs font-bold text-slate-700">{record.tanggal}</span>
              </div>
              {record.serverNama && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Server:</span>
                  <span className="text-xs font-medium text-slate-700">{record.serverNama}</span>
                </div>
              )}
            </div>

            {/* Jam Masuk */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Jam Masuk (WIB)
              </label>
              <input
                type="time"
                value={jamMasuk}
                onChange={(e) => setJamMasuk(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Jam Pulang */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Jam Pulang (WIB) <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-indigo-600 font-medium">Harus diisi agar honor terhitung</span>
              </div>
              <input
                type="time"
                value={jamPulang}
                required
                onChange={(e) => setJamPulang(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-mono font-bold text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />

              {/* Quick Time Presets */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[11px] text-slate-600 font-medium">Pilihan cepat:</span>
                {['16:00', '16:30', '17:00', '17:30', '18:00'].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setPresetTime(t)}
                    className={`px-2 py-0.5 text-xs rounded-md border font-mono transition-colors ${
                      jamPulang === t
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={setCurrentTime}
                  className="px-2 py-0.5 text-xs rounded-md border border-slate-200 bg-amber-50 text-amber-800 font-medium hover:bg-amber-100 transition-colors"
                >
                  Sekarang
                </button>
              </div>
            </div>

            {/* Status Kehadiran */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Status Kehadiran
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="Hadir">Hadir (Disetujui & Valid Honor)</option>
                <option value="Izin">Izin</option>
                <option value="Sakit">Sakit</option>
                <option value="Ditolak">Ditolak</option>
              </select>
            </div>

            {/* Keterangan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan / Keterangan Pulang
              </label>
              <input
                type="text"
                value={keteranganPulang}
                onChange={(e) => setKeteranganPulang(e.target.value)}
                placeholder="Contoh: Absen pulang diverifikasi oleh Admin"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Notice */}
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-emerald-800 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Menyimpan jam pulang ini akan otomatis memverifikasi absensi teknisi dan memasukkan semua pekerjaan pada tanggal tersebut ke dalam rekapitulasi honor.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-98 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Simpan & Verifikasi'}</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
