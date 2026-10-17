import React, { useState } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MapPin,
  Eye,
  Search,
  Check,
  X,
  FileText,
  Trash2,
  Database,
  RefreshCw,
  Edit3,
  UserCheck,
  Calendar,
  Server
} from 'lucide-react';
import { AttendanceRecord, LeaveRequest, ServerData, Employee } from '../types';
import { formatRupiah } from '../services/payroll';
import { StorageService, getNormalizedTechKey } from '../services/storage';
import { sanitizeDateString } from '../services/googleSheetsHelper';
import { SafeImage } from '../components/SafeImage';
import { isValidPhotoUrl } from '../utils/imageHelper';
import { showAppConfirm } from '../utils/dialogService';
import { EditPresensiModal } from '../components/EditPresensiModal';

export type ApprovalTab = 'perlu_approval' | 'absen_harian' | 'izin_cuti' | 'semua_data';

interface ApprovalAbsensiViewProps {
  initialTab?: ApprovalTab;
  onSelectTab?: (tab: ApprovalTab) => void;
  attendanceList: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  servers?: ServerData[];
  currentUser?: Employee | null;
  onApproveAttendance: (id: string, isApproved: boolean, note?: string) => void | Promise<any>;
  onApproveLeave: (id: string, isApproved: boolean) => void;
  onDeleteAttendance?: (id: string) => void;
  onDeleteLeave?: (id: string) => void;
  onClearAllAttendanceAndLeave?: () => void;
  onApproveAllAttendance?: () => void | Promise<any>;
  isSyncing?: boolean;
  isSheetConnected?: boolean;
  onSyncDatabase?: () => void;
  onUpdateAttendance?: (record: AttendanceRecord) => Promise<any> | void;
  onNavigateAbsenManual?: () => void;
}

