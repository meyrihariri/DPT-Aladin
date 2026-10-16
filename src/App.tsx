/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StorageService, consolidateAttendanceRecords, getNormalizedTechKey, sortJenisPekerjaan, pickBestPhotoUrl } from './services/storage';
import {
  Employee,
  ServerData,
  WilayahPekerjaan,
  JenisPekerjaan,
  JobRecord,
  PlanningTask,
  AttendanceRecord,
  LeaveRequest,
  AbsensiStatus,
  AppSettings,
  PotonganManual,
  AdminNotificationEvent,
  HonorLunasRecord
} from './types';
import { Header } from './components/Header';
import { Sidebar, NavView } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { LoginModal } from './components/LoginModal';
import { DashboardView } from './views/DashboardView';
import { MasterDataView } from './views/MasterDataView';
import { MasterPekerjaanView } from './views/MasterPekerjaanView';
import { ApprovalAbsensiView } from './views/ApprovalAbsensiView';
import { AbsenManualView } from './views/AbsenManualView';
import { HitungRekapHonorView } from './views/HitungRekapHonorView';
import { PotonganManualView } from './views/PotonganManualView';
import { PengaturanView } from './views/PengaturanView';
import { TeknisiDashboardView } from './views/TeknisiDashboardView';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { NumericInput } from './components/NumericInput';
import { calculatePayrollForEmployee } from './services/payroll';
import {
  buildGoogleSheetsSyncPayload,
  sendToGoogleAppsScript,
  fetchFullDatabaseFromGoogleSheets,
  parseParsedSheetsToState,
  sanitizeDateString,
  sanitizeTimeString,
  evaluateAttendanceApproval,
  invalidateClientDatabaseCache,
  isHolidayDate,
  sendLemburStatusToSheets,
  uploadPhotoToGoogleDrive,
  getEffectiveTodayISO
} from './services/googleSheetsHelper';
import { isDeviceOnline, checkNetworkHealth } from './utils/networkCheck';
import { updateDynamicAppIdentity } from './utils/dynamicIcon';
import { JobModal } from './components/JobModal';
import { PhotoCacheService } from './services/photoCache';
import { AppDialog } from './components/AppDialog';
import { showAppAlert, showAppConfirm } from './utils/dialogService';
import { Plus, X } from 'lucide-react';
import { NotificationService } from './services/notificationService';
import { AdminNotificationToast } from './components/AdminNotificationToast';
import { MaroonLoadingOverlay } from './components/MaroonLoadingOverlay';

// Helper label untuk judul loading menu
const getViewMenuLabel = (view: NavView): string => {
  switch (view) {
    case 'master_server':
      return 'Data Server';
    case 'master_wilayah':
      return 'Data Wilayah';
    case 'master_jenis_pekerjaan':
      return 'Data Jenis Pekerjaan';
    case 'master_karyawan':
      return 'Data Karyawan';
    case 'pekerjaan_daftar':
      return 'Daftar Pekerjaan';
    case 'pekerjaan_planning':
      return 'Planning Pekerjaan';
    case 'approval_absensi':
    case 'approval_perlu':
    case 'approval_harian':
    case 'approval_izin':
    case 'approval_histori':
      return 'Approval & Absensi';
    case 'rekap_honor':
    case 'potongan_manual':
      return 'Rekap Honor';
    case 'absen_manual':
    case 'absen_manual_form':
    case 'absen_manual_pekerjaan':
    case 'absen_manual_riwayat':
      return 'Absensi Manual';
    case 'pengaturan':
    case 'pengaturan_profil':
    case 'pengaturan_jam_kerja':
    case 'pengaturan_notifikasi':
    case 'pengaturan_google_sheets':
    case 'pengaturan_panduan_sheets':
      return 'Pengaturan';
    case 'teknisi_dashboard':
      return 'Dashboard Teknisi';
    case 'dashboard':
    default:
      return 'Dashboard';
  }
};