const ApprovalAbsensiViewComponent: React.FC<ApprovalAbsensiViewProps> = ({
  initialTab = 'perlu_approval',
  onSelectTab,
  attendanceList,
  leaveRequests,
  servers,
  currentUser,
  onApproveAttendance,
  onApproveLeave,
  onDeleteAttendance,
  onDeleteLeave,
  onClearAllAttendanceAndLeave,
  onApproveAllAttendance,
  isSyncing = false,
  isSheetConnected = false,
  onSyncDatabase,
  onUpdateAttendance,
  onNavigateAbsenManual
}) => {
  const [activeTab, setActiveTab] = useState<ApprovalTab>(initialTab);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: ApprovalTab) => {
    setActiveTab(tab);
    onSelectTab?.(tab);
  };
  const [editingPresensiRecord, setEditingPresensiRecord] = useState<AttendanceRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const isPjServer = currentUser?.role === 'Penanggungjawab Server';

  // Helper to resolve Server ID into Server Name
  const getServerDisplayName = (serverNama?: string, serverId?: string, teknisiId?: string, teknisiNama?: string): string => {
    const srvList = servers && servers.length > 0 ? servers : StorageService.getServers();
    const isInvalidServerName = (s?: string) => {
      if (!s) return true;
      const l = s.toLowerCase().trim();
      return l === 'ya' || l === 'tidak' || l === 'yes' || l === 'no' || l === 'true' || l === 'false' || l === '-' || l === '--' || l === 'undefined' || l === 'null' || l === 'server' || l === 'server ya' || l === 'server tidak' || !isNaN(Number(s));
    };

    // If serverNama is already a friendly name (not a srv- ID and not invalid)
    if (serverNama && !serverNama.startsWith('srv-') && !isInvalidServerName(serverNama)) {
      return serverNama.trim();
    }
    
    // Look up by serverId or serverNama
    const targetId = (serverId && !isInvalidServerName(serverId) && serverId.trim()) || (serverNama && serverNama.startsWith('srv-') ? serverNama.trim() : '');
    if (targetId) {
      const match = srvList.find(s => s.id === targetId || s.namaServer.toLowerCase() === targetId.toLowerCase());
      if (match?.namaServer) {
        return match.namaServer;
      }
    }

    // Look up technician from employees
    if (teknisiId || teknisiNama) {
      const empList = StorageService.getEmployees();
      const emp = empList.find(e => (teknisiId && e.id === teknisiId) || (teknisiNama && e.namaLengkap && e.namaLengkap.toLowerCase().trim() === teknisiNama.toLowerCase().trim()));
      if (emp?.namaServer && !isInvalidServerName(emp.namaServer)) {
        return emp.namaServer;
      }
      if (emp?.serverId) {
        const match = srvList.find(s => s.id === emp.serverId);
        if (match?.namaServer) return match.namaServer;
      }
    }

    if (serverNama && !isInvalidServerName(serverNama)) {
      return serverNama.trim();
    }

    const firstValid = srvList.find(s => s.namaServer && !isInvalidServerName(s.namaServer));
    return firstValid?.namaServer || 'Server Utama';
  };

  // Check if an attendance record belongs to the PJ user's server
  const isAttendanceForUserServer = (a: AttendanceRecord): boolean => {
    if (!currentUser || currentUser.role === 'Admin') return true;
    if (isPjServer) {
      const assignedServerId = currentUser.serverId;
      const assignedServerNama = currentUser.namaServer;

      if (assignedServerId && (a.serverId === assignedServerId || a.serverNama === assignedServerId)) {
        return true;
      }
      if (assignedServerNama && a.serverNama && a.serverNama.toLowerCase().trim() === assignedServerNama.toLowerCase().trim()) {
        return true;
      }
      const srvList = servers && servers.length > 0 ? servers : StorageService.getServers();
      const userServer = srvList.find(s =>
        s.id === assignedServerId ||
        (assignedServerNama && s.namaServer.toLowerCase().trim() === assignedServerNama.toLowerCase().trim()) ||
        s.penanggungJawabId === currentUser.id ||
        (s.penanggungJawabNama && currentUser.namaLengkap && s.penanggungJawabNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim())
      );
      if (userServer) {
        if (
          a.serverId === userServer.id ||
          a.serverNama === userServer.id ||
          (a.serverNama && a.serverNama.toLowerCase().trim() === userServer.namaServer.toLowerCase().trim())
        ) {
          return true;
        }
      }
      return false;
    }
    return true;
  };

  // Filter lists
  const deletedIds = new Set(StorageService.getDeletedAttendanceIds());
  const resolvedKeys = new Set(StorageService.getResolvedAttendanceKeys());
  deletedIds.add('att-1788758276968');

  const cleanAttendanceList = attendanceList
    .filter(a => !deletedIds.has(a.id))
    .filter(a => isAttendanceForUserServer(a))
    .sort((a, b) => {
      const cmp = (b.tanggal || '').localeCompare(a.tanggal || '');
      if (cmp !== 0) return cmp;
      const tCmp = (b.jamMasuk || '').localeCompare(a.jamMasuk || '');
      if (tCmp !== 0) return tCmp;
      const mA = String(a.id || '').match(/(\d+)/g);
      const mB = String(b.id || '').match(/(\d+)/g);
      const nA = mA && mA.length > 0 ? Number(mA[mA.length - 1]) || 0 : 0;
      const nB = mB && mB.length > 0 ? Number(mB[mB.length - 1]) || 0 : 0;
      return nB - nA;
    });

  const pendingAttendanceList = cleanAttendanceList.filter(a => {
    const cleanDate = sanitizeDateString(a.tanggal);
    const techKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
    const groupKey = `${cleanDate}_${techKey}`.toLowerCase();
    const dateTechIdKey = `${cleanDate}_${a.teknisiId}`.toLowerCase();
    const dateTechNamaKey = `${cleanDate}_${(a.teknisiNama || '').toLowerCase().trim()}`;

    if (a.status === 'Ditolak') return false;

    // Hanya lewati jika telah disetujui secara eksplisit oleh admin untuk tanggal ini atau absensi manual
    const isExplicitlyResolved = 
      a.isApproved === true ||
      (a.status === 'Hadir' && a.needsApproval === false) ||
      (a.status === 'Hadir' && !a.needsApproval) ||
      resolvedKeys.has(groupKey) || 
      resolvedKeys.has((a.id || '').toLowerCase()) || 
      resolvedKeys.has(dateTechIdKey) ||
      resolvedKeys.has(dateTechNamaKey) ||
      a.isManual === true ||
      a.id.startsWith('att-manual-');

    if (isExplicitlyResolved) {
      return false;
    }

    // Jika sudah berstatus Hadir dan tidak ada flag needsApproval, maka bukan pending
    if (a.status === 'Hadir' && !a.needsApproval) {
      return false;
    }

    return Boolean(a.needsApproval || a.status === 'Pending Approval' || a.status === 'Terlambat');
  });

  const pendingLeaveList = leaveRequests.filter(l => l.status === 'Pending');

  const totalPendingCount = pendingAttendanceList.length + pendingLeaveList.length;

  const handlePromptDeleteAttendance = async (id: string, teknisiNama: string, tanggal: string) => {
    const confirmed = await showAppConfirm({
      title: `Hapus Absensi ${teknisiNama}`,
      message: `Apakah Anda yakin ingin menghapus data absensi tanggal ${tanggal} untuk ${teknisiNama}? Data yang dihapus akan otomatis disinkronkan ke Google Sheets.`,
      type: 'warning',
      confirmText: 'Ya, Hapus Data',
      cancelText: 'Batal'
    });
    if (confirmed && onDeleteAttendance) {
      onDeleteAttendance(id);
    }
  };

  const handlePromptDeleteLeave = async (id: string, teknisiNama: string, jenis: string, tanggal: string) => {
    const confirmed = await showAppConfirm({
      title: `Hapus Izin/Cuti ${teknisiNama}`,
      message: `Apakah Anda yakin ingin menghapus pengajuan ${jenis} untuk ${teknisiNama} tanggal ${tanggal}?`,
      type: 'warning',
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal'
    });
    if (confirmed && onDeleteLeave) {
      onDeleteLeave(id);
    }
  };

  const handlePromptClearAll = async () => {
    const confirmed = await showAppConfirm({
      title: 'Kosongkan Seluruh Data Absensi & Izin',
      message: 'Apakah Anda yakin ingin menghapus seluruh data riwayat absensi dan izin? Tindakan ini akan mengosongkan data lokal dan memperbarui sinkronisasi ke Google Sheets.',
      type: 'error',
      confirmText: 'Ya, Kosongkan Semua',
      cancelText: 'Batal'
    });
    if (confirmed && onClearAllAttendanceAndLeave) {
      onClearAllAttendanceAndLeave();
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Approval & Verification Absensi</span>
            {isSheetConnected && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Sheets Connected
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {currentUser?.role === 'Admin' && onNavigateAbsenManual && (
            <button
              onClick={onNavigateAbsenManual}
              className="px-3 py-1.5 bg-maroon-800 hover:bg-maroon-900 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              title="Input data absen manual bagi teknisi yang bermasalah saat absen"
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Absen Manual</span>
            </button>
          )}

          {!isPjServer && onClearAllAttendanceAndLeave && (cleanAttendanceList.length > 0 || leaveRequests.length > 0) && (
            <button
              onClick={handlePromptClearAll}
              className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 flex items-center space-x-1.5 active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Kosongkan Absen</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-bold px-2 py-0.5"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => handleTabChange('perlu_approval')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'perlu_approval'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Perlu Approval ({totalPendingCount})</span>
        </button>

        <button
          onClick={() => handleTabChange('absen_harian')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'absen_harian'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Absen Harian ({cleanAttendanceList.length})</span>
        </button>

        <button
          onClick={() => handleTabChange('izin_cuti')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'izin_cuti'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Izin & Cuti ({leaveRequests.length})</span>
        </button>

        <button
          onClick={() => handleTabChange('semua_data')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'semua_data'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Semua Data Histori</span>
        </button>
      </div>

      {/* TAB 1: PERLU APPROVAL */}
      {activeTab === 'perlu_approval' && (
        <div className="space-y-4">
          {totalPendingCount === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">Tidak Ada Approval Tertunda</h3>
              <p className="text-xs text-slate-400">
                Semua absensi dan permohonan izin telah disetujui atau diproses.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Batch Action Bar */}
              {pendingAttendanceList.length > 0 && onApproveAllAttendance && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-900">
                      Terdapat {pendingAttendanceList.length} absensi teknisi tertunda
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      const count = pendingAttendanceList.length;
                      setActionFeedback(`⏳ Menyetujui ${count} absensi & menyinkronkan ke Google Sheets...`);
                      try {
                        const res: any = await onApproveAllAttendance();
                        if (res && res.success === false) {
                          setActionFeedback(`⚠️ Semua absensi disetujui lokal. Info sync: ${res.message || 'Cek koneksi'}`);
                        } else {
                          setActionFeedback(`✅ Semua ${count} absensi berhasil disetujui (Status Hadir) & disinkronkan ke Google Sheets!`);
                        }
                      } catch {
                        setActionFeedback(`✅ Semua ${count} absensi berhasil disetujui (Status Hadir)!`);
                      }
                      setTimeout(() => setActionFeedback(null), 5000);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>Setujui Semua ({pendingAttendanceList.length})</span>
                  </button>
                </div>
              )}

              {/* Attendance approvals */}
              {pendingAttendanceList.map(att => (
                <div
                  key={att.id}
                  className="bg-white border border-amber-200 rounded-2xl p-4 shadow-xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                        {att.teknisiNama.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm">{att.teknisiNama}</h4>
                          {att.serverNama && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md border border-slate-200">
                              {att.serverNama}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${
                            att.approvalType === 'Pulang Awal'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : att.approvalType === 'Terlambat & Pulang Awal'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : att.approvalType === 'Luar Radius'
                              ? 'bg-orange-100 text-orange-800 border-orange-200'
                              : att.approvalType === 'Di Luar Jam Kerja'
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}>
                            {att.approvalType === 'Pulang Awal'
                              ? 'Pulang Awal'
                              : att.approvalType === 'Terlambat & Pulang Awal'
                              ? 'Terlambat & Pulang Awal'
                              : att.approvalType || 'Perlu Approval'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">
                          Tanggal: <strong className="text-slate-800">{att.tanggal}</strong> • Masuk: <strong className="text-slate-800">{att.jamMasuk}</strong>
                          {att.jamPulang && att.jamPulang !== '-' && (
                            <> • Pulang: <strong className="text-slate-800">{att.jamPulang}</strong></>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={async () => {
                          setActionFeedback(`⏳ Menyetujui absensi ${att.teknisiNama}...`);
                          try {
                            const res: any = await onApproveAttendance(att.id, true);
                            if (res && res.success === false) {
                              setActionFeedback(`⚠️ Absensi disetujui lokal. Info sync: ${res.message || 'Cek koneksi'}`);
                            } else {
                              setActionFeedback(`✅ Absensi ${att.teknisiNama} (${att.tanggal}) berhasil disetujui! Status Hadir & disinkronkan ke Google Sheets.`);
                            }
                          } catch {
                            setActionFeedback(`✅ Absensi ${att.teknisiNama} (${att.tanggal}) disetujui! Status kini Hadir.`);
                          }
                          setTimeout(() => setActionFeedback(null), 5000);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                      >
                        <Check className="w-4 h-4" />
                        <span>Setujui</span>
                      </button>

                      <button
                        onClick={async () => {
                          setActionFeedback(`⏳ Memproses penolakan absensi ${att.teknisiNama}...`);
                          try {
                            await onApproveAttendance(att.id, false);
                            setActionFeedback(`ℹ️ Absensi ${att.teknisiNama} (${att.tanggal}) ditolak dan disinkronkan.`);
                          } catch {
                            setActionFeedback(`ℹ️ Absensi ${att.teknisiNama} (${att.tanggal}) ditolak.`);
                          }
                          setTimeout(() => setActionFeedback(null), 5000);
                        }}
                        className="px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                      >
                        <X className="w-4 h-4" />
                        <span>Tolak (Potong {formatRupiah(att.potonganOtomatis || 25000)})</span>
                      </button>

                      {onDeleteAttendance && (
                        <button
                          onClick={() => handlePromptDeleteAttendance(att.id, att.teknisiNama, att.tanggal)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-rose-200"
                          title="Hapus Data Absensi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {att.keterangan && (
                    <p className="text-xs bg-slate-50 p-2.5 rounded-xl text-slate-700 border border-slate-100">
                      <strong>Alasan / Keterangan Masuk:</strong> "{att.keterangan}"
                    </p>
                  )}

                  {att.keteranganPulang && (
                    <p className="text-xs bg-rose-50/70 p-2.5 rounded-xl text-rose-900 border border-rose-100">
                      <strong>Alasan Pulang Lebih Awal:</strong> "{att.keteranganPulang}"
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span className="flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Jarak GPS: {att.distanceMeter || 25}m dari Server</span>
                    </span>

                    <div className="flex items-center space-x-3">
                      {isValidPhotoUrl(att.fotoProofUrl) && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPhoto({ url: att.fotoProofUrl || '', title: `Foto Masuk - ${att.teknisiNama} (${att.tanggal})` })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedPhoto({ url: att.fotoProofUrl || '', title: `Foto Masuk - ${att.teknisiNama} (${att.tanggal})` });
                            }
                          }}
                          className="flex items-center space-x-1.5 p-1 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors cursor-pointer group"
                          title="Lihat Foto Selfie Masuk"
                        >
                          <div className="w-7 h-7 rounded-md overflow-hidden bg-slate-100 shrink-0">
                            <SafeImage
                              src={att.fotoProofUrl}
                              alt="Foto Masuk"
                              className="w-full h-full object-cover"
                              fallbackText="Masuk"
                              showOpenLink={false}
                            />
                          </div>
                          <span className="text-xs font-bold text-indigo-700 group-hover:underline">Foto Masuk</span>
                        </div>
                      )}
                      {isValidPhotoUrl(att.fotoPulangUrl) && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPhoto({ url: att.fotoPulangUrl || '', title: `Foto Pulang - ${att.teknisiNama} (${att.tanggal})` })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedPhoto({ url: att.fotoPulangUrl || '', title: `Foto Pulang - ${att.teknisiNama} (${att.tanggal})` });
                            }
                          }}
                          className="flex items-center space-x-1.5 p-1 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition-colors cursor-pointer group"
                          title="Lihat Foto Selfie Pulang"
                        >
                          <div className="w-7 h-7 rounded-md overflow-hidden bg-slate-100 shrink-0">
                            <SafeImage
                              src={att.fotoPulangUrl}
                              alt="Foto Pulang"
                              className="w-full h-full object-cover"
                              fallbackText="Pulang"
                              showOpenLink={false}
                            />
                          </div>
                          <span className="text-xs font-bold text-emerald-700 group-hover:underline">Foto Pulang</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Leave approvals */}
              {pendingLeaveList.map(leave => (
                <div
                  key={leave.id}
                  className="bg-white border border-indigo-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold text-[10px] rounded-md">
                      {leave.jenis}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">{leave.teknisiNama}</h4>
                    <p className="text-xs text-slate-600">"{leave.alasan}"</p>
                    <p className="text-[11px] text-slate-400">Tanggal: {leave.tanggal}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        onApproveLeave(leave.id, true);
                        setActionFeedback(`✅ Pengajuan ${leave.jenis} untuk ${leave.teknisiNama} (${leave.tanggal}) disetujui!`);
                        setTimeout(() => setActionFeedback(null), 4000);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 flex items-center space-x-1 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Setujui</span>
                    </button>
                    <button
                      onClick={() => {
                        onApproveLeave(leave.id, false);
                        setActionFeedback(`ℹ️ Pengajuan ${leave.jenis} untuk ${leave.teknisiNama} (${leave.tanggal}) ditolak.`);
                        setTimeout(() => setActionFeedback(null), 4000);
                      }}
                      className="px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 flex items-center space-x-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      <span>Tolak</span>
                    </button>
                    {onDeleteLeave && (
                      <button
                        onClick={() => handlePromptDeleteLeave(leave.id, leave.teknisiNama, leave.jenis, leave.tanggal)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-rose-200"
                        title="Hapus Pengajuan Izin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ABSEN HARIAN LOG */}
      {activeTab === 'absen_harian' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Riwayat Absen Harian Teknisi</h3>
              <p className="text-[11px] text-slate-500">Absen masuk & pulang tercatat terpisah dan rapi tanpa tumpang tindih</p>
            </div>
            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari teknisi / tanggal..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          {/* TAB 2 Content: Mobile Cards & Desktop Table */}
          {cleanAttendanceList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Belum ada data absensi harian.
            </div>
          ) : (
            <div>
              {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
              <div className="block md:hidden divide-y divide-slate-100">
                {cleanAttendanceList
                  .filter(a =>
                    a.teknisiNama.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    a.tanggal.includes(searchTerm) ||
                    (a.serverNama && a.serverNama.toLowerCase().includes(searchTerm.toLowerCase()))
                  )
                  .map(att => (
                    <div key={att.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                      {/* Top Header: Date & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{att.tanggal}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            att.status === 'Hadir'
                              ? 'bg-emerald-100 text-emerald-800'
                              : att.status === 'Terlambat' || att.status === 'Pending Approval'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {att.status}
                        </span>
                      </div>

                      {/* Technician & Server / Radius */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-slate-900 text-sm">{att.teknisiNama}</p>
                          <div className="flex items-center space-x-1.5 text-slate-500 text-xs mt-0.5">
                            <Server className="w-3 h-3 text-slate-400" />
                            <span className="font-semibold text-slate-700">{getServerDisplayName(att.serverNama, att.serverId)}</span>
                            {att.isWithinRadius ? (
                              <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                OK ({att.distanceMeter || 15}m)
                              </span>
                            ) : (
                              <span className="text-rose-700 font-bold text-[10px] bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                Luar Radius ({att.distanceMeter || 0}m)
                              </span>
                            )}
                          </div>
                        </div>

                        {onDeleteAttendance && (
                          <button
                            onClick={() => handlePromptDeleteAttendance(att.id, att.teknisiNama, att.tanggal)}
                            className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Hapus Data Absen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Check-In / Check-Out Grid */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 text-xs">
                        {/* Masuk */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Jam Masuk</span>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md font-mono text-xs">
                              {att.jamMasuk || '08:00'}
                            </span>
                            {isValidPhotoUrl(att.fotoProofUrl) && (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedPhoto({ url: att.fotoProofUrl || '', title: `Foto Selfie Masuk - ${att.teknisiNama} (${att.tanggal} ${att.jamMasuk})` })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    setSelectedPhoto({ url: att.fotoProofUrl || '', title: `Foto Selfie Masuk - ${att.teknisiNama} (${att.tanggal} ${att.jamMasuk})` });
                                  }
                                }}
                                className="w-7 h-7 rounded-lg overflow-hidden border border-indigo-200 hover:border-indigo-500 cursor-pointer shrink-0 shadow-2xs"
                                title="Lihat Foto Masuk"
                              >
                                <SafeImage
                                  src={att.fotoProofUrl}
                                  alt="Selfie Masuk"
                                  className="w-full h-full object-cover"
                                  fallbackText="Masuk"
                                  showOpenLink={false}
                                  isThumbnail={true}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Pulang */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">Jam Pulang</span>
                          {att.jamPulang && att.jamPulang !== '-' ? (
                            <div className="flex items-center space-x-1.5">
                              <span className="font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-mono text-xs">
                                {att.jamPulang}
                              </span>
                              {isValidPhotoUrl(att.fotoPulangUrl) && (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedPhoto({ url: att.fotoPulangUrl || '', title: `Foto Selfie Pulang - ${att.teknisiNama} (${att.tanggal} ${att.jamPulang})` })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      setSelectedPhoto({ url: att.fotoPulangUrl || '', title: `Foto Selfie Pulang - ${att.teknisiNama} (${att.tanggal} ${att.jamPulang})` });
                                    }
                                  }}
                                  className="w-7 h-7 rounded-lg overflow-hidden border border-emerald-200 hover:border-emerald-500 cursor-pointer shrink-0 shadow-2xs"
                                  title="Lihat Foto Pulang"
                                >
                                  <SafeImage
                                    src={att.fotoPulangUrl}
                                    alt="Selfie Pulang"
                                    className="w-full h-full object-cover"
                                    fallbackText="Pulang"
                                    showOpenLink={false}
                                    isThumbnail={true}
                                  />
                                </div>
                              )}
                              {onUpdateAttendance && (
                                <button
                                  onClick={() => setEditingPresensiRecord(att)}
                                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                  title="Edit Jam Pulang"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                Belum
                              </span>
                              {onUpdateAttendance && (
                                <button
                                  onClick={() => setEditingPresensiRecord(att)}
                                  className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-0.5"
                                  title="Input Jam Pulang"
                                >
                                  <Clock className="w-3 h-3" />
                                  <span>Set</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Tanggal</th>
                      <th className="p-3.5">Teknisi</th>
                      <th className="p-3.5">Jam Masuk (In)</th>
                      <th className="p-3.5">Jam Pulang (Out)</th>
                      <th className="p-3.5">Server / Radius</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Aksi Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {cleanAttendanceList
                      .filter(a =>
                        a.teknisiNama.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        a.tanggal.includes(searchTerm) ||
                        (a.serverNama && a.serverNama.toLowerCase().includes(searchTerm.toLowerCase()))
                      )
                      .map(att => (
                        <tr key={att.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 font-mono font-semibold text-slate-800">{att.tanggal}</td>
                          <td className="p-3.5 font-bold text-slate-900">{att.teknisiNama}</td>
                          
                          {/* JAM MASUK + FOTO */}
                          <td className="p-3.5">
                            <div className="flex items-center space-x-2">
                              <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                                {att.jamMasuk || '08:00'}
                              </span>
                              {isValidPhotoUrl(att.fotoProofUrl) && (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedPhoto({ url: att.fotoProofUrl || '', title: `Foto Selfie Masuk - ${att.teknisiNama} (${att.tanggal} ${att.jamMasuk})` })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      setSelectedPhoto({ url: att.fotoProofUrl || '', title: `Foto Selfie Masuk - ${att.teknisiNama} (${att.tanggal} ${att.jamMasuk})` });
                                    }
                                  }}
                                  className="w-7 h-7 rounded-lg overflow-hidden border border-indigo-200 hover:border-indigo-500 transition-all cursor-pointer shrink-0 shadow-2xs hover:scale-105"
                                  title="Klik untuk Pratinjau Foto Selfie Masuk"
                                >
                                  <SafeImage
                                    src={att.fotoProofUrl}
                                    alt="Selfie Masuk"
                                    className="w-full h-full object-cover"
                                    fallbackText="Masuk"
                                    showOpenLink={false}
                                    isThumbnail={true}
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* JAM PULANG + FOTO */}
                          <td className="p-3.5">
                            {att.jamPulang && att.jamPulang !== '-' ? (
                              <div className="flex items-center space-x-2">
                                <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-mono">
                                  {att.jamPulang}
                                </span>
                                {isValidPhotoUrl(att.fotoPulangUrl) && (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedPhoto({ url: att.fotoPulangUrl || '', title: `Foto Selfie Pulang - ${att.teknisiNama} (${att.tanggal} ${att.jamPulang})` })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        setSelectedPhoto({ url: att.fotoPulangUrl || '', title: `Foto Selfie Pulang - ${att.teknisiNama} (${att.tanggal} ${att.jamPulang})` });
                                      }
                                    }}
                                    className="w-7 h-7 rounded-lg overflow-hidden border border-emerald-200 hover:border-emerald-500 transition-all cursor-pointer shrink-0 shadow-2xs hover:scale-105"
                                    title="Klik untuk Pratinjau Foto Selfie Pulang"
                                  >
                                    <SafeImage
                                      src={att.fotoPulangUrl}
                                      alt="Selfie Pulang"
                                      className="w-full h-full object-cover"
                                      fallbackText="Pulang"
                                      showOpenLink={false}
                                      isThumbnail={true}
                                    />
                                  </div>
                                )}
                                {onUpdateAttendance && (
                                  <button
                                    onClick={() => setEditingPresensiRecord(att)}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                    title="Edit Jam Pulang"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  Belum Pulang
                                </span>
                                {onUpdateAttendance && (
                                  <button
                                    onClick={() => setEditingPresensiRecord(att)}
                                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-all"
                                    title="Input Jam Pulang Teknisi"
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>Set Pulang</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* SERVER & RADIUS */}
                          <td className="p-3.5 text-slate-600">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-900">{getServerDisplayName(att.serverNama, att.serverId)}</p>
                              {att.isWithinRadius ? (
                                <span className="text-emerald-600 font-bold text-[10px] flex items-center space-x-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  <span>Radius OK ({att.distanceMeter || 15}m)</span>
                                </span>
                              ) : (
                                <span className="text-rose-600 font-bold text-[10px] flex items-center space-x-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                  <span>Luar Radius ({att.distanceMeter || 0}m)</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* STATUS */}
                          <td className="p-3.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                                att.status === 'Hadir'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : att.status === 'Terlambat' || att.status === 'Pending Approval'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {att.status}
                            </span>
                          </td>

                          {/* AKSI */}
                          <td className="p-3.5 text-right">
                            {onDeleteAttendance && (
                              <button
                                onClick={() => handlePromptDeleteAttendance(att.id, att.teknisiNama, att.tanggal)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="Hapus Data Absen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: IZIN & CUTI */}
      {activeTab === 'izin_cuti' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm">Pengajuan Izin & Cuti</h3>
          </div>

          <div className="divide-y divide-slate-100">
            {leaveRequests.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada pengajuan izin & cuti.
              </div>
            ) : (
              leaveRequests.map(leave => (
                <div key={leave.id} className="p-4 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{leave.teknisiNama}</span>
                    <span className="ml-2 text-indigo-600 font-semibold">({leave.jenis})</span>
                    <p className="text-slate-600 mt-0.5">"{leave.alasan}"</p>
                    <p className="text-[10px] text-slate-400 mt-1">Tanggal: {leave.tanggal}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-3 py-1 rounded-full font-bold text-[10px] ${
                        leave.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : leave.status === 'Rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {leave.status === 'Approved'
                        ? (leave.jenis === 'Cuti' ? 'Disetujui Otomatis' : 'Disetujui')
                        : leave.status === 'Rejected'
                        ? 'Ditolak'
                        : 'Pending Approval'}
                    </span>

                    {onDeleteLeave && (
                      <button
                        onClick={() => handlePromptDeleteLeave(leave.id, leave.teknisiNama, leave.jenis, leave.tanggal)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Hapus Pengajuan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SEMUA DATA HISTORI */}
      {activeTab === 'semua_data' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm mb-1">Semua Rekapitulasi Absensi & Kehadiran</h3>
            <p className="text-xs text-slate-500 mb-4">
              Rekap lengkap mencatat Jam Masuk, Jam Pulang, Lokasi Server, Bukti Foto, serta Potongan Kehadiran.
            </p>

          {/* TAB 4 Content: Mobile Cards & Desktop Table */}
          {cleanAttendanceList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Belum ada riwayat absensi tersimpan.
            </div>
          ) : (
            <div>
              {/* TAMPILAN SMARTPHONE: RESPONSIVE CARDS */}
              <div className="block md:hidden divide-y divide-slate-100">
                {cleanAttendanceList.map(a => (
                  <div key={a.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                    {/* Top Header: Date & Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 font-sans" />
                        <span>{a.tanggal}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800">
                        {a.status}
                      </span>
                    </div>

                    {/* Technician & Server */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-extrabold text-slate-900 text-sm">{a.teknisiNama}</p>
                        <div className="flex items-center space-x-1.5 text-slate-500 text-xs mt-0.5">
                          <Server className="w-3 h-3 text-slate-400" />
                          <span className="font-semibold text-slate-700">{getServerDisplayName(a.serverNama, a.serverId)}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {onUpdateAttendance && (
                          <button
                            onClick={() => setEditingPresensiRecord(a)}
                            className="p-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                            title="Edit / Set Jam Pulang"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {onDeleteAttendance && (
                          <button
                            onClick={() => handlePromptDeleteAttendance(a.id, a.teknisiNama, a.tanggal)}
                            className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Data Absensi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Time & Potongan Info */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50/90 p-2.5 rounded-xl border border-slate-100 text-xs text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Masuk</span>
                        <span className="font-extrabold text-indigo-700 font-mono text-xs">{a.jamMasuk || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Pulang</span>
                        <span className="font-extrabold text-emerald-700 font-mono text-xs">{a.jamPulang || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Potongan</span>
                        <span className="font-extrabold text-rose-600 text-xs">
                          {a.potonganOtomatis ? formatRupiah(a.potonganOtomatis) : 'Rp 0'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* TAMPILAN DESKTOP: TABEL LENGKAP */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Teknisi</th>
                      <th className="p-3">Jam Masuk</th>
                      <th className="p-3">Jam Pulang</th>
                      <th className="p-3">Server</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Potongan</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {cleanAttendanceList.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono">{a.tanggal}</td>
                        <td className="p-3 font-bold text-slate-900">{a.teknisiNama}</td>
                        <td className="p-3 font-bold text-indigo-700">{a.jamMasuk || '-'}</td>
                        <td className="p-3 font-bold text-emerald-700">{a.jamPulang || '-'}</td>
                        <td className="p-3 font-bold text-slate-700">{getServerDisplayName(a.serverNama, a.serverId)}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                            {a.status}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-rose-600">
                          {a.potonganOtomatis ? formatRupiah(a.potonganOtomatis) : 'Rp 0'}
                        </td>
                        <td className="p-3 text-right flex items-center justify-end gap-1">
                          {onUpdateAttendance && (
                            <button
                              onClick={() => setEditingPresensiRecord(a)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit / Set Jam Pulang"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {onDeleteAttendance && (
                            <button
                              onClick={() => handlePromptDeleteAttendance(a.id, a.teknisiNama, a.tanggal)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Hapus Data Absensi"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
        </div>
      )}



      {/* PHOTO MODAL */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white p-3 rounded-2xl max-w-md w-full relative shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <h4 className="font-extrabold text-xs text-slate-900 truncate">
                {selectedPhoto.title}
              </h4>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SafeImage
              src={selectedPhoto.url}
              alt={selectedPhoto.title}
              className="w-full h-auto max-h-[70vh] rounded-xl object-contain bg-slate-950"
              fallbackText={selectedPhoto.title}
              showOpenLink={true}
            />
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-slate-500">
                Bukti Foto Kamera Lapangan
              </p>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Presensi & Jam Pulang Modal */}
      {editingPresensiRecord && (
        <EditPresensiModal
          isOpen={!!editingPresensiRecord}
          record={editingPresensiRecord}
          onClose={() => setEditingPresensiRecord(null)}
          onSave={async (rec) => {
            if (onUpdateAttendance) {
              await onUpdateAttendance(rec);
              setActionFeedback(`Presensi ${rec.teknisiNama} (${rec.tanggal}) berhasil diperbarui! Jam Pulang: ${rec.jamPulang}`);
              setTimeout(() => setActionFeedback(null), 4000);
            }
            setEditingPresensiRecord(null);
          }}
        />
      )}
    </div>
  );
};

export const ApprovalAbsensiView: React.FC<ApprovalAbsensiViewProps> = React.memo(ApprovalAbsensiViewComponent);