export default function App() {
  // Persistence Data States
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => StorageService.getCurrentUser());
  const [employees, setEmployees] = useState<Employee[]>(() => StorageService.getEmployees());
  const [servers, setServers] = useState<ServerData[]>(() => StorageService.getServers());
  const [wilayahList, setWilayahList] = useState<WilayahPekerjaan[]>(() => StorageService.getWilayah());
  const [jenisList, setJenisList] = useState<JenisPekerjaan[]>(() => StorageService.getJenisPekerjaan());
  const [jobs, setJobs] = useState<JobRecord[]>(() => StorageService.getJobs());
  const [planningTasks, setPlanningTasks] = useState<PlanningTask[]>(() => StorageService.getPlanning());
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>(() => StorageService.getAttendance());
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => StorageService.getLeave());
  const [potonganManualList, setPotonganManualList] = useState<PotonganManual[]>(() => StorageService.getPotonganManual());
  const [honorLunasList, setHonorLunasList] = useState<HonorLunasRecord[]>(() => StorageService.getHonorLunas());
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());

  // UI Navigation States
  const [activeView, setActiveView] = useState<NavView>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('dpt_aladin_active_view') as NavView | null;
        if (saved && currentUser) {
          if (currentUser.role === 'Teknisi') {
            const allowed: NavView[] = ['teknisi_dashboard', 'dashboard', 'pekerjaan_planning', 'approval_absensi', 'rekap_honor', 'pekerjaan_daftar'];
            if (allowed.includes(saved)) return saved;
            return 'teknisi_dashboard';
          }
          return saved;
        }
      } catch {}
    }
    return currentUser?.role === 'Teknisi' ? 'teknisi_dashboard' : 'dashboard';
  });

  const [isBootstrapLoaded, setIsBootstrapLoaded] = useState(false);

  // Maroon theme loading overlay state for startup and menu navigation
  const [loadingOverlay, setLoadingOverlay] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: true,
    title: 'Please Wait...',
    message: 'Mengambil data dari Google Sheets...'
  });

  const handlePullDatabaseRef = useRef<((urlOverride?: string, silent?: boolean, customMessage?: string, forceRefresh?: boolean) => Promise<boolean>) | null>(null);
  const lastPulledViewRef = useRef<{ [view: string]: number }>({});

  // Optimized view switching with on-demand Google Sheets fetch and maroon loading spinner
  const handleSelectView = useCallback((view: NavView) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('dpt_aladin_active_view', view);
      } catch {}
    }
    setActiveView(view);

    // Ambil data terbaru Google Sheets saat membuka menu dengan tanda loading spinner maroon
    const activeUrl = settings.googleAppsScriptUrl?.trim();
    if (activeUrl && handlePullDatabaseRef.current) {
      const now = Date.now();
      const lastPull = lastPulledViewRef.current[view] || 0;
      // Beri batas minimal 2.5 detik jika mengklik menu yang sama agar tidak spam network
      if (now - lastPull > 2500) {
        lastPulledViewRef.current[view] = now;
        const menuLabel = getViewMenuLabel(view);
        handlePullDatabaseRef.current(
          activeUrl,
          true,
          `Mengambil data ${menuLabel} dari Google Sheets...`
        ).catch(err => {
          console.warn(`Gagal menarik data untuk menu ${view}:`, err);
        });
      }
    }
  }, [settings.googleAppsScriptUrl]);

  // Point 2: Pada tampilan desktop navigasi sidebar selalu tampil (default open),
  // pada smartphone default tertutup (harus klik tombol icon menu garis 3 untuk menampilkan).
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [isQuickJobModalOpen, setIsQuickJobModalOpen] = useState(() => {
    return StorageService.getQuickJobModalOpen();
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Keep modal open state persisted across mobile camera switches & refreshes
  useEffect(() => {
    StorageService.saveQuickJobModalOpen(isQuickJobModalOpen);
  }, [isQuickJobModalOpen]);

  // Sync state changes to storage
  useEffect(() => { StorageService.saveEmployees(employees); }, [employees]);
  useEffect(() => { StorageService.saveServers(servers); }, [servers]);
  useEffect(() => { StorageService.saveWilayah(wilayahList); }, [wilayahList]);
  useEffect(() => { StorageService.saveJenisPekerjaan(jenisList); }, [jenisList]);
  useEffect(() => { StorageService.saveJobs(jobs); }, [jobs]);
  useEffect(() => { StorageService.savePlanning(planningTasks); }, [planningTasks]);
  useEffect(() => { StorageService.saveAttendance(attendanceList); }, [attendanceList]);
  useEffect(() => { StorageService.saveLeave(leaveRequests); }, [leaveRequests]);
  useEffect(() => { StorageService.savePotonganManual(potonganManualList); }, [potonganManualList]);
  useEffect(() => { StorageService.saveHonorLunas(honorLunasList); }, [honorLunasList]);
  useEffect(() => { StorageService.saveSettings(settings); }, [settings]);
  useEffect(() => {
    if (currentUser) {
      StorageService.saveCurrentUser(currentUser);
    }
  }, [currentUser]);

  // Update dynamic favicon & document title & PWA icon references when settings change
  useEffect(() => {
    updateDynamicAppIdentity(settings);
  }, [settings.logoUrl, settings.namaPerusahaan]);

  // Realtime online technicians and all users tracking from presence heartbeat
  const [onlineTechniciansFromHeartbeat, setOnlineTechniciansFromHeartbeat] = useState<
    Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>
  >([]);
  const [onlineUsersFromHeartbeat, setOnlineUsersFromHeartbeat] = useState<
    Array<{ id: string; namaLengkap: string; role: string; serverId?: string; namaServer?: string }>
  >([]);

  // Handle Logout with optional reason notice
  const handleLogout = useCallback((reasonNotice?: string) => {
    if (currentUser?.id) {
      StorageService.sendPresenceLeave(currentUser.id);
    }
    setCurrentUser(null);
    StorageService.saveCurrentUser(null);
    setIsSidebarOpen(false);
    if (reasonNotice) {
      showAppAlert({
        title: 'Sesi Login Berakhir',
        message: reasonNotice,
        type: 'warning'
      });
    }
  }, [currentUser]);

  // REQ 5: Automatic Logout if username or password is changed or deleted
  // "Dalam kondisi apapun, jika username dan sandi login diubah atau dihapus, maka karyawan/teknisi otomatis logout dari aplikasi."
  useEffect(() => {
    if (!currentUser) return;

    // DO NOT validate until server bootstrap has completed to avoid false-positive logouts on refresh/reload
    if (!isBootstrapLoaded) return;

    // If employees list is empty or only has the fallback default admin, data is not fully loaded yet
    if (employees.length <= 1 && currentUser.id !== 'emp-admin' && currentUser.role !== 'Admin') {
      return;
    }

    // 1. Case: Fallback Administrator account
    if (currentUser.id === 'emp-admin' || currentUser.role === 'Admin') {
      const adminInEmployees = employees.find(e => e.id === 'emp-admin' || e.role === 'Admin');
      const adminUser = adminInEmployees?.username || settings.adminUsername;
      const adminPass = adminInEmployees?.password || settings.adminPassword;

      const currentPass = String(currentUser.password || '').trim();
      const freshPass = String(adminPass || '').trim();
      const currentUserTrim = (currentUser.username || '').trim().toLowerCase();
      const freshUserTrim = (adminUser || '').trim().toLowerCase();

      // Only logout if username or password was explicitly changed and both values are non-empty
      const userChanged = Boolean(currentUserTrim && freshUserTrim && freshUserTrim !== currentUserTrim);
      const passChanged = Boolean(currentPass && freshPass && currentPass !== freshPass);

      if (userChanged || passChanged) {
        handleLogout('Username atau kata sandi login Administrator telah diubah. Anda otomatis dikeluarkan dari aplikasi.');
      }
      return;
    }

    // 2. Case: Regular Employee / Technician
    // Robust lookup by id, username, or namaLengkap
    const matched = employees.find(e =>
      (e.id && currentUser.id && String(e.id).trim().toLowerCase() === String(currentUser.id).trim().toLowerCase()) ||
      (e.username && currentUser.username && String(e.username).trim().toLowerCase() === String(currentUser.username).trim().toLowerCase()) ||
      (e.namaLengkap && currentUser.namaLengkap && String(e.namaLengkap).trim().toLowerCase() === String(currentUser.namaLengkap).trim().toLowerCase())
    );

    // If account was deleted from employee list (only if employees is fully populated and confirmed from Google Sheets)
    if (!matched && employees.length > 1 && isDataLoadedFromSheetsRef.current) {
      handleLogout('Akun login Anda telah dihapus oleh Administrator. Anda otomatis dikeluarkan dari aplikasi.');
      return;
    }

    if (matched) {
      // If username or password was modified (only check if both are non-empty strings)
      const currentUsername = (currentUser.username || '').trim().toLowerCase();
      const freshUsername = (matched.username || '').trim().toLowerCase();
      const currentPassword = String(currentUser.password || '').trim();
      const freshPassword = String(matched.password || '').trim();

      const usernameChanged = Boolean(currentUsername && freshUsername && freshUsername !== currentUsername);
      const passwordChanged = Boolean(
        currentPassword &&
        freshPassword &&
        currentPassword.length >= 3 &&
        freshPassword.length >= 3 &&
        currentPassword !== freshPassword
      );

      if (usernameChanged || passwordChanged) {
        handleLogout('Username atau kata sandi login Anda telah diubah oleh Administrator. Anda otomatis dikeluarkan dari aplikasi. Silakan login kembali dengan data baru.');
        return;
      }
    }
  }, [employees, settings.adminUsername, settings.adminPassword, currentUser, handleLogout, isBootstrapLoaded]);

  // Cross-tab synchronization: catch employee/credential edits from other tabs instantly
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dpt_aladin_employees_v1' && e.newValue) {
        try {
          const fresh = JSON.parse(e.newValue);
          if (Array.isArray(fresh)) {
            setEmployees(fresh);
          }
        } catch {}
      }
      if (e.key === 'dpt_aladin_settings_v1' && e.newValue) {
        try {
          const fresh = JSON.parse(e.newValue);
          if (fresh) {
            setSettings(fresh);
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Fast equality helper to avoid expensive JSON.stringify on low-end mobile devices
  const isDataDifferent = (incoming: any, current: any): boolean => {
    if (incoming === current) return false;
    if (!incoming && !current) return false;
    if (!incoming || !current) return true;
    if (Array.isArray(incoming) && Array.isArray(current)) {
      if (incoming.length !== current.length) return true;
      if (incoming.length === 0) return false;

      const currentMap = new Map<string, any>();
      for (let i = 0; i < current.length; i++) {
        const item = current[i];
        if (item && item.id) {
          currentMap.set(item.id, item);
        }
      }

      // If items don't have unique ids, fall back to index comparison
      if (currentMap.size !== current.length) {
        for (let i = 0; i < incoming.length; i++) {
          const a = incoming[i];
          const b = current[i];
          if (!a || !b) return true;
          if (a.id !== b.id || a.updatedAt !== b.updatedAt || a.status !== b.status || a.lemburApproved !== b.lemburApproved) return true;
        }
        return false;
      }

      // Fast order-independent ID-based equality check
      for (let i = 0; i < incoming.length; i++) {
        const a = incoming[i];
        if (!a || !a.id) return true;
        const b = currentMap.get(a.id);
        if (!b) return true;
        if (a.updatedAt !== b.updatedAt) return true;
        if (a.status !== b.status) return true;
        if (a.lemburApproved !== b.lemburApproved) return true;
        if (a.jamMasuk !== b.jamMasuk) return true;
        if (a.jamPulang !== b.jamPulang) return true;
        if (a.isApproved !== b.isApproved) return true;
        if (a.needsApproval !== b.needsApproval) return true;
      }
      return false;
    }
    return false;
  };

  // Periodic background check against server state to sync changes made on other devices (PC Admin, HP Teknisi, Tablet)
  useEffect(() => {
    let isMounted = true;

    const syncCrossDeviceState = async () => {
      // Skip background sync if page is hidden to save battery & CPU
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        const bootstrap = await StorageService.fetchServerBootstrap();
        if (!bootstrap || !isMounted) return;

        // 1. Sync resolved keys & deleted IDs from server so all devices share approvals
        if (bootstrap.resolvedAttendanceKeys && Array.isArray(bootstrap.resolvedAttendanceKeys)) {
          StorageService.addResolvedAttendanceKeys(bootstrap.resolvedAttendanceKeys);
        }
        if (bootstrap.deletedAttendanceIds && Array.isArray(bootstrap.deletedAttendanceIds)) {
          StorageService.setDeletedAttendanceIds(bootstrap.deletedAttendanceIds);
        }
        if (bootstrap.approvedLemburMap && typeof bootstrap.approvedLemburMap === 'object') {
          StorageService.setApprovedLemburMap(bootstrap.approvedLemburMap);
        }

        // 2. Sync employees only if changed
        if (bootstrap.employees && Array.isArray(bootstrap.employees) && bootstrap.employees.length > 0) {
          setEmployees(prev => {
            if (isDataDifferent(bootstrap.employees, prev)) {
              return bootstrap.employees;
            }
            return prev;
          });
        }

        // 3. Sync servers, wilayah, jenis pekerjaan only if changed
        if (bootstrap.servers && Array.isArray(bootstrap.servers) && bootstrap.servers.length > 0) {
          setServers(prev => {
            if (isDataDifferent(bootstrap.servers, prev)) {
              return bootstrap.servers;
            }
            return prev;
          });
        }
        if (bootstrap.wilayah && Array.isArray(bootstrap.wilayah) && bootstrap.wilayah.length > 0) {
          setWilayahList(prev => {
            if (isDataDifferent(bootstrap.wilayah, prev)) {
              return bootstrap.wilayah;
            }
            return prev;
          });
        }
        if (bootstrap.jenisList && Array.isArray(bootstrap.jenisList) && bootstrap.jenisList.length > 0) {
          setJenisList(prev => {
            if (isDataDifferent(bootstrap.jenisList, prev)) {
              return sortJenisPekerjaan(bootstrap.jenisList);
            }
            return prev;
          });
        }

        // 4. Sync attendance list & approvals in real-time only if changed
        if (bootstrap.attendanceList && Array.isArray(bootstrap.attendanceList) && bootstrap.attendanceList.length > 0) {
          setAttendanceList(prev => {
            const merged = consolidateAttendanceRecords([...prev, ...bootstrap.attendanceList]);
            if (isDataDifferent(merged, prev)) {
              return merged;
            }
            return prev;
          });
        }

        // 5. Sync jobs list in real-time only if changed
        if (bootstrap.jobs && Array.isArray(bootstrap.jobs) && bootstrap.jobs.length > 0) {
          const cleanJobs = bootstrap.jobs.filter((j: any) =>
            !['job-1', 'job-2', 'job-3', 'job-demo-1', 'job-demo-2'].includes(j.id)
          );
          setJobs(prev => {
            // Protection: Jangan pernah menimpa data Google Sheet dengan cache server yang lebih sedikit atau kadaluarsa
            if (settings.isGoogleSheetConnected || settings.googleAppsScriptUrl?.trim() || isDataLoadedFromSheetsRef.current) {
              if (cleanJobs.length < prev.length) {
                return prev;
              }
            }
            if (isDataDifferent(cleanJobs, prev)) {
              return cleanJobs;
            }
            return prev;
          });
        }

        // 6. Sync planning tasks only if changed
        if (bootstrap.planningTasks && Array.isArray(bootstrap.planningTasks) && bootstrap.planningTasks.length > 0) {
          const cleanPlans = bootstrap.planningTasks.filter((p: any) =>
            !['plan-1', 'plan-2', 'plan-3', 'plan-demo-1', 'plan-demo-2'].includes(p.id) &&
            !p.detailPekerjaan?.includes('Hendra') &&
            !p.detailPekerjaan?.includes('Klender')
          );
          setPlanningTasks(prev => {
            if (settings.isGoogleSheetConnected || settings.googleAppsScriptUrl?.trim() || isDataLoadedFromSheetsRef.current) {
              if (cleanPlans.length < prev.length) {
                return prev;
              }
            }
            if (isDataDifferent(cleanPlans, prev)) {
              return cleanPlans;
            }
            return prev;
          });
        }

        // 7. Sync potongan manual (kasbon) only if changed
        if (bootstrap.potonganManualList && Array.isArray(bootstrap.potonganManualList)) {
          setPotonganManualList(prev => {
            if (isDataDifferent(bootstrap.potonganManualList, prev)) {
              return bootstrap.potonganManualList;
            }
            return prev;
          });
        }

        // 7.5. Sync honor lunas only if changed
        if (bootstrap.honorLunasList && Array.isArray(bootstrap.honorLunasList)) {
          setHonorLunasList(prev => {
            if (isDataDifferent(bootstrap.honorLunasList, prev)) {
              return bootstrap.honorLunasList;
            }
            return prev;
          });
        }

        // 8. Sync leave requests only if changed
        if (bootstrap.leaveRequests && Array.isArray(bootstrap.leaveRequests)) {
          setLeaveRequests(prev => {
            if (isDataDifferent(bootstrap.leaveRequests, prev)) {
              return bootstrap.leaveRequests;
            }
            return prev;
          });
        }
      } catch (err) {
        // Silently ignore background polling failure
      }
    };

    // Execute once on mount/user change
    syncCrossDeviceState();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Periodic presence heartbeat: sends current user activity and retrieves active online users
  useEffect(() => {
    let isMounted = true;
    const sendHeartbeat = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        if (currentUser) {
          const res = await StorageService.sendPresenceHeartbeat({
            id: currentUser.id,
            namaLengkap: currentUser.namaLengkap,
            role: currentUser.role,
            serverId: currentUser.serverId,
            namaServer: currentUser.namaServer,
            username: currentUser.username,
            password: currentUser.password
          });
          if (isMounted && res) {
            if (res.sessionInvalid) {
              handleLogout(res.reason || 'Username atau sandi login akun Anda telah diubah atau dihapus oleh Administrator.');
              return;
            }
            if (Array.isArray(res.onlineTechnicians)) {
              setOnlineTechniciansFromHeartbeat(prev => {
                const next = res.onlineTechnicians;
                if (prev.length === next.length) {
                  const prevIds = prev.map(u => u.id).sort().join(',');
                  const nextIds = next.map(u => u.id).sort().join(',');
                  if (prevIds === nextIds) return prev; // Referentially stable, avoids re-render!
                }
                return next;
              });
            }
            if (Array.isArray(res.onlineUsers)) {
              setOnlineUsersFromHeartbeat(prev => {
                const next = res.onlineUsers;
                if (prev.length === next.length) {
                  const prevIds = prev.map(u => u.id).sort().join(',');
                  const nextIds = next.map(u => u.id).sort().join(',');
                  if (prevIds === nextIds) return prev;
                }
                return next;
              });
            }
          }
        } else {
          const listRes = await StorageService.fetchActivePresences();
          if (isMounted && listRes) {
            const techList = Array.isArray(listRes) ? listRes : listRes.onlineTechnicians;
            const userList = Array.isArray(listRes) ? listRes : listRes.onlineUsers;
            if (Array.isArray(techList)) {
              setOnlineTechniciansFromHeartbeat(prev => {
                if (prev.length === techList.length) {
                  const prevIds = prev.map(u => u.id).sort().join(',');
                  const nextIds = techList.map(u => u.id).sort().join(',');
                  if (prevIds === nextIds) return prev;
                }
                return techList;
              });
            }
            if (Array.isArray(userList)) {
              setOnlineUsersFromHeartbeat(prev => {
                if (prev.length === userList.length) {
                  const prevIds = prev.map(u => u.id).sort().join(',');
                  const nextIds = userList.map(u => u.id).sort().join(',');
                  if (prevIds === nextIds) return prev;
                }
                return userList;
              });
            }
          }
        }
      } catch {
        // Silently ignore network failure
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000); // 15s interval is lightweight and well within 10min server timeout

    // Immediate heartbeat when user switches back to this tab/window
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Instant cross-tab sync via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('app_presence_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'HEARTBEAT' && event.data?.user) {
            const u = event.data.user;
            setOnlineUsersFromHeartbeat(prev => {
              const exists = prev.some(item => item.id === u.id || item.namaLengkap === u.namaLengkap);
              if (!exists) return [...prev, u];
              return prev;
            });
            if (String(u.role || '').toLowerCase().trim() === 'teknisi') {
              setOnlineTechniciansFromHeartbeat(prev => {
                const exists = prev.some(item => item.id === u.id || item.namaLengkap === u.namaLengkap);
                if (!exists) return [...prev, u];
                return prev;
              });
            }
          } else if (event.data?.type === 'EMPLOYEE_MUTATED') {
            const fresh = StorageService.getEmployees();
            if (Array.isArray(fresh)) {
              setEmployees(fresh);
            }
          }
        };
      } catch {}
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (bc) bc.close();
    };
  }, [currentUser]);

  // Real-time Admin Notifications (Technician Online, Attendance, Planning, Job Submission)
  const [adminNotificationEvents, setAdminNotificationEvents] = useState<AdminNotificationEvent[]>([]);
  const [unreadEventsCount, setUnreadEventsCount] = useState<number>(0);
  const [activeToastAlert, setActiveToastAlert] = useState<AdminNotificationEvent | null>(null);
  const lastEventTimestampRef = useRef<number>(Date.now() - 30000);
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  // Check if an event was triggered by the current user themselves
  const isSelfEvent = (evt: AdminNotificationEvent, user: Employee | null): boolean => {
    if (!user || !evt) return false;
    const currentId = String(user.id || '').trim().toLowerCase();
    const currentName = String(user.namaLengkap || '').trim().toLowerCase();
    const currentUsername = String(user.username || '').trim().toLowerCase();

    // 1. Direct ID matches
    const senderId = String(evt.data?.senderId || '').trim().toLowerCase();
    if (senderId && (senderId === currentId || senderId === currentUsername)) return true;

    const techId = String(evt.data?.teknisiId || evt.data?.technicianId || '').trim().toLowerCase();
    if (techId && (techId === currentId || techId === currentUsername)) return true;

    // 2. Multi-technician ID array (jobs)
    if (Array.isArray(evt.data?.teknisiIds)) {
      const ids = evt.data.teknisiIds.map((x: any) => String(x || '').trim().toLowerCase());
      if (ids.includes(currentId) || ids.includes(currentUsername)) return true;
    }

    // 3. Name matches
    const senderName = String(evt.data?.senderName || '').trim().toLowerCase();
    if (senderName && (senderName === currentName || senderName === currentUsername)) return true;

    const techName = String(evt.data?.teknisiNama || evt.data?.technicianName || '').trim().toLowerCase();
    if (techName && (techName === currentName || techName === currentUsername)) return true;

    // 4. In technician online events, check if body starts with user's name
    if (evt.type === 'technician_online') {
      const bodyLower = (evt.body || '').toLowerCase();
      if (currentName && bodyLower.startsWith(currentName)) return true;
      if (currentUsername && bodyLower.startsWith(currentUsername)) return true;
    }

    return false;
  };

  // Check if the event was triggered by Admin
  const isAdminEvent = (evt: AdminNotificationEvent): boolean => {
    if (!evt) return false;
    const senderRole = String(evt.data?.senderRole || '').trim().toLowerCase();
    const senderId = String(evt.data?.senderId || '').trim().toLowerCase();
    const senderName = String(evt.data?.senderName || '').trim().toLowerCase();

    if (senderRole.includes('admin') || senderId === 'emp-admin' || senderName.includes('admin')) {
      return true;
    }
    if (evt.data?.isManualByAdmin) {
      return true;
    }
    return false;
  };

  // Filter whether an event should appear in the user's notification list / unread count
  const isEventRelevantForUser = (evt: AdminNotificationEvent, user: Employee | null): boolean => {
    if (!user || !evt) return false;
    const isTech = user.role === 'Teknisi';

    // Rule 4: Technician devices should NOT receive admin login, admin jobs, or admin attendance
    if (isTech && isAdminEvent(evt)) {
      return false;
    }

    // Rule 2: User's own login or self actions should NOT appear in their own notification list
    if (isSelfEvent(evt, user)) {
      if (evt.type === 'technician_online') return false;
      if (evt.type === 'attendance_submitted' || evt.type === 'job_submitted') return false;
    }

    return true;
  };

  // Determine if a floating toast alert banner and sound should be shown to the user
  const shouldAlertUser = (evt: AdminNotificationEvent, user: Employee | null): boolean => {
    if (!user || !evt) return false;
    const isTech = user.role === 'Teknisi';

    // Rule 2: NEVER alert on self actions (e.g. technician's own login or own submission)
    if (isSelfEvent(evt, user)) {
      return false;
    }

    // Rule 4: NEVER alert technicians about admin login, admin jobs, or admin attendance
    if (isTech && isAdminEvent(evt)) {
      return false;
    }

    // Rule 3: Notifications MUST appear when another technician completes attendance or inputs a job
    // (Both admin and other technicians will pass this)
    return true;
  };

  // Polling notifications for all devices (Admin, PJ, and other Technicians)
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;

    const processIncomingEvents = (incoming: AdminNotificationEvent[]) => {
      if (!isMounted || !Array.isArray(incoming) || incoming.length === 0) return;

      const freshEvents: AdminNotificationEvent[] = [];
      incoming.forEach(evt => {
        if (!seenEventIdsRef.current.has(evt.id)) {
          seenEventIdsRef.current.add(evt.id);
          freshEvents.push(evt);
          if (evt.timestamp > lastEventTimestampRef.current) {
            lastEventTimestampRef.current = evt.timestamp;
          }
        }
      });

      if (freshEvents.length === 0) return;

      // Filter events relevant for this user's notification list
      const relevantEvents = freshEvents.filter(evt => isEventRelevantForUser(evt, currentUser));

      if (relevantEvents.length > 0) {
        setAdminNotificationEvents(prev => {
          const combined = [...relevantEvents, ...prev.filter(p => !relevantEvents.some(f => f.id === p.id))];
          return combined.slice(0, 50);
        });
        setUnreadEventsCount(prev => prev + relevantEvents.length);
      }

      // Check if any fresh event should show a toast banner and play chime
      // Rule 2: NEVER alert on self actions (e.g. technician's own login or own submission)
      // Rule 3: MUST alert when ANOTHER technician submits attendance or inputs job
      // Rule 4: NEVER alert technicians about admin login, admin jobs, or admin attendance
      const alertableEvent = freshEvents.find(evt => shouldAlertUser(evt, currentUser));

      if (alertableEvent) {
        setActiveToastAlert(alertableEvent);
        NotificationService.playChimeSound();
        NotificationService.sendSystemNotification(alertableEvent.title, {
          body: alertableEvent.body,
          tag: alertableEvent.id
        });

        // Auto dismiss toast banner after 6 seconds
        setTimeout(() => {
          setActiveToastAlert(curr => (curr?.id === alertableEvent.id ? null : curr));
        }, 6000);
      }
    };

    // Listen to local BroadcastChannel for zero-latency multi-tab updates
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('app_notification_channel');
        bc.onmessage = (msg) => {
          if (msg.data && msg.data.type) {
            processIncomingEvents([msg.data as AdminNotificationEvent]);
          }
        };
      } catch {}
    }

    const pollEvents = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (currentUser?.role === 'Teknisi') return; // Technicians do not receive admin notifications
      try {
        const events = await StorageService.pollAdminNotifications(lastEventTimestampRef.current);
        processIncomingEvents(events);
      } catch {
        // Silently skip on momentary network drop
      }
    };

    let pollTimer: any = null;
    if (currentUser?.role !== 'Teknisi') {
      pollEvents();
      pollTimer = setInterval(pollEvents, 8000);
    }
    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
      if (bc) {
        try { bc.close(); } catch {}
      }
    };
  }, [currentUser]);

  const handleNavigateFromNotification = (type: AdminNotificationEvent['type'], _data?: any) => {
    if (currentUser?.role === 'Teknisi') {
      handleSelectView('teknisi_dashboard');
      return;
    }
    if (type === 'technician_online') {
      handleSelectView('dashboard');
    } else if (type === 'attendance_submitted') {
      handleSelectView('approval_absensi');
    } else if (type === 'planning_created') {
      handleSelectView('pekerjaan_planning');
    } else if (type === 'job_submitted') {
      handleSelectView('pekerjaan_daftar');
    }
  };

  const handleMarkAllEventsRead = () => {
    setUnreadEventsCount(0);
    setAdminNotificationEvents(prev => prev.map(e => ({ ...e, read: true })));
  };

  // SOP Guard: Teknisi must have checked in and not checked out yet today before opening Quick Job form
  const handleOpenQuickJobWithSOPCheck = useCallback(async () => {
    // 1. Internet connection check
    if (!isDeviceOnline()) {
      showAppAlert({
        title: 'Koneksi Terputus',
        message: 'Jaringan internet tidak normal, data gagal di upload ke database.\n\nSilakan periksa koneksi internet HP Anda sebelum melakukan input pekerjaan.',
        type: 'warning'
      });
      return;
    }

    // 2. Role-based SOP check for Teknisi
    if (currentUser?.role === 'Teknisi') {
      const todayISO = getEffectiveTodayISO();
      const todayAtt = attendanceList.find(a => {
        const isTech =
          a.teknisiId === currentUser.id ||
          (a.teknisiNama && currentUser.namaLengkap && a.teknisiNama.toLowerCase().trim() === currentUser.namaLengkap.toLowerCase().trim()) ||
          (currentUser.username && a.teknisiId?.toLowerCase().trim() === currentUser.username.toLowerCase().trim());
        const isToday = sanitizeDateString(a.tanggal) === todayISO;
        return isTech && isToday;
      });

      const hasMasuk = Boolean(todayAtt?.jamMasuk && todayAtt.jamMasuk !== '-' && todayAtt.jamMasuk.trim().length > 0 && todayAtt.status !== 'Ditolak');
      const hasPulang = Boolean(todayAtt?.jamPulang && todayAtt.jamPulang !== '-' && todayAtt.jamPulang.trim().length > 0);

      if (hasPulang) {
        showAppAlert({
          title: 'Teknisi Sudah Absen Pulang',
          message:
            `Anda sudah melakukan Absen Pulang hari ini${todayAtt?.jamPulang ? ` (Pukul ${todayAtt.jamPulang} WIB)` : ''}.\n\n` +
            'Sesuai SOP, teknisi yang sudah melakukan absen pulang tidak dapat menginput data pekerjaan pada tanggal yang sama.\n\n' +
            'Silakan hubungi Admin jika terdapat data pekerjaan yang perlu disusulkan.',
          type: 'error'
        });
        return;
      }

      if (!hasMasuk) {
        showAppAlert({
          title: 'Akses Ditolak: Belum Absen Masuk',
          message:
            'Anda belum melakukan Absen Masuk hari ini.\n\n' +
            'Sesuai SOP, silakan lakukan Absen Masuk terlebih dahulu melalui menu Absensi sebelum menginput data pekerjaan.',
          type: 'warning'
        });
        return;
      }
    }

    // Ambil data terbaru formulir pekerjaan dari Google Sheets dengan tanda loading spinner
    const activeUrl = settings.googleAppsScriptUrl?.trim();
    if (activeUrl && handlePullDatabaseRef.current) {
      try {
        await handlePullDatabaseRef.current(
          activeUrl,
          true,
          'Mengambil data formulir pekerjaan dari Google Sheets...'
        );
      } catch (err) {
        console.warn('Gagal memuat formulir pekerjaan:', err);
      }
    }

    setIsQuickJobModalOpen(true);
  }, [currentUser, attendanceList, settings.googleAppsScriptUrl]);

  // Memoized navigation callbacks for TeknisiDashboardView
  const handleTeknisiMainTabChange = useCallback((tab: string) => {
    if (tab === 'planning') handleSelectView('pekerjaan_planning');
    else if (tab === 'absensi') handleSelectView('approval_absensi');
    else if (tab === 'gaji') handleSelectView('rekap_honor');
    else handleSelectView('teknisi_dashboard');
  }, [handleSelectView]);

  const handleNavigateToPekerjaanDaftar = useCallback(() => {
    handleSelectView('pekerjaan_daftar');
  }, [handleSelectView]);

  // Initialize Service Worker for background push notifications
  useEffect(() => {
    NotificationService.initServiceWorker();
  }, []);

  // Guard for Teknisi role: restrict admin-only views (master data and pengaturan)
  // Teknisi can access: teknisi_dashboard, pekerjaan_daftar, pekerjaan_planning, approval_absensi, and rekap_honor
  useEffect(() => {
    if (currentUser?.role === 'Teknisi') {
      const restrictedViews = [
        'pengaturan',
        'master_server',
        'master_wilayah',
        'master_jenis_pekerjaan',
        'master_karyawan'
      ];
      if (restrictedViews.includes(activeView)) {
        setActiveView('teknisi_dashboard');
      }
    }
  }, [currentUser, activeView]);

  // 8-Hour User Session Timeout Monitor: Auto-logout after 8 hours
  useEffect(() => {
    if (!currentUser) return;

    const checkSession = () => {
      if (StorageService.isSessionExpired()) {
        StorageService.saveCurrentUser(null);
        setCurrentUser(null);
        showAppAlert({
          title: 'Sesi Berakhir',
          message: 'Sesi login Anda telah berakhir (batas waktu 8 jam). Silakan login kembali.',
          type: 'info'
        });
      }
    };

    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Ref tracking if initial data pull from Google Sheets has completed
  const isDataLoadedFromSheetsRef = React.useRef(false);

  // Safe helper to send sync payload to Google Sheets ONLY when data is loaded & non-empty
  const sendSyncToGoogleSheets = async (overrides?: {
    servers?: ServerData[];
    wilayahList?: WilayahPekerjaan[];
    jenisList?: JenisPekerjaan[];
    employees?: Employee[];
    jobs?: JobRecord[];
    planningTasks?: PlanningTask[];
    attendanceList?: AttendanceRecord[];
    potonganManualList?: PotonganManual[];
    honorLunasList?: HonorLunasRecord[];
    settings?: AppSettings;
    showLoading?: boolean;
    loadingTitle?: string;
    loadingMessage?: string;
  }): Promise<{ success: boolean; message?: string }> => {
    const shouldShowLoading = overrides?.showLoading !== false;
    if (shouldShowLoading) {
      setLoadingOverlay({
        isOpen: true,
        title: overrides?.loadingTitle || 'Menyimpan...',
        message: overrides?.loadingMessage || 'Menyimpan perubahan ke database...'
      });
    }

    const url = (overrides?.settings?.googleAppsScriptUrl || settings.googleAppsScriptUrl || '').trim();
    if (!url) {
      if (shouldShowLoading) {
        await new Promise(r => setTimeout(r, 350));
        setLoadingOverlay(prev => ({ ...prev, isOpen: false }));
      }
      return { success: false, message: 'URL Google Apps Script belum diisi di Pengaturan.' };
    }

    const curServers = overrides?.servers ?? servers;
    const curEmployees = overrides?.employees ?? employees;
    const curJobs = overrides?.jobs ?? jobs;
    const curAttendance = overrides?.attendanceList ?? attendanceList;

    // Safety guard: Never send completely empty lists to Google Sheets to prevent accidental data erasure
    // But if attendance list has items or jobs/servers/employees have items, allow sync!
    if (curServers.length === 0 && curEmployees.length === 0 && curJobs.length === 0 && curAttendance.length === 0) {
      console.warn('Sync skipped: Attempted to overwrite Google Sheets with completely empty dataset.');
      if (shouldShowLoading) {
        setLoadingOverlay(prev => ({ ...prev, isOpen: false }));
      }
      return { success: false, message: 'Dataset kosong, sinkronisasi dibatalkan untuk keamanan data.' };
    }

    try {
      setIsSyncing(true);
      const payload = buildGoogleSheetsSyncPayload({
        servers: curServers,
        wilayah: overrides?.wilayahList ?? wilayahList,
        jenisList: overrides?.jenisList ?? jenisList,
        employees: curEmployees,
        jobs: curJobs,
        planningTasks: overrides?.planningTasks ?? planningTasks,
        attendanceList: curAttendance,
        potonganManualList: overrides?.potonganManualList ?? potonganManualList,
        settings: overrides?.settings ?? settings
      });

      const res = await sendToGoogleAppsScript(url, payload);
      invalidateClientDatabaseCache();
      if (!settings.isGoogleSheetConnected && res.success) {
        setSettings(prev => ({ ...prev, isGoogleSheetConnected: true }));
      }
      return res;
    } catch (err: any) {
      console.error('Failed to sync to Google Sheets:', err);
      return { success: false, message: err.message || 'Gagal mengirim data ke Google Sheets' };
    } finally {
      setIsSyncing(false);
      if (shouldShowLoading) {
        setLoadingOverlay(prev => ({ ...prev, isOpen: false }));
      }
    }
  };

  // Pull database from Google Sheets into application state with Maroon Loading Overlay
  const handlePullDatabase = async (
    urlOverride?: string,
    silent = false,
    customMessage?: string,
    forceRefresh = false
  ): Promise<boolean> => {
    const scriptUrl = (urlOverride || settings.googleAppsScriptUrl || '').trim();
    if (!scriptUrl) {
      if (!silent) {
        showAppAlert({
          title: 'URL Belum Diisi',
          message: 'URL Google Apps Script belum diisi di menu Pengaturan.',
          type: 'warning'
        });
      }
      isDataLoadedFromSheetsRef.current = true;
      return false;
    }

    const shouldShowOverlay = !silent || (employees.length === 0 && jobs.length === 0);
    if (shouldShowOverlay) {
      setLoadingOverlay({
        isOpen: true,
        title: 'Please Wait...',
        message: customMessage || 'Mengambil data dari Google Sheets...'
      });
    }

    if (!silent) {
      setIsSyncing(true);
    }
    try {
      const rawSheets = await fetchFullDatabaseFromGoogleSheets(scriptUrl, forceRefresh);
      const parsed = parseParsedSheetsToState(rawSheets);

      let hasLoadedAny = false;

      if (parsed.servers !== undefined) {
        setServers(prev => {
          if (isDataDifferent(parsed.servers, prev)) {
            StorageService.saveServers(parsed.servers);
            hasLoadedAny = true;
            return parsed.servers;
          }
          return prev;
        });
      }
      if (parsed.wilayah !== undefined) {
        setWilayahList(prev => {
          if (isDataDifferent(parsed.wilayah, prev)) {
            StorageService.saveWilayah(parsed.wilayah);
            hasLoadedAny = true;
            return parsed.wilayah;
          }
          return prev;
        });
      }
      if (parsed.jenisList !== undefined) {
        const sortedJp = sortJenisPekerjaan(parsed.jenisList);
        setJenisList(prev => {
          if (isDataDifferent(sortedJp, prev)) {
            StorageService.saveJenisPekerjaan(sortedJp);
            hasLoadedAny = true;
            return sortedJp;
          }
          return prev;
        });
      }
      if (parsed.employees !== undefined && parsed.employees.length > 0) {
        setEmployees(prev => {
          if (isDataDifferent(parsed.employees, prev)) {
            StorageService.saveEmployees(parsed.employees);
            hasLoadedAny = true;
            return parsed.employees;
          }
          return prev;
        });
      }
      let latestJobsToSync = jobs;
      if (parsed.jobs !== undefined) {
        const lemburMap = StorageService.getApprovedLemburMap();
        const currentLocalJobs = StorageService.getJobs();
        const mergedJobs = parsed.jobs.map((pj: JobRecord) => {
          const localJob = currentLocalJobs.find(j => j.id === pj.id);
          const lemburEntry = lemburMap[pj.id];

          let isApproved = Boolean(pj.lemburApproved);
          let approver = pj.lemburApprovedBy;
          let approvedTime = pj.lemburApprovedAt;

          if (lemburEntry && lemburEntry.approved) {
            isApproved = true;
            approver = lemburEntry.approvedBy || approver;
            approvedTime = lemburEntry.approvedAt || approvedTime;
          } else if (localJob?.lemburApproved) {
            isApproved = true;
            approver = localJob.lemburApprovedBy || approver;
            approvedTime = localJob.lemburApprovedAt || approvedTime;
          }

          return {
            ...pj,
            lemburApproved: isApproved,
            lemburApprovedBy: isApproved ? (approver || 'Admin') : undefined,
            lemburApprovedAt: isApproved ? (approvedTime || new Date().toISOString()) : undefined
          };
        });
        setJobs(prev => {
          if (isDataDifferent(mergedJobs, prev)) {
            StorageService.saveJobs(mergedJobs);
            latestJobsToSync = mergedJobs;
            hasLoadedAny = true;
            return mergedJobs;
          }
          return prev;
        });
      }
      if (parsed.planningTasks !== undefined) {
        setPlanningTasks(prev => {
          if (isDataDifferent(parsed.planningTasks, prev)) {
            StorageService.savePlanning(parsed.planningTasks);
            hasLoadedAny = true;
            return parsed.planningTasks;
          }
          return prev;
        });
      }
      let latestAttendanceToSync = attendanceList;
      if (parsed.attendanceList !== undefined) {
        setAttendanceList(prev => {
          const mergedAttendance = consolidateAttendanceRecords([...prev, ...parsed.attendanceList]);
          if (isDataDifferent(mergedAttendance, prev)) {
            StorageService.saveAttendance(mergedAttendance);
            latestAttendanceToSync = mergedAttendance;
            hasLoadedAny = true;
            return mergedAttendance;
          }
          return prev;
        });
      }
      if (parsed.potonganManualList !== undefined) {
        setPotonganManualList(prev => {
          if (isDataDifferent(parsed.potonganManualList, prev)) {
            StorageService.savePotonganManual(parsed.potonganManualList);
            hasLoadedAny = true;
            return parsed.potonganManualList;
          }
          return prev;
        });
      }
      if (parsed.honorLunasList !== undefined) {
        setHonorLunasList(prev => {
          if (isDataDifferent(parsed.honorLunasList, prev)) {
            StorageService.saveHonorLunas(parsed.honorLunasList);
            hasLoadedAny = true;
            return parsed.honorLunasList;
          }
          return prev;
        });
      }
      if (parsed.settings && Object.keys(parsed.settings).length > 0) {
        const mergedSettings = {
          ...settings,
          ...parsed.settings,
          googleAppsScriptUrl: scriptUrl,
          isGoogleSheetConnected: true
        };
        setSettings(mergedSettings);
        StorageService.saveSettings(mergedSettings);
        StorageService.syncServerSettings(mergedSettings);
        hasLoadedAny = true;
      } else {
        const mergedSettings = { ...settings, googleAppsScriptUrl: scriptUrl, isGoogleSheetConnected: true };
        setSettings(mergedSettings);
        StorageService.saveSettings(mergedSettings);
        StorageService.syncServerSettings(mergedSettings);
      }

      // Synchronize full pulled state to backend server cache so all connected devices stay updated
      StorageService.syncServerState({
        servers: parsed.servers !== undefined ? parsed.servers : servers,
        wilayah: parsed.wilayah !== undefined ? parsed.wilayah : wilayahList,
        jenisList: parsed.jenisList !== undefined ? parsed.jenisList : jenisList,
        employees: parsed.employees !== undefined && parsed.employees.length > 0 ? parsed.employees : employees,
        jobs: latestJobsToSync,
        planningTasks: parsed.planningTasks !== undefined ? parsed.planningTasks : planningTasks,
        attendanceList: latestAttendanceToSync,
        potonganManualList: parsed.potonganManualList !== undefined ? parsed.potonganManualList : potonganManualList,
        settings: { ...settings, ...(parsed.settings || {}), googleAppsScriptUrl: scriptUrl, isGoogleSheetConnected: true }
      });

      // Mark that initial data load from Google Sheets is complete
      isDataLoadedFromSheetsRef.current = true;

      if (!silent) {
        if (hasLoadedAny) {
          showAppAlert({
            title: 'Sinkronisasi Berhasil',
            message: 'Berhasil menarik & menyinkronkan data terbaru dari Google Sheets!',
            type: 'success'
          });
        } else {
          showAppAlert({
            title: 'Koneksi Berhasil',
            message: 'Koneksi Google Sheets berhasil, tetapi spreadsheet belum memiliki data.',
            type: 'info'
          });
        }
      }
      return true;
    } catch (err: any) {
      console.error('Error pulling from Google Sheets:', err);
      // Mark as loaded so subsequent user edits can still function
      isDataLoadedFromSheetsRef.current = true;
      if (!silent) {
        showAppAlert({
          title: 'Gagal Menarik Data',
          message: `Gagal menarik data dari Google Sheets: ${err.message || 'Periksa URL Apps Script'}`,
          type: 'error'
        });
      }
      return false;
    } finally {
      if (!silent) {
        setIsSyncing(false);
      }
      setLoadingOverlay(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Keep handlePullDatabaseRef synchronized
  useEffect(() => {
    handlePullDatabaseRef.current = handlePullDatabase;
  });

  // Cross-device server bootstrap & auto-pull on initial mount
  useEffect(() => {
    const initCrossDeviceBootstrap = async () => {
      try {
        // 1. Fetch server state (shared across PC, HP Teknisi, etc.)
        const serverState = await StorageService.fetchServerBootstrap();
        let activeScriptUrl = (settings.googleAppsScriptUrl || '').trim();

        if (serverState) {
          // Sync keys and maps from shared server state
          if (serverState.resolvedAttendanceKeys && Array.isArray(serverState.resolvedAttendanceKeys)) {
            StorageService.addResolvedAttendanceKeys(serverState.resolvedAttendanceKeys);
          }
          if (serverState.deletedAttendanceIds && Array.isArray(serverState.deletedAttendanceIds)) {
            StorageService.setDeletedAttendanceIds(serverState.deletedAttendanceIds);
          }
          if (serverState.approvedLemburMap && typeof serverState.approvedLemburMap === 'object') {
            StorageService.setApprovedLemburMap(serverState.approvedLemburMap);
          }

          if (serverState.settings) {
            const merged = { ...settings, ...serverState.settings };
            setSettings(merged);
            StorageService.saveSettings(merged);
            if (merged.googleAppsScriptUrl?.trim()) {
              activeScriptUrl = merged.googleAppsScriptUrl.trim();
            }
          }
          if (serverState.employees && serverState.employees.length > 0) {
            setEmployees(prev => {
              const merged = [...serverState.employees];
              if (currentUser && !merged.some(e => e.id === currentUser.id || (e.username && e.username.toLowerCase() === currentUser.username?.toLowerCase()))) {
                merged.push(currentUser);
              }
              StorageService.saveEmployees(merged);
              return merged;
            });
          }
          if (serverState.servers && serverState.servers.length > 0) {
            setServers(serverState.servers);
            StorageService.saveServers(serverState.servers);
          }
          if (serverState.wilayah && serverState.wilayah.length > 0) {
            setWilayahList(serverState.wilayah);
            StorageService.saveWilayah(serverState.wilayah);
          }
          if (serverState.jenisList && serverState.jenisList.length > 0) {
            const sortedJp = sortJenisPekerjaan(serverState.jenisList);
            setJenisList(sortedJp);
            StorageService.saveJenisPekerjaan(sortedJp);
          }
          if (serverState.jobs) {
            const cleanJobs = (serverState.jobs || []).filter((j: any) =>
              !['job-1', 'job-2', 'job-3', 'job-demo-1', 'job-demo-2'].includes(j.id)
            );
            setJobs(cleanJobs);
            StorageService.saveJobs(cleanJobs);
          }
          if (serverState.planningTasks !== undefined) {
            const cleanPlans = (serverState.planningTasks || []).filter((p: any) =>
              !['plan-1', 'plan-2', 'plan-3', 'plan-demo-1', 'plan-demo-2'].includes(p.id) &&
              !p.detailPekerjaan?.includes('Hendra') &&
              !p.detailPekerjaan?.includes('Klender')
            );
            setPlanningTasks(cleanPlans);
            StorageService.savePlanning(cleanPlans);
          }
          if (serverState.attendanceList && serverState.attendanceList.length > 0) {
            const merged = consolidateAttendanceRecords(serverState.attendanceList);
            setAttendanceList(merged);
            StorageService.saveAttendance(merged);
          }
          if (serverState.potonganManualList && serverState.potonganManualList.length > 0) {
            setPotonganManualList(serverState.potonganManualList);
            StorageService.savePotonganManual(serverState.potonganManualList);
          }
        }

        // Tampilkan antarmuka aplikasi seketika (< 300ms) dari cache lokal & server bootstrap tanpa membekukan user
        isDataLoadedFromSheetsRef.current = true;
        setIsBootstrapLoaded(true);
        setLoadingOverlay(prev => ({ ...prev, isOpen: false }));

        // 2. Sinkronkan data terbaru dari Google Sheets di latar belakang
        if (activeScriptUrl) {
          handlePullDatabase(
            activeScriptUrl,
            true,
            'Memperbarui data dari Google Sheets...',
            false
          ).catch(err => {
            console.warn('Bootstrap background pull failed:', err);
          });
        }
      } catch (err) {
        console.warn('Bootstrap initialization error:', err);
      } finally {
        isDataLoadedFromSheetsRef.current = true;
        setIsBootstrapLoaded(true);
        setLoadingOverlay(prev => ({ ...prev, isOpen: false }));
      }
    };

    initCrossDeviceBootstrap();
  }, []);

  // Clear local storage and pull clean data from Google Sheets
  const handleClearLocalDataAndSync = async () => {
    const confirmed = await showAppConfirm({
      title: 'Bersihkan Cache Lokal',
      message: 'Bersihkan semua data cache lokal dan muat ulang data asli dari Google Sheets?',
      type: 'warning',
      confirmText: 'Ya, Bersihkan',
      cancelText: 'Batal'
    });

    if (confirmed) {
      StorageService.resetToDefault();
      setPlanningTasks([]);
      if (settings.googleAppsScriptUrl) {
        await handlePullDatabase(settings.googleAppsScriptUrl);
      } else {
        setJobs([]);
        setAttendanceList([]);
        setLeaveRequests([]);
        setPotonganManualList([]);
        showAppAlert({
          title: 'Cache Dibersihkan',
          message: 'Data cache lokal berhasil dibersihkan!',
          type: 'success'
        });
      }
    }
  };

  // Handle Login
  const handleLoginSuccess = (user: Employee) => {
    StorageService.saveCurrentUser(user);
    setCurrentUser(user);
    // Ensure the user is in the employees array in state and storage so there's no race condition
    setEmployees(prev => {
      const exists = prev.some(e => e.id === user.id || (e.username && e.username.toLowerCase() === user.username?.toLowerCase()));
      if (!exists) {
        const next = [...prev, user];
        StorageService.saveEmployees(next);
        return next;
      }
      return prev;
    });

    handleSelectView(user.role === 'Teknisi' ? 'teknisi_dashboard' : 'dashboard');

    // Immediately send presence heartbeat to server so technician is online right away
    StorageService.sendPresenceHeartbeat({
      id: user.id,
      namaLengkap: user.namaLengkap,
      role: user.role,
      serverId: user.serverId,
      namaServer: user.namaServer,
      username: user.username,
      password: user.password
    }).then(res => {
      if (res && res.onlineTechnicians && Array.isArray(res.onlineTechnicians)) {
        setOnlineTechniciansFromHeartbeat(res.onlineTechnicians);
      }
      if (res && res.onlineUsers && Array.isArray(res.onlineUsers)) {
        setOnlineUsersFromHeartbeat(res.onlineUsers);
      }
    }).catch(() => {});
  };

  // Pending Approvals Count - Memoized to prevent heavy re-calculations on every render/click
  const pendingApprovalsCount = useMemo(() => {
    const deletedIds = new Set(StorageService.getDeletedAttendanceIds());
    deletedIds.add('att-1788758276968');
    const resolvedKeys = new Set(StorageService.getResolvedAttendanceKeys());

    const pendingAttCount = attendanceList.filter(a => {
      if (!a || !a.id || deletedIds.has(a.id)) return false;
      const cleanDate = sanitizeDateString(a.tanggal);
      const techKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const groupKey = `${cleanDate}_${techKey}`.toLowerCase();
      const dateTechIdKey = `${cleanDate}_${a.teknisiId}`.toLowerCase();
      const dateTechNamaKey = `${cleanDate}_${(a.teknisiNama || '').toLowerCase().trim()}`;

      if (
        resolvedKeys.has(groupKey) ||
        resolvedKeys.has(a.id.toLowerCase()) ||
        resolvedKeys.has(dateTechIdKey) ||
        resolvedKeys.has(dateTechNamaKey) ||
        a.isApproved === true ||
        (a.status === 'Hadir' && !a.needsApproval) ||
        a.status === 'Ditolak'
      ) {
        return false;
      }
      return Boolean(a.needsApproval || a.status === 'Pending Approval' || a.status === 'Terlambat');
    }).length;

    const pendingLeaveCount = leaveRequests.filter(l => l.status === 'Pending').length;
    return pendingAttCount + pendingLeaveCount;
  }, [attendanceList, leaveRequests]);

  // Master Data CRUD Handlers
  const handleSaveServer = (server: ServerData) => {
    const idx = servers.findIndex(s => s.id === server.id);
    const next = idx >= 0
      ? servers.map(s => (s.id === server.id ? server : s))
      : [...servers, server];

    setServers(next);
    StorageService.saveServers(next);
    StorageService.syncServerState({ servers: next });
    sendSyncToGoogleSheets({ servers: next });
  };

  const handleDeleteServer = (id: string) => {
    const next = servers.filter(s => s.id !== id);
    setServers(next);
    StorageService.saveServers(next);
    StorageService.syncServerState({ servers: next });
    sendSyncToGoogleSheets({ servers: next });
  };

  const handleSaveWilayah = (wil: WilayahPekerjaan) => {
    const idx = wilayahList.findIndex(w => w.id === wil.id);
    const next = idx >= 0
      ? wilayahList.map(w => (w.id === wil.id ? wil : w))
      : [wil, ...wilayahList];

    setWilayahList(next);
    StorageService.saveWilayah(next);
    StorageService.syncServerState({ wilayah: next });
    sendSyncToGoogleSheets({ wilayahList: next });
  };

  const handleDeleteWilayah = (id: string) => {
    const next = wilayahList.filter(w => w.id !== id);
    setWilayahList(next);
    StorageService.saveWilayah(next);
    StorageService.syncServerState({ wilayah: next });
    sendSyncToGoogleSheets({ wilayahList: next });
  };

  const handleSaveJenis = (jp: JenisPekerjaan) => {
    const idx = jenisList.findIndex(j => j.id === jp.id);
    const updated = idx >= 0
      ? jenisList.map(j => (j.id === jp.id ? jp : j))
      : [jp, ...jenisList];
    const next = sortJenisPekerjaan(updated);

    setJenisList(next);
    StorageService.saveJenisPekerjaan(next);
    StorageService.syncServerState({ jenisList: next });
    sendSyncToGoogleSheets({ jenisList: next });
  };

  const handleDeleteJenis = (id: string) => {
    const next = sortJenisPekerjaan(jenisList.filter(j => j.id !== id));
    setJenisList(next);
    StorageService.saveJenisPekerjaan(next);
    StorageService.syncServerState({ jenisList: next });
    sendSyncToGoogleSheets({ jenisList: next });
  };

  const handleSaveEmployee = (emp: Employee) => {
    const idx = employees.findIndex(e => e.id === emp.id);
    const next = idx >= 0
      ? employees.map(e => (e.id === emp.id ? emp : e))
      : [...employees, emp];

    setEmployees(next);
    StorageService.saveEmployees(next);
    StorageService.syncServerState({ employees: next });
    sendSyncToGoogleSheets({ employees: next });

    // Notify other tabs and instances immediately
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('app_presence_channel');
        bc.postMessage({ type: 'EMPLOYEE_MUTATED', employeeId: emp.id });
        bc.close();
      } catch {}
    }
  };

  const handleDeleteEmployee = (id: string) => {
    const next = employees.filter(e => e.id !== id);
    setEmployees(next);
    StorageService.saveEmployees(next);
    StorageService.syncServerState({ employees: next });
    sendSyncToGoogleSheets({ employees: next });

    // Notify other tabs and instances immediately
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('app_presence_channel');
        bc.postMessage({ type: 'EMPLOYEE_MUTATED', employeeId: id });
        bc.close();
      } catch {}
    }
  };

  // Potongan Manual / Kasbon CRUD
  const handleSavePotonganManual = (potongan: PotonganManual) => {
    const idx = potonganManualList.findIndex(p => p.id === potongan.id);
    const next = idx >= 0
      ? potonganManualList.map(p => (p.id === potongan.id ? potongan : p))
      : [potongan, ...potonganManualList];

    setPotonganManualList(next);
    StorageService.savePotonganManual(next);
    StorageService.syncServerState({ potonganManualList: next });
    sendSyncToGoogleSheets({ potonganManualList: next });
  };

  const handleDeletePotonganManual = (id: string) => {
    const next = potonganManualList.filter(p => p.id !== id);
    setPotonganManualList(next);
    StorageService.savePotonganManual(next);
    StorageService.syncServerState({ potonganManualList: next });
    sendSyncToGoogleSheets({ potonganManualList: next });
  };

  // Job CRUD - Strictly verify network & Google Sheets sync BEFORE persisting to local storage
  const handleSaveJob = async (newJob: JobRecord): Promise<{ success: boolean; message?: string }> => {
    // 1. Strict internet network verification: Cegah jika offline atau jaringan tidak normal
    if (!isDeviceOnline()) {
      return {
        success: false,
        message: 'Jaringan internet tidak normal, data gagal di upload ke database'
      };
    }

    const netHealth = await checkNetworkHealth();
    if (!netHealth.ok) {
      return {
        success: false,
        message: 'Jaringan internet tidak normal, data gagal di upload ke database'
      };
    }

    // Aturan Otomatis Hari Libur: Semua pekerjaan pada hari libur otomatis ACC lembur
    const holidayCheck = isHolidayDate(newJob.tanggal, settings);
    if (holidayCheck.isHoliday) {
      newJob.adaLembur = true;
      newJob.lemburApproved = true;
      newJob.lemburApprovedBy = newJob.lemburApprovedBy || 'Sistem (Otomatis Hari Libur)';
      newJob.lemburApprovedAt = newJob.lemburApprovedAt || new Date().toISOString();
      if (!newJob.menitLembur || newJob.menitLembur <= 0) {
        newJob.menitLembur = 60;
      }
    }

    const idx = jobs.findIndex(j => j.id === newJob.id);
    const next = idx >= 0
      ? jobs.map(j => (j.id === newJob.id ? newJob : j))
      : [newJob, ...jobs];

    // 2. Upload to Google Sheets FIRST!
    // PENTING: Jangan simpan ke localStorage sebelum Google Sheets mengonfirmasi penerimaan data
    let syncResult: { success: boolean; message?: string } = { success: false };
    try {
      syncResult = await sendSyncToGoogleSheets({
        jobs: next,
        loadingTitle: 'Menyimpan Pekerjaan...',
        loadingMessage: 'Menyimpan data pekerjaan ke Google Sheets...'
      });
    } catch (err: any) {
      return {
        success: false,
        message: 'Jaringan internet tidak normal, data gagal di upload ke database'
      };
    }

    if (!syncResult.success) {
      // Sinkronisasi gagal: Jangan simpan ke StorageService maupun setJobs agar penyimpanan lokal bersih
      return {
        success: false,
        message: syncResult.message || 'Jaringan internet tidak normal, data gagal di upload ke database'
      };
    }

    // 3. Hanya jika upload ke Google Sheets BERHASIL: Commit ke state dan storage lokal
    if (newJob.buktiFotoUrls && newJob.buktiFotoUrls.length > 0) {
      newJob.buktiFotoUrls.forEach(url => {
        if (url) PhotoCacheService.set(url, url);
      });
    }
    if (newJob.buktiFotoUrl) {
      PhotoCacheService.set(newJob.buktiFotoUrl, newJob.buktiFotoUrl);
    }

    if (newJob.adaLembur) {
      StorageService.setLemburApproval(
        newJob.id,
        Boolean(newJob.lemburApproved),
        newJob.lemburApproved ? (newJob.lemburApprovedBy || currentUser?.namaLengkap || 'Admin') : undefined,
        newJob.lemburApproved ? (newJob.lemburApprovedAt || new Date().toISOString()) : undefined
      );
    }

    setJobs(next);
    StorageService.saveJobs(next);
    StorageService.syncServerState({
      jobs: next,
      approvedLemburMap: StorageService.getApprovedLemburMap()
    });

    // Kirim notifikasi untuk input pekerjaan baru (ke admin dan perangkat teknisi lain)
    if (idx < 0) {
      const techName = (newJob.teknisiNamas && newJob.teknisiNamas.length > 0) ? newJob.teknisiNamas.join(', ') : 'Teknisi';
      StorageService.publishAdminNotification({
        type: 'job_submitted',
        title: '🛠️ Input Pekerjaan Baru',
        body: `${techName} menginput pekerjaan baru: ${newJob.jenisPekerjaanNama || 'Pekerjaan'} (${newJob.namaServer || '-'}).`,
        data: {
          jobId: newJob.id,
          teknisiIds: newJob.teknisiIds,
          teknisiNama: techName,
          serverNama: newJob.namaServer,
          senderId: currentUser?.id,
          senderRole: currentUser?.role,
          senderName: currentUser?.namaLengkap
        }
      });
    }

    if (settings.googleAppsScriptUrl && newJob.adaLembur) {
      sendLemburStatusToSheets(settings.googleAppsScriptUrl, {
        jobId: newJob.id,
        lemburApproved: Boolean(newJob.lemburApproved),
        approvedBy: newJob.lemburApprovedBy || currentUser?.namaLengkap || 'Admin',
        approvedAt: newJob.lemburApprovedAt || new Date().toISOString()
      }).catch(err => console.warn('sendLemburStatusToSheets warning:', err));
    }

    return { success: true, message: 'Data pekerjaan berhasil disimpan dan disinkronkan ke Google Sheets!' };
  };

  // Dedicated instant handler for Overtime (Lembur) Approval
  const handleApproveLembur = async (jobId: string, isApproved: boolean): Promise<{ success: boolean; message?: string }> => {
    const approverName = currentUser?.namaLengkap || 'Admin';
    const approvedTimestamp = new Date().toISOString();

    // 1. Simpan langsung ke Persistent Storage lokal
    StorageService.setLemburApproval(jobId, isApproved, isApproved ? approverName : undefined, isApproved ? approvedTimestamp : undefined);

    // 2. Update state jobs aplikasi
    const next = jobs.map(j => {
      if (j.id === jobId) {
        return {
          ...j,
          lemburApproved: isApproved,
          lemburApprovedBy: isApproved ? approverName : undefined,
          lemburApprovedAt: isApproved ? approvedTimestamp : undefined
        };
      }
      return j;
    });

    setJobs(next);
    StorageService.saveJobs(next);
    StorageService.syncServerState({
      jobs: next,
      approvedLemburMap: StorageService.getApprovedLemburMap()
    });

    // 3. Kirim action updateLemburStatus ke Google Apps Script (Sangat cepat dan andal)
    let directResult: { success: boolean; message?: string } = { success: true };
    if (settings.googleAppsScriptUrl) {
      try {
        directResult = await sendLemburStatusToSheets(settings.googleAppsScriptUrl, {
          jobId,
          lemburApproved: isApproved,
          approvedBy: isApproved ? approverName : undefined,
          approvedAt: isApproved ? approvedTimestamp : undefined
        });
      } catch (err) {
        console.warn('sendLemburStatusToSheets warning:', err);
      }
    }

    // 4. Sinkronkan juga tabel DaftarPekerjaan penuh ke Google Sheets di latar belakang
    sendSyncToGoogleSheets({ jobs: next }).catch(err => console.warn('sendSyncToGoogleSheets warning:', err));

    return {
      success: true,
      message: isApproved
        ? 'Persetujuan lembur berhasil disimpan dan dikonfirmasi ke Google Sheets!'
        : 'Persetujuan lembur berhasil dibatalkan.'
    };
  };

  const handleDeleteJob = (id: string) => {
    const next = jobs.filter(j => j.id !== id);
    setJobs(next);
    StorageService.saveJobs(next);
    StorageService.syncServerState({ jobs: next });
    sendSyncToGoogleSheets({ jobs: next });
  };

  // Planning CRUD
  const handleSavePlanning = (plan: PlanningTask) => {
    const idx = planningTasks.findIndex(p => p.id === plan.id);
    const next = idx >= 0
      ? planningTasks.map(p => (p.id === plan.id ? plan : p))
      : [plan, ...planningTasks];

    setPlanningTasks(next);
    StorageService.savePlanning(next);
    StorageService.syncServerState({ planningTasks: next });
    sendSyncToGoogleSheets({ planningTasks: next });

    // Kirim notifikasi admin untuk planning pekerjaan baru
    if (idx < 0) {
      const techNames = (plan.targetTeknisiNamas && plan.targetTeknisiNamas.length > 0) ? plan.targetTeknisiNamas.join(', ') : 'Teknisi';
      const taskTitle = plan.subPekerjaanNama || plan.detailPekerjaan || 'Tugas Baru';
      StorageService.publishAdminNotification({
        type: 'planning_created',
        title: '📅 Planning Pekerjaan Baru',
        body: `Tugas "${taskTitle}" dijadwalkan untuk ${techNames} di ${plan.namaServer} (${plan.tanggal}).`,
        data: {
          planningId: plan.id,
          judulTugas: taskTitle,
          teknisiNama: techNames
        }
      });
    }
  };

  const handleDeletePlanning = (id: string) => {
    const next = planningTasks.filter(p => p.id !== id);
    setPlanningTasks(next);
    StorageService.savePlanning(next);
    StorageService.syncServerState({ planningTasks: next });
    sendSyncToGoogleSheets({ planningTasks: next });
  };

  // Approval Handlers
  const handleApproveAttendance = async (id: string, isApproved: boolean): Promise<{ success: boolean; message?: string }> => {
    const targetRecord = attendanceList.find(a => a.id === id);
    const cleanDate = targetRecord ? sanitizeDateString(targetRecord.tanggal) : null;
    const targetTechKey = targetRecord ? getNormalizedTechKey(targetRecord.teknisiId, targetRecord.teknisiNama) : null;
    const targetGroupKey = cleanDate && targetTechKey ? `${cleanDate}_${targetTechKey}` : null;

    const keysToAdd: string[] = [];
    if (id) keysToAdd.push(id);
    if (targetGroupKey) keysToAdd.push(targetGroupKey);
    if (cleanDate && targetRecord?.teknisiId) keysToAdd.push(`${cleanDate}_${targetRecord.teknisiId}`);
    if (cleanDate && targetRecord?.teknisiNama) keysToAdd.push(`${cleanDate}_${targetRecord.teknisiNama}`);

    StorageService.addResolvedAttendanceKeys(keysToAdd);

    const next = attendanceList.map(a => {
      const aDate = sanitizeDateString(a.tanggal);
      const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const aGroupKey = `${aDate}_${aTechKey}`;

      const isMatch = a.id === id || (targetGroupKey && aGroupKey === targetGroupKey);
      if (isMatch) {
        return {
          ...a,
          status: (isApproved ? 'Hadir' : 'Ditolak') as AttendanceRecord['status'],
          needsApproval: false,
          isApproved: isApproved,
          potonganOtomatis: isApproved ? 0 : (a.potonganOtomatis || 25000)
        };
      }
      return a;
    });

    const consolidated = consolidateAttendanceRecords(next);
    setAttendanceList(consolidated);
    StorageService.saveAttendance(consolidated);
    StorageService.syncServerState({ attendanceList: consolidated });
    isDataLoadedFromSheetsRef.current = true;
    return await sendSyncToGoogleSheets({ attendanceList: consolidated });
  };

  // Bulk Approve all pending attendance
  const handleApproveAllAttendance = async (): Promise<{ success: boolean; message?: string }> => {
    const keysToAdd: string[] = [];
    const next = attendanceList.map(a => {
      const isPending = Boolean(a.needsApproval || a.status === 'Pending Approval');
      if (isPending) {
        const cleanDate = sanitizeDateString(a.tanggal);
        const techKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
        if (a.id) keysToAdd.push(a.id);
        if (cleanDate && techKey) keysToAdd.push(`${cleanDate}_${techKey}`);
        if (cleanDate && a.teknisiId) keysToAdd.push(`${cleanDate}_${a.teknisiId}`);
        if (cleanDate && a.teknisiNama) keysToAdd.push(`${cleanDate}_${a.teknisiNama}`);

        return {
          ...a,
          status: 'Hadir' as AttendanceRecord['status'],
          needsApproval: false,
          isApproved: true,
          potonganOtomatis: 0
        };
      }
      return a;
    });

    StorageService.addResolvedAttendanceKeys(keysToAdd);
    const consolidated = consolidateAttendanceRecords(next);
    setAttendanceList(consolidated);
    StorageService.saveAttendance(consolidated);
    StorageService.syncServerState({ attendanceList: consolidated });
    isDataLoadedFromSheetsRef.current = true;
    return await sendSyncToGoogleSheets({ attendanceList: consolidated });
  };

  // Handler for Admin to manually update/set jamPulang or verify attendance
  const handleUpdateAttendance = async (
    updated: Partial<AttendanceRecord> & { id?: string; tanggal: string; teknisiId: string; teknisiNama?: string }
  ): Promise<{ success: boolean; message?: string }> => {
    const cleanDate = sanitizeDateString(updated.tanggal);
    const targetTechKey = getNormalizedTechKey(updated.teknisiId, updated.teknisiNama);
    const targetGroupKey = `${cleanDate}_${targetTechKey}`;

    const keysToAdd: string[] = [targetGroupKey, targetGroupKey.toLowerCase()];
    if (updated.id) {
      keysToAdd.push(updated.id);
      keysToAdd.push(updated.id.toLowerCase());
    }
    if (updated.teknisiId) {
      keysToAdd.push(`${cleanDate}_${updated.teknisiId}`);
      keysToAdd.push(`${cleanDate}_${updated.teknisiId}`.toLowerCase());
    }
    if (updated.teknisiNama) {
      keysToAdd.push(`${cleanDate}_${updated.teknisiNama.toLowerCase().trim()}`);
    }
    StorageService.addResolvedAttendanceKeys(keysToAdd);

    let matchFound = false;
    const next = attendanceList.map(a => {
      const aDate = sanitizeDateString(a.tanggal);
      const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const aTechNamaClean = (a.teknisiNama || '').toLowerCase().trim();
      const updatedNamaClean = (updated.teknisiNama || '').toLowerCase().trim();

      const isMatch = Boolean(
        (updated.id && a.id === updated.id) ||
        (aDate === cleanDate && (
          (aTechKey && aTechKey === targetTechKey) ||
          (updated.teknisiId && a.teknisiId === updated.teknisiId) ||
          (aTechNamaClean && updatedNamaClean && aTechNamaClean === updatedNamaClean)
        ))
      );

      if (isMatch) {
        matchFound = true;
        const finalJamPulang = updated.jamPulang && updated.jamPulang !== '-' 
          ? sanitizeTimeString(updated.jamPulang, '17:00') 
          : (a.jamPulang || '17:00');

        return {
          ...a,
          ...updated,
          id: a.id || updated.id || `att-${Date.now()}`,
          tanggal: cleanDate,
          jamPulang: finalJamPulang,
          keteranganPulang: updated.keteranganPulang || a.keteranganPulang || 'Absen pulang diverifikasi Admin (Manual)',
          isApproved: updated.status === 'Ditolak' ? false : true,
          needsApproval: false,
          isManual: true,
          status: (updated.status || 'Hadir') as AttendanceRecord['status'],
          potonganOtomatis: updated.potonganOtomatis !== undefined ? updated.potonganOtomatis : 0
        };
      }
      return a;
    });

    if (!matchFound) {
      next.unshift({
        id: updated.id || `att-${Date.now()}`,
        tanggal: cleanDate,
        teknisiId: updated.teknisiId,
        teknisiNama: updated.teknisiNama || 'Teknisi',
        jamMasuk: updated.jamMasuk || '08:00',
        jamPulang: updated.jamPulang && updated.jamPulang !== '-' ? sanitizeTimeString(updated.jamPulang, '17:00') : '17:00',
        serverId: updated.serverId,
        serverNama: updated.serverNama,
        isWithinRadius: true,
        distanceMeter: 15,
        status: (updated.status || 'Hadir') as AttendanceRecord['status'],
        needsApproval: false,
        isApproved: updated.status === 'Ditolak' ? false : true,
        isManual: true,
        potonganOtomatis: updated.status === 'Ditolak' ? (updated.potonganOtomatis || 25000) : 0,
        keterangan: updated.keterangan || 'Input manual oleh Admin',
        keteranganPulang: updated.keteranganPulang || 'Absen pulang diverifikasi Admin (Manual)'
      });
    }

    const consolidated = consolidateAttendanceRecords(next);
    setAttendanceList(consolidated);
    StorageService.saveAttendance(consolidated);
    StorageService.syncServerState({ attendanceList: consolidated });
    return await sendSyncToGoogleSheets({
      attendanceList: consolidated,
      loadingTitle: 'Menyimpan Absensi...',
      loadingMessage: `Menyimpan data absen manual ke database Google Sheets...`
    });
  };

  const handleRequestLeave = (leave: Partial<LeaveRequest>) => {
    const isCuti = leave.jenis === 'Cuti';
    const fullLeave: LeaveRequest = {
      ...(leave as LeaveRequest),
      status: isCuti ? 'Approved' : (leave.status || 'Pending')
    };
    const nextLeave = [fullLeave, ...leaveRequests.filter(l => l.id !== fullLeave.id)];
    setLeaveRequests(nextLeave);
    StorageService.saveLeave(nextLeave);

    // Register an AttendanceRecord for that date & technician
    // Sesuai SOP: Cuti otomatis disetujui tanpa approval admin (status: 'Cuti', needsApproval: false, isApproved: true)
    const attId = `att-leave-${fullLeave.id}`;
    const newAttRecord: AttendanceRecord = {
      id: attId,
      tanggal: fullLeave.tanggal,
      teknisiId: fullLeave.teknisiId,
      teknisiNama: fullLeave.teknisiNama,
      jamMasuk: '-',
      jamPulang: '-',
      status: (isCuti ? 'Cuti' : 'Pending Approval') as AbsensiStatus,
      keterangan: `[${fullLeave.jenis}] ${fullLeave.alasan}`,
      needsApproval: isCuti ? false : true,
      approvalType: 'Izin / Cuti',
      potonganOtomatis: 0,
      isApproved: isCuti ? true : false
    };

    const nextAttendance = [
      newAttRecord,
      ...attendanceList.filter(a => a.id !== attId && !(a.tanggal === fullLeave.tanggal && a.teknisiId === fullLeave.teknisiId))
    ];
    setAttendanceList(nextAttendance);
    StorageService.saveAttendance(nextAttendance);
    StorageService.syncServerState({ attendanceList: nextAttendance });
    sendSyncToGoogleSheets({ attendanceList: nextAttendance });

    // Kirim notifikasi admin untuk pengajuan izin / cuti
    StorageService.publishAdminNotification({
      type: 'attendance_submitted',
      title: isCuti ? `🌴 Cuti Teknisi (Disetujui Otomatis)` : `📋 Pengajuan ${fullLeave.jenis} Teknisi`,
      body: isCuti
        ? `${fullLeave.teknisiNama} mengambil Cuti pada ${fullLeave.tanggal}: "${fullLeave.alasan}". (Disetujui otomatis sesuai SOP).`
        : `${fullLeave.teknisiNama} mengajukan ${fullLeave.jenis} (${fullLeave.tanggal}): "${fullLeave.alasan}".`,
      data: {
        leaveId: fullLeave.id,
        teknisiNama: fullLeave.teknisiNama,
        jenis: fullLeave.jenis
      }
    });
  };

  const handleApproveLeave = (id: string, isApproved: boolean) => {
    const targetLeave = leaveRequests.find(l => l.id === id);
    const next = leaveRequests.map(l => {
      if (l.id === id) {
        return {
          ...l,
          status: (isApproved ? 'Approved' : 'Rejected') as LeaveRequest['status']
        };
      }
      return l;
    });
    setLeaveRequests(next);
    StorageService.saveLeave(next);

    // Also sync the matching attendance record
    if (targetLeave) {
      const attId = `att-leave-${targetLeave.id}`;
      const updatedAttendance = attendanceList.map(a => {
        if (
          a.id === attId ||
          (a.tanggal === targetLeave.tanggal &&
            a.teknisiId === targetLeave.teknisiId &&
            (a.approvalType === 'Izin/Cuti' || a.approvalType === 'Izin / Cuti' || a.status === 'Pending Approval'))
        ) {
          return {
            ...a,
            status: (isApproved ? (targetLeave.jenis === 'Cuti' ? 'Cuti' : 'Izin') : 'Ditolak') as AbsensiStatus,
            isApproved: isApproved,
            needsApproval: false
          };
        }
        return a;
      });
      setAttendanceList(updatedAttendance);
      StorageService.saveAttendance(updatedAttendance);
      StorageService.syncServerState({ attendanceList: updatedAttendance });
      sendSyncToGoogleSheets({ attendanceList: updatedAttendance });
    }
  };

  const handleDeleteAttendance = (id: string) => {
    StorageService.addDeletedAttendanceId(id);
    const targetRecord = attendanceList.find(a => a.id === id);
    if (targetRecord?.id) {
      StorageService.addDeletedAttendanceId(targetRecord.id);
    }
    const cleanDate = targetRecord ? sanitizeDateString(targetRecord.tanggal) : null;
    const targetTechKey = targetRecord ? getNormalizedTechKey(targetRecord.teknisiId, targetRecord.teknisiNama) : null;
    const targetGroupKey = cleanDate && targetTechKey ? `${cleanDate}_${targetTechKey}` : null;

    const next = attendanceList.filter(a => {
      if (a.id === id) return false;
      if (targetGroupKey) {
        const aDate = sanitizeDateString(a.tanggal);
        const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
        const aGroupKey = `${aDate}_${aTechKey}`;
        if (aGroupKey === targetGroupKey) return false;
      }
      return true;
    });
    const consolidated = consolidateAttendanceRecords(next);
    setAttendanceList(consolidated);
    StorageService.saveAttendance(consolidated);
    StorageService.syncServerState({ attendanceList: consolidated });
    sendSyncToGoogleSheets({ attendanceList: consolidated });
  };

  const handleDeleteLeave = (id: string) => {
    const next = leaveRequests.filter(l => l.id !== id);
    setLeaveRequests(next);
    StorageService.saveLeave(next);
  };

  const handleClearAllAttendanceAndLeave = () => {
    setAttendanceList([]);
    setLeaveRequests([]);
    StorageService.saveAttendance([]);
    StorageService.saveLeave([]);
    StorageService.syncServerState({ attendanceList: [] });
    sendSyncToGoogleSheets({ attendanceList: [] });
  };

  // Check-in & Check-out handler from Teknisi (Smart Merge - No Overwriting/Collisions)
  const handleCheckIn = (att: Partial<AttendanceRecord>) => {
    const targetTanggal = att.tanggal || getEffectiveTodayISO();
    const targetTeknisiId = att.teknisiId || currentUser?.id || 'emp-3';
    const targetTeknisiNama = att.teknisiNama || currentUser?.namaLengkap || 'Teknisi';
    const targetTechKey = getNormalizedTechKey(targetTeknisiId, targetTeknisiNama);

    const cleanTargetTanggal = sanitizeDateString(targetTanggal);

    // Look for existing attendance record for this technician on this day
    const existingIndex = attendanceList.findIndex(a => {
      const matchId = att.id && a.id === att.id;
      const isSameDate = sanitizeDateString(a.tanggal) === cleanTargetTanggal;
      const aTechKey = getNormalizedTechKey(a.teknisiId, a.teknisiNama);
      const isSameTech = 
        a.teknisiId === targetTeknisiId ||
        (a.teknisiNama && targetTeknisiNama && a.teknisiNama.toLowerCase().trim() === targetTeknisiNama.toLowerCase().trim()) ||
        (aTechKey && targetTechKey && aTechKey === targetTechKey);
      return matchId || (isSameDate && isSameTech);
    });

    const finalJamMasuk = (att.jamMasuk && att.jamMasuk !== '-' && att.jamMasuk.trim())
      ? att.jamMasuk
      : (existingIndex >= 0 && attendanceList[existingIndex].jamMasuk ? attendanceList[existingIndex].jamMasuk : '08:00');

    const finalJamPulang = (att.jamPulang && att.jamPulang !== '-' && att.jamPulang.trim())
      ? att.jamPulang
      : (existingIndex >= 0 && attendanceList[existingIndex].jamPulang && attendanceList[existingIndex].jamPulang !== '-' ? attendanceList[existingIndex].jamPulang : undefined);

    const existingRecord = existingIndex >= 0 ? attendanceList[existingIndex] : null;

    // Check if late check-in occurs based on dynamic settings
    const stdMasuk = sanitizeTimeString(settings?.jamMasukDefinisikan, '08:00');
    const toleransi = Number(settings?.toleransiKeterlambatanMenit ?? 15);
    const [stdH, stdM] = stdMasuk.split(':').map(Number);
    const maxOnTime = (stdH || 8) * 60 + (stdM || 0) + toleransi;
    let isLateCheckIn = false;
    if (finalJamMasuk && finalJamMasuk.includes(':')) {
      const [h, m] = finalJamMasuk.split(':').map(Number);
      if ((h || 0) * 60 + (m || 0) > maxOnTime) {
        isLateCheckIn = true;
      }
    }

    const resolvedKeysSet = new Set(StorageService.getResolvedAttendanceKeys());
    const groupKey = `${cleanTargetTanggal}_${targetTechKey}`.toLowerCase();
    const dateTechIdKey = `${cleanTargetTanggal}_${targetTeknisiId}`.toLowerCase();
    const isExplicitlyApprovedByAdmin = Boolean(
      resolvedKeysSet.has(groupKey) || 
      (existingRecord && resolvedKeysSet.has(existingRecord.id.toLowerCase())) ||
      resolvedKeysSet.has(dateTechIdKey) ||
      att.isManual === true || 
      existingRecord?.isManual === true
    );

    const isExistingResolved = Boolean(
      isExplicitlyApprovedByAdmin ||
      (existingRecord &&
      existingRecord.isApproved === true &&
      !existingRecord.needsApproval &&
      existingRecord.status === 'Hadir' &&
      !isLateCheckIn)
    );
    const isNewDeparture = Boolean(att.jamPulang && (!existingRecord?.jamPulang || existingRecord.jamPulang === '-'));

    // Strictly evaluate business rules for late check-in, early checkout, outside radius, and outside work hours
    const evalRes = evaluateAttendanceApproval({
      jamMasuk: finalJamMasuk,
      jamPulang: finalJamPulang,
      tanggal: cleanTargetTanggal,
      isWithinRadius: att.isWithinRadius !== undefined ? att.isWithinRadius : (existingRecord ? existingRecord.isWithinRadius : true),
      distanceMeter: att.distanceMeter !== undefined ? att.distanceMeter : (existingRecord ? existingRecord.distanceMeter : 0),
      settings: settings,
      alreadyApproved: isExistingResolved && !isNewDeparture && att.needsApproval !== true
    });

    // PENTING SESUAI ATURAN SISTEM: Teknisi yang absen terlambat WAJIB approval Admin
    const isPendingApproval = Boolean(
      (!isExplicitlyApprovedByAdmin && isLateCheckIn) ||
      att.needsApproval || 
      evalRes.needsApproval
    );
    const finalStatus = isPendingApproval 
      ? 'Pending Approval' 
      : (att.status || (existingRecord ? existingRecord.status : 'Hadir'));
    const finalApprovalType = (isLateCheckIn && !isExplicitlyApprovedByAdmin) 
      ? 'Terlambat' 
      : (att.approvalType || evalRes.approvalType);
    const finalPotongan = !isPendingApproval && (existingRecord?.status === 'Hadir' || existingRecord?.isApproved)
      ? 0
      : (att.potonganOtomatis !== undefined ? att.potonganOtomatis : evalRes.potonganOtomatis);

    const isInvalidServerVal = (s?: string) => {
      if (!s) return true;
      const l = s.toLowerCase().trim();
      return l === 'ya' || l === 'tidak' || l === 'yes' || l === 'no' || l === 'true' || l === 'false' || l === '-' || l === '--' || l === 'undefined' || l === 'null' || l === 'server' || l === 'server ya' || !isNaN(Number(s));
    };

    const cleanAttServerNama = !isInvalidServerVal(att.serverNama) ? att.serverNama : undefined;
    const cleanExistingServerNama = existingRecord ? (!isInvalidServerVal(existingRecord.serverNama) ? existingRecord.serverNama : undefined) : undefined;
    const resolvedServerNama = cleanAttServerNama || cleanExistingServerNama || (servers[0]?.namaServer || 'Server Utama');

    const cleanAttServerId = (!isInvalidServerVal(att.serverId) && !att.serverId?.includes('Ya')) ? att.serverId : undefined;
    const cleanExistingServerId = existingRecord ? ((!isInvalidServerVal(existingRecord.serverId) && !existingRecord.serverId?.includes('Ya')) ? existingRecord.serverId : undefined) : undefined;
    const resolvedServerId = cleanAttServerId || cleanExistingServerId || (servers[0]?.id || 'srv-1');

    let updatedList: AttendanceRecord[];

    if (existingIndex >= 0) {
      const existing = attendanceList[existingIndex];
      const merged: AttendanceRecord = {
        ...existing,
        ...att,
        id: existing.id || att.id || `att-${Date.now()}`,
        tanggal: cleanTargetTanggal,
        teknisiId: existing.teknisiId || targetTeknisiId,
        teknisiNama: existing.teknisiNama || targetTeknisiNama,
        serverId: resolvedServerId,
        serverNama: resolvedServerNama,
        jamMasuk: finalJamMasuk,
        fotoProofUrl: pickBestPhotoUrl(att.fotoProofUrl, existing.fotoProofUrl),
        jamPulang: (att.jamPulang && att.jamPulang !== '-' && att.jamPulang.trim())
          ? att.jamPulang
          : (existing.jamPulang && existing.jamPulang !== '-' ? existing.jamPulang : undefined),
        fotoPulangUrl: pickBestPhotoUrl(att.fotoPulangUrl, existing.fotoPulangUrl),
        keterangan: att.keterangan || existing.keterangan || evalRes.reason,
        keteranganPulang: att.keteranganPulang || existing.keteranganPulang,
        lat: att.lat ?? existing.lat,
        lng: att.lng ?? existing.lng,
        distanceMeter: att.distanceMeter ?? existing.distanceMeter,
        isWithinRadius: att.isWithinRadius ?? existing.isWithinRadius,
        status: finalStatus,
        needsApproval: isPendingApproval,
        isApproved: isPendingApproval ? false : (existing.isApproved ?? (finalStatus === 'Hadir' && !isPendingApproval ? true : false)),
        approvalType: finalApprovalType,
        potonganOtomatis: finalPotongan
      };

      updatedList = [...attendanceList];
      updatedList[existingIndex] = merged;
    } else {
      const newRecord: AttendanceRecord = {
        id: att.id || `att-${Date.now()}`,
        tanggal: cleanTargetTanggal,
        teknisiId: targetTeknisiId,
        teknisiNama: targetTeknisiNama,
        serverId: resolvedServerId,
        serverNama: resolvedServerNama,
        jamMasuk: finalJamMasuk,
        jamPulang: att.jamPulang,
        lat: att.lat,
        lng: att.lng,
        distanceMeter: att.distanceMeter || 20,
        isWithinRadius: att.isWithinRadius ?? true,
        fotoProofUrl: pickBestPhotoUrl(att.fotoProofUrl),
        fotoPulangUrl: pickBestPhotoUrl(att.fotoPulangUrl),
        status: finalStatus,
        needsApproval: isPendingApproval,
        isApproved: isPendingApproval ? false : (finalStatus === 'Hadir' && !isPendingApproval ? true : false),
        approvalType: finalApprovalType,
        keterangan: att.keterangan || evalRes.reason,
        keteranganPulang: att.keteranganPulang,
        potonganOtomatis: finalPotongan
      };
      updatedList = [newRecord, ...attendanceList];
    }

    if (att.fotoProofUrl) {
      PhotoCacheService.set(att.fotoProofUrl, att.fotoProofUrl);
      if (att.id) PhotoCacheService.set(`${att.id}_masuk`, att.fotoProofUrl);
    }
    if (att.fotoPulangUrl) {
      PhotoCacheService.set(att.fotoPulangUrl, att.fotoPulangUrl);
      if (att.id) PhotoCacheService.set(`${att.id}_pulang`, att.fotoPulangUrl);
    }

    const next = consolidateAttendanceRecords(updatedList);
    setAttendanceList(next);
    StorageService.saveAttendance(next);
    StorageService.syncServerState({ attendanceList: next });
    sendSyncToGoogleSheets({ attendanceList: next });

    // Kirim notifikasi admin untuk absensi teknisi
    const isAbsenPulang = Boolean(att.jamPulang && att.jamPulang !== '-' && att.jamPulang.trim().length > 0);
    const tipeAbsen = isAbsenPulang ? 'Pulang' : 'Masuk';
    const jamAbsen = isAbsenPulang ? att.jamPulang : (att.jamMasuk || '-');
    const statusKet = isPendingApproval
      ? ' (Memerlukan Persetujuan Admin)'
      : (finalStatus === 'Hadir' ? ' (Tepat Waktu)' : ` (${finalStatus})`);

    StorageService.publishAdminNotification({
      type: 'attendance_submitted',
      title: `📋 Absensi Teknisi: Absen ${tipeAbsen}`,
      body: `${targetTeknisiNama} melakukan absen ${tipeAbsen.toLowerCase()} pukul ${jamAbsen}${statusKet}.`,
      data: {
        teknisiId: targetTeknisiId,
        teknisiNama: targetTeknisiNama,
        tipe: tipeAbsen,
        status: finalStatus,
        needsApproval: isPendingApproval,
        senderId: currentUser?.id,
        senderRole: currentUser?.role,
        senderName: currentUser?.namaLengkap,
        isManualByAdmin: currentUser?.role === 'Admin'
      }
    });

    // Background upload to Google Drive if photo was submitted as base64
    if (settings?.googleAppsScriptUrl) {
      const recordId = att.id || (existingIndex >= 0 ? attendanceList[existingIndex]?.id : undefined);
      if (att.fotoProofUrl && att.fotoProofUrl.startsWith('data:image')) {
        const b64 = att.fotoProofUrl;
        const filename = `selfie_masuk_${targetTeknisiNama.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;
        uploadPhotoToGoogleDrive(settings.googleAppsScriptUrl, b64, filename).then(res => {
          if (res.success && res.url && recordId) {
            PhotoCacheService.set(res.url, b64);
            if (res.fileId) PhotoCacheService.set(res.fileId, b64);
            setAttendanceList(prev => {
              const updated = prev.map(item => item.id === recordId ? { ...item, fotoProofUrl: res.url } : item);
              StorageService.saveAttendance(updated);
              StorageService.syncServerState({ attendanceList: updated });
              sendSyncToGoogleSheets({ attendanceList: updated });
              return updated;
            });
          }
        }).catch(() => {});
      }
      if (att.fotoPulangUrl && att.fotoPulangUrl.startsWith('data:image')) {
        const b64 = att.fotoPulangUrl;
        const filename = `selfie_pulang_${targetTeknisiNama.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;
        uploadPhotoToGoogleDrive(settings.googleAppsScriptUrl, b64, filename).then(res => {
          if (res.success && res.url && recordId) {
            PhotoCacheService.set(res.url, b64);
            if (res.fileId) PhotoCacheService.set(res.fileId, b64);
            setAttendanceList(prev => {
              const updated = prev.map(item => item.id === recordId ? { ...item, fotoPulangUrl: res.url } : item);
              StorageService.saveAttendance(updated);
              StorageService.syncServerState({ attendanceList: updated });
              sendSyncToGoogleSheets({ attendanceList: updated });
              return updated;
            });
          }
        }).catch(() => {});
      }
    }
  };

  // Test Sheets Connection
  const handleTestGoogleSheetsConnection = async (url: string) => {
    try {
      await StorageService.syncWithGoogleSheets(url);
      
      const updatedSettings = { ...settings, googleAppsScriptUrl: url.trim(), isGoogleSheetConnected: true };
      setSettings(updatedSettings);
      StorageService.saveSettings(updatedSettings);

      // Perform an immediate full database push including PengaturanApp table
      const payload = buildGoogleSheetsSyncPayload({
        servers,
        wilayah: wilayahList,
        jenisList,
        employees,
        jobs,
        planningTasks,
        attendanceList,
        potonganManualList,
        settings: updatedSettings
      });

      const res = await sendToGoogleAppsScript(url, payload);
      return res.success;
    } catch (err) {
      console.error('Test connection error:', err);
      return false;
    }
  };

  // Manual trigger full database sync to Google Sheets
  const handleSyncDatabase = async () => {
    setIsSyncing(true);
    try {
      if (settings.googleAppsScriptUrl) {
        const curHonorLunas = StorageService.getHonorLunas();
        const curJobs = StorageService.getJobs();
        const curPotongan = StorageService.getPotonganManual();
        const payload = buildGoogleSheetsSyncPayload({
          servers,
          wilayah: wilayahList,
          jenisList,
          employees,
          jobs: curJobs.length > 0 ? curJobs : jobs,
          planningTasks,
          attendanceList,
          potonganManualList: curPotongan.length > 0 ? curPotongan : potonganManualList,
          honorLunasList: curHonorLunas.length > 0 ? curHonorLunas : honorLunasList,
          settings
        });

        const res = await sendToGoogleAppsScript(settings.googleAppsScriptUrl, payload);
        if (res.success) {
          setSettings(prev => ({ ...prev, isGoogleSheetConnected: true }));
          showAppAlert({
            title: 'Sinkronisasi Berhasil',
            message: 'Semua data (Server, Wilayah, Pekerjaan, Karyawan, HonorLunas, PengaturanApp) telah berhasil disinkronkan ke Google Sheets.',
            type: 'success'
          });
        } else {
          showAppAlert({
            title: 'Gagal Terhubung',
            message: `Gagal terhubung ke Google Sheets: ${res.message || 'Cek URL Web App'}`,
            type: 'error'
          });
        }
      } else {
        showAppAlert({
          title: 'Tersimpan Lokal',
          message: 'Data berhasil disinkronkan di penyimpanan lokal browser. (URL Google Sheets belum diatur di menu Pengaturan).',
          type: 'info'
        });
      }
    } catch (err: any) {
      showAppAlert({
        title: 'Gagal Sinkronisasi',
        message: `Sinkronisasi lokal berhasil, namun gagal terhubung ke Google Sheets: ${err.message || 'Cek URL Web App'}`,
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Pelunasan Honor: Simpan riwayat HonorLunas, tandai pekerjaan lunas, dan sinkronkan ke Google Sheets
  const handleSaveHonorLunas = async (newSettlements: HonorLunasRecord[], updatedJobs: JobRecord[], updatedPotongan: PotonganManual[]) => {
    // Deduplicate by ID against both storage and current state
    const existingList = StorageService.getHonorLunas();
    const settlementMap = new Map<string, HonorLunasRecord>();
    existingList.forEach(item => { if (item?.id) settlementMap.set(item.id, item); });
    honorLunasList.forEach(item => { if (item?.id) settlementMap.set(item.id, item); });
    newSettlements.forEach(item => { if (item?.id) settlementMap.set(item.id, item); });
    const combinedSettlements = Array.from(settlementMap.values());

    setHonorLunasList(combinedSettlements);
    StorageService.saveHonorLunas(combinedSettlements);

    if (updatedJobs && updatedJobs.length > 0) {
      setJobs(updatedJobs);
      StorageService.saveJobs(updatedJobs);
    }
    if (updatedPotongan && updatedPotongan.length > 0) {
      setPotonganManualList(updatedPotongan);
      StorageService.savePotonganManual(updatedPotongan);
    }

    // Sync to backend server
    await StorageService.syncServerState({
      jobs: updatedJobs || jobs,
      potonganManualList: updatedPotongan || potonganManualList,
      honorLunasList: combinedSettlements
    });

    // Sync to Google Sheets if connected
    if (settings.googleAppsScriptUrl) {
      try {
        const payload = buildGoogleSheetsSyncPayload({
          servers,
          wilayah: wilayahList,
          jenisList,
          employees,
          jobs: updatedJobs || jobs,
          planningTasks,
          attendanceList,
          potonganManualList: updatedPotongan || potonganManualList,
          honorLunasList: combinedSettlements,
          settings
        });
        await sendToGoogleAppsScript(settings.googleAppsScriptUrl, payload);
      } catch (err) {
        console.warn('Sync honor lunas to Google Sheets failed:', err);
      }
    }
  };

  // Batalkan / Rollback pelunasan honor jika diperlukan
  const handleDeleteHonorLunas = async (settlementId: string) => {
    const target = honorLunasList.find(hl => hl.id === settlementId);
    if (!target) return;

    const remaining = honorLunasList.filter(hl => hl.id !== settlementId);
    setHonorLunasList(remaining);
    StorageService.saveHonorLunas(remaining);

    // Unmark settled jobs
    const targetJobIds = new Set(target.jobIds || []);
    const updatedJobs = jobs.map(j => {
      if (targetJobIds.has(j.id) || j.honorLunasId === settlementId) {
        const { isHonorLunas, honorLunasId, honorLunasAt, ...rest } = j;
        return rest as JobRecord;
      }
      return j;
    });
    setJobs(updatedJobs);
    StorageService.saveJobs(updatedJobs);

    // Unmark settled potongan
    const targetPotonganIds = new Set(target.potonganIds || []);
    const updatedPotongan = potonganManualList.map(pm => {
      if (targetPotonganIds.has(pm.id) || pm.honorLunasId === settlementId) {
        const { isLunas, honorLunasId, ...rest } = pm;
        return rest as PotonganManual;
      }
      return pm;
    });
    setPotonganManualList(updatedPotongan);
    StorageService.savePotonganManual(updatedPotongan);

    // Sync to server & sheets
    await StorageService.syncServerState({
      jobs: updatedJobs,
      potonganManualList: updatedPotongan,
      honorLunasList: remaining
    });

    if (settings.googleAppsScriptUrl) {
      try {
        const payload = buildGoogleSheetsSyncPayload({
          servers,
          wilayah: wilayahList,
          jenisList,
          employees,
          jobs: updatedJobs,
          planningTasks,
          attendanceList,
          potonganManualList: updatedPotongan,
          honorLunasList: remaining,
          settings
        });
        await sendToGoogleAppsScript(settings.googleAppsScriptUrl, payload);
      } catch (err) {
        console.warn('Sync rollback honor lunas to sheets failed:', err);
      }
    }
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
    StorageService.syncServerSettings(newSettings);

    let updatedEmployees = employees;
    if (newSettings.adminUsername || newSettings.adminPassword) {
      const adminIdx = employees.findIndex(e => e.role === 'Admin');
      if (adminIdx >= 0) {
        const copy = [...employees];
        copy[adminIdx] = {
          ...copy[adminIdx],
          username: newSettings.adminUsername || copy[adminIdx].username,
          password: newSettings.adminPassword || copy[adminIdx].password
        };
        updatedEmployees = copy;
      } else {
        const newAdmin: Employee = {
          id: 'emp-admin',
          namaLengkap: 'Administrator',
          username: newSettings.adminUsername || 'admin',
          password: newSettings.adminPassword || 'admin123',
          role: 'Admin',
          status: 'Tetap',
          honorTetapBulanan: 0,
          wilayahHandledIds: [],
          bonusTargetBulanan: 0,
          kontak: '-',
          isOnline: true
        };
        updatedEmployees = [newAdmin, ...employees];
      }
      setEmployees(updatedEmployees);
      StorageService.saveEmployees(updatedEmployees);
    }

    // Also sync server state
    StorageService.syncServerState({
      servers,
      wilayah: wilayahList,
      jenisList,
      employees: updatedEmployees,
      jobs,
      planningTasks,
      attendanceList,
      settings: newSettings
    });

    // Direct immediate POST sync to Google Sheets if Apps Script URL is set
    if (newSettings.googleAppsScriptUrl && newSettings.googleAppsScriptUrl.trim()) {
      setIsSyncing(true);
      try {
        // Send dedicated savePengaturan action
        await sendToGoogleAppsScript(newSettings.googleAppsScriptUrl, {
          action: 'savePengaturan',
          settings: newSettings
        });

        // Send full database payload
        const payload = buildGoogleSheetsSyncPayload({
          servers,
          wilayah: wilayahList,
          jenisList,
          employees: updatedEmployees,
          jobs,
          planningTasks,
          attendanceList,
          potonganManualList,
          settings: newSettings
        });

        const res = await sendToGoogleAppsScript(newSettings.googleAppsScriptUrl, payload);
        if (res.success) {
          setSettings(prev => ({ ...prev, googleAppsScriptUrl: newSettings.googleAppsScriptUrl.trim(), isGoogleSheetConnected: true }));
        } else {
          throw new Error(res.message || 'Gagal mengirim data ke Google Sheets');
        }
      } catch (err) {
        console.warn('Gagal mengunggah Pengaturan ke Google Sheets:', err);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-800 font-sans antialiased flex flex-col">
      {/* 1. Login Modal if unauthenticated */}
      {!currentUser && (
        <LoginModal
          employees={employees}
          settings={settings}
          onLoginSuccess={handleLoginSuccess}
          isSyncing={isSyncing}
          onPullDatabase={handlePullDatabase}
        />
      )}

      {/* 2. Main App Frame */}
      {currentUser && (
        <>
          {/* Header */}
          <Header
            currentUser={currentUser}
            onOpenSidebar={() => setIsSidebarOpen(prev => !prev)}
            pendingApprovalsCount={pendingApprovalsCount}
            onNavigateApproval={() => handleSelectView('approval_absensi')}
            isSheetConnected={settings.isGoogleSheetConnected}
            onSyncDatabase={handleSyncDatabase}
            onPullDatabase={() => handlePullDatabase()}
            isSyncing={isSyncing}
            onOpenQuickAddJob={handleOpenQuickJobWithSOPCheck}
            logoUrl={settings.logoUrl}
            companyName={settings.namaPerusahaan}
            adminNotificationEvents={adminNotificationEvents}
            unreadEventsCount={unreadEventsCount}
            onMarkAllEventsRead={handleMarkAllEventsRead}
            onNavigateFromNotification={handleNavigateFromNotification}
            onLogout={handleLogout}
          />

          {/* Floating Notification Banner (Toast) for all devices */}
          <AdminNotificationToast
            event={activeToastAlert}
            onClose={() => setActiveToastAlert(null)}
            onClick={(evt) => {
              handleNavigateFromNotification(evt.type, evt.data);
              setActiveToastAlert(null);
            }}
          />

          {/* Main App Layout Container (Sidebar + Content) */}
          <div className="flex-1 flex w-full relative">
            {/* Sidebar Navigation */}
            <Sidebar
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
              activeView={activeView}
              onSelectView={view => handleSelectView(view)}
              currentUser={currentUser}
              onLogout={handleLogout}
              logoUrl={settings.logoUrl}
              companyName={settings.namaPerusahaan}
              pendingApprovalsCount={pendingApprovalsCount}
            />

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 pb-24 md:pb-12">
            {currentUser.role !== 'Teknisi' && activeView === 'dashboard' && (
              <DashboardView
                jobs={jobs}
                attendance={attendanceList}
                employees={employees}
                servers={servers}
                jenisList={jenisList}
                wilayahList={wilayahList}
                pendingApprovalsCount={pendingApprovalsCount}
                currentUser={currentUser}
                onNavigateApproval={() => handleSelectView('approval_absensi')}
                onNavigateJobs={() => handleSelectView('pekerjaan_daftar')}
                onNavigateRekapHonor={() => handleSelectView('rekap_honor')}
                onNavigateEmployees={() => handleSelectView('master_karyawan')}
                onNavigateServer={() => handleSelectView('master_server')}
                onApproveAllAttendance={handleApproveAllAttendance}
                onlineTechniciansFromHeartbeat={onlineTechniciansFromHeartbeat}
                onlineUsersFromHeartbeat={onlineUsersFromHeartbeat}
                onUpdateAttendance={handleUpdateAttendance}
              />
            )}

            {(currentUser.role === 'Teknisi'
              ? activeView === 'teknisi_dashboard' ||
                activeView === 'dashboard' ||
                activeView === 'pekerjaan_planning' ||
                activeView === 'approval_absensi' ||
                activeView === 'rekap_honor'
              : activeView === 'teknisi_dashboard') && (
              <TeknisiDashboardView
                currentUser={currentUser}
                employees={employees}
                attendanceList={attendanceList}
                jobs={jobs}
                planningTasks={planningTasks}
                servers={servers}
                jenisList={jenisList}
                wilayahList={wilayahList}
                settings={settings}
                potonganManualList={potonganManualList}
                activeMainTab={
                  activeView === 'pekerjaan_planning'
                    ? 'planning'
                    : activeView === 'approval_absensi'
                    ? 'absensi'
                    : activeView === 'rekap_honor'
                    ? 'gaji'
                    : 'beranda'
                }
                onMainTabChange={handleTeknisiMainTabChange}
                onCheckIn={handleCheckIn}
                onOpenQuickAddJob={handleOpenQuickJobWithSOPCheck}
                onRequestLeave={handleRequestLeave}
                leaveRequests={leaveRequests}
                onlineTechniciansFromHeartbeat={onlineTechniciansFromHeartbeat}
                onNavigateToPekerjaanDaftar={handleNavigateToPekerjaanDaftar}
                honorLunasList={honorLunasList}
              />
            )}

            {(activeView === 'master_server' ||
              activeView === 'master_wilayah' ||
              activeView === 'master_jenis_pekerjaan' ||
              activeView === 'master_karyawan') && (
              <MasterDataView
                initialTab={
                  activeView === 'master_server'
                    ? 'server'
                    : activeView === 'master_wilayah'
                    ? 'wilayah'
                    : activeView === 'master_jenis_pekerjaan'
                    ? 'jenis'
                    : 'karyawan'
                }
                servers={servers}
                wilayahList={wilayahList}
                jenisList={jenisList}
                employees={employees}
                currentUser={currentUser}
                onSaveServer={handleSaveServer}
                onDeleteServer={handleDeleteServer}
                onSaveWilayah={handleSaveWilayah}
                onDeleteWilayah={handleDeleteWilayah}
                onSaveJenis={handleSaveJenis}
                onDeleteJenis={handleDeleteJenis}
                onSaveEmployee={handleSaveEmployee}
                onDeleteEmployee={handleDeleteEmployee}
              />
            )}

            {((currentUser.role !== 'Teknisi' && (activeView === 'pekerjaan_daftar' || activeView === 'pekerjaan_planning')) ||
              (currentUser.role === 'Teknisi' && activeView === 'pekerjaan_daftar')) && (
              <MasterPekerjaanView
                initialTab={activeView === 'pekerjaan_daftar' ? 'daftar' : 'planning'}
                jobs={jobs}
                planningTasks={planningTasks}
                employees={employees}
                servers={servers}
                jenisList={jenisList}
                wilayahList={wilayahList}
                onSaveJob={handleSaveJob}
                onApproveLembur={handleApproveLembur}
                onDeleteJob={handleDeleteJob}
                onSavePlanning={handleSavePlanning}
                onDeletePlanning={handleDeletePlanning}
                currentUser={currentUser}
                googleAppsScriptUrl={settings.googleAppsScriptUrl}
                attendanceList={attendanceList}
                settings={settings}
                honorLunasList={honorLunasList}
              />
            )}

            {currentUser.role !== 'Teknisi' && (
              activeView === 'approval_absensi' ||
              activeView === 'approval_perlu' ||
              activeView === 'approval_harian' ||
              activeView === 'approval_izin' ||
              activeView === 'approval_histori'
            ) && (
              <ApprovalAbsensiView
                initialTab={
                  activeView === 'approval_harian'
                    ? 'absen_harian'
                    : activeView === 'approval_izin'
                    ? 'izin_cuti'
                    : activeView === 'approval_histori'
                    ? 'semua_data'
                    : 'perlu_approval'
                }
                onSelectTab={(tab) => {
                  const nextView: NavView =
                    tab === 'absen_harian'
                      ? 'approval_harian'
                      : tab === 'izin_cuti'
                      ? 'approval_izin'
                      : tab === 'semua_data'
                      ? 'approval_histori'
                      : 'approval_perlu';
                  handleSelectView(nextView);
                }}
                attendanceList={attendanceList}
                leaveRequests={leaveRequests}
                servers={servers}
                currentUser={currentUser}
                onApproveAttendance={handleApproveAttendance}
                onApproveLeave={handleApproveLeave}
                onDeleteAttendance={handleDeleteAttendance}
                onDeleteLeave={handleDeleteLeave}
                onClearAllAttendanceAndLeave={handleClearAllAttendanceAndLeave}
                onApproveAllAttendance={handleApproveAllAttendance}
                isSyncing={isSyncing}
                isSheetConnected={settings.isGoogleSheetConnected}
                onSyncDatabase={handleSyncDatabase}
                onUpdateAttendance={handleUpdateAttendance}
                onNavigateAbsenManual={() => handleSelectView('absen_manual_form')}
              />
            )}

            {currentUser.role === 'Admin' && (
              activeView === 'absen_manual' ||
              activeView === 'absen_manual_form' ||
              activeView === 'absen_manual_pekerjaan' ||
              activeView === 'absen_manual_riwayat'
            ) && (
              <AbsenManualView
                initialTab={
                  activeView === 'absen_manual_pekerjaan'
                    ? 'deteksi_masalah'
                    : activeView === 'absen_manual_riwayat'
                    ? 'riwayat'
                    : 'form'
                }
                onSelectTab={(tab) => {
                  const nextView: NavView =
                    tab === 'deteksi_masalah'
                      ? 'absen_manual_pekerjaan'
                      : tab === 'riwayat'
                      ? 'absen_manual_riwayat'
                      : 'absen_manual_form';
                  handleSelectView(nextView);
                }}
                employees={employees}
                servers={servers}
                attendanceList={attendanceList}
                jobs={jobs}
                currentUser={currentUser}
                onSaveAttendance={handleUpdateAttendance}
                onDeleteAttendance={handleDeleteAttendance}
                isSyncing={isSyncing}
                isSheetConnected={settings.isGoogleSheetConnected}
                onSyncDatabase={handleSyncDatabase}
              />
            )}

            {currentUser.role !== 'Teknisi' && activeView === 'rekap_honor' && (
              <HitungRekapHonorView
                employees={employees}
                servers={servers}
                wilayahList={wilayahList}
                jenisList={jenisList}
                jobs={jobs}
                attendance={attendanceList}
                potonganManualList={potonganManualList}
                onSavePotonganManual={handleSavePotonganManual}
                onDeletePotonganManual={handleDeletePotonganManual}
                honorLunasList={honorLunasList}
                onSaveHonorLunas={handleSaveHonorLunas}
                onDeleteHonorLunas={handleDeleteHonorLunas}
                onSyncDatabase={handleSyncDatabase}
                settings={settings}
                currentUser={currentUser}
                initialTab="rekap"
                onUpdateAttendance={handleUpdateAttendance}
                onNavigateAbsenManual={() => handleSelectView('absen_manual_form')}
              />
            )}

            {currentUser.role !== 'Teknisi' && activeView === 'potongan_manual' && (
              <PotonganManualView
                employees={employees}
                servers={servers}
                potonganManualList={potonganManualList}
                onSavePotonganManual={handleSavePotonganManual}
                onDeletePotonganManual={handleDeletePotonganManual}
                onSyncDatabase={handleSyncDatabase}
                currentUser={currentUser}
                settings={settings}
              />
            )}

            {currentUser.role === 'Admin' && (
              activeView === 'pengaturan' ||
              activeView === 'pengaturan_profil' ||
              activeView === 'pengaturan_jam_kerja' ||
              activeView === 'pengaturan_notifikasi' ||
              activeView === 'pengaturan_google_sheets' ||
              activeView === 'pengaturan_panduan_sheets'
            ) && (
              <PengaturanView
                initialTab={
                  activeView === 'pengaturan_jam_kerja'
                    ? 'jam_kerja'
                    : activeView === 'pengaturan_notifikasi'
                    ? 'notifikasi'
                    : activeView === 'pengaturan_google_sheets'
                    ? 'google_sheets'
                    : activeView === 'pengaturan_panduan_sheets'
                    ? 'panduan_sheets'
                    : 'profil'
                }
                onSelectTab={(tab) => {
                  const nextView: NavView =
                    tab === 'jam_kerja'
                      ? 'pengaturan_jam_kerja'
                      : tab === 'notifikasi'
                      ? 'pengaturan_notifikasi'
                      : tab === 'google_sheets'
                      ? 'pengaturan_google_sheets'
                      : tab === 'panduan_sheets'
                      ? 'pengaturan_panduan_sheets'
                      : 'pengaturan_profil';
                  handleSelectView(nextView);
                }}
                settings={settings}
                onSaveSettings={handleSaveSettings}
                onTestGoogleSheetsConnection={handleTestGoogleSheetsConnection}
                onPullDatabase={handlePullDatabase}
                onSyncDatabase={handleSyncDatabase}
                isSyncing={isSyncing}
                onClearLocalCacheAndReload={handleClearLocalDataAndSync}
              />
            )}
          </main>
          </div>

          {/* Smartphone First Bottom Navigation Bar */}
          <BottomNav
            activeView={activeView}
            onSelectView={handleSelectView}
            onOpenQuickAddJob={handleOpenQuickJobWithSOPCheck}
            userRole={currentUser?.role}
          />

          {/* PWA Installation Banner / Prompt */}
          <PWAInstallPrompt
            appName={settings.namaAplikasi || 'DPT-AlaDin'}
            logoUrl={settings.logoUrl}
          />

          {/* Unified Input Job Modal (Triggered by BottomNav center button or Technician actions) */}
          {isQuickJobModalOpen && (
            <JobModal
              isOpen={isQuickJobModalOpen}
              onClose={() => setIsQuickJobModalOpen(false)}
              onSaveJob={async (job) => {
                const res = await handleSaveJob(job);
                if (res && (res as any).success === false) return res;
                setIsQuickJobModalOpen(false);
                return res;
              }}
              employees={employees}
              servers={servers}
              jenisList={jenisList}
              wilayahList={wilayahList}
              currentUser={currentUser}
              googleAppsScriptUrl={settings.googleAppsScriptUrl}
              attendanceList={attendanceList}
              settings={settings}
            />
          )}
        </>
      )}

      {/* Maroon Theme Loading Overlay for Initial Boot & Menu Navigations */}
      <MaroonLoadingOverlay
        isOpen={loadingOverlay.isOpen}
        title={loadingOverlay.title}
        message={loadingOverlay.message}
        logoUrl={settings.logoUrl}
        companyName={settings.namaPerusahaan}
        onDismiss={() => setLoadingOverlay(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Global Modern App Dialog */}
      <AppDialog />
    </div>
  );
}
