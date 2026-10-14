import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Clock,
  Database,
  Save,
  RefreshCw,
  Copy,
  Check,
  Code,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Download,
  Trash2,
  Bell,
  Send,
  Smartphone,
  Volume2,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Layers,
  ChevronRight,
  Calendar,
  CalendarOff,
  CalendarCheck,
  Plus,
  Laptop,
  Monitor
} from 'lucide-react';
import { AppSettings } from '../types';
import { NumericInput } from '../components/NumericInput';
import {
  GOOGLE_SHEETS_SCHEMA,
  GOOGLE_APPS_SCRIPT_CODE,
  sendToGoogleAppsScript
} from '../services/googleSheetsHelper';
import { NotificationService } from '../services/notificationService';
import { pwaManager } from '../utils/pwaManager';

export type PengaturanTab = 'profil' | 'jam_kerja' | 'notifikasi' | 'google_sheets' | 'panduan_sheets';

interface PengaturanViewProps {
  initialTab?: PengaturanTab;
  onSelectTab?: (tab: PengaturanTab) => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onTestGoogleSheetsConnection: (url: string) => Promise<boolean>;
  onPullDatabase?: (urlOverride?: string) => Promise<boolean>;
  onSyncDatabase?: () => Promise<any> | void;
  isSyncing?: boolean;
  onClearLocalCacheAndReload?: () => void;
}

const PengaturanViewComponent: React.FC<PengaturanViewProps> = ({
  initialTab = 'profil',
  onSelectTab,
  settings,
  onSaveSettings,
  onTestGoogleSheetsConnection,
  onPullDatabase,
  onSyncDatabase,
  isSyncing = false,
  onClearLocalCacheAndReload
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<PengaturanTab>(initialTab);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayNote, setNewHolidayNote] = useState('');

  // Sync internal form state whenever settings prop updates
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  // Sync tab with initialTab prop from sidebar navigation
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: PengaturanTab) => {
    setActiveTab(tab);
    onSelectTab?.(tab);
  };

  // WhatsApp & Push Notification test state
  const [testPhone, setTestPhone] = useState('08');
  const [isTestingWa, setIsTestingWa] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
    NotificationService.getPermissionStatus()
  );

  const handleRequestPushPermission = async () => {
    const res = await NotificationService.requestPermission();
    setPermissionState(res);
  };

  const handleTestChimeAndNotification = async () => {
    NotificationService.playChimeSound();
    await NotificationService.sendSystemNotification('🚨 [Uji Coba] Notifikasi Tugas Planning Baru', {
      body: 'Ini adalah tampilan notifikasi pada HP & Desktop teknisi saat Anda menugaskan planning baru.',
      tag: 'test-notification'
    });
  };

  const handleTestWhatsAppSend = async () => {
    if (!testPhone || testPhone.length < 8) {
      setWaTestResult({
        success: false,
        message: 'Masukkan nomor WhatsApp tujuan yang valid (contoh: 081234567890).'
      });
      return;
    }

    setIsTestingWa(true);
    setWaTestResult(null);

    try {
      const msg = `🔔 *[UJI COBA NOTIFIKASI]*\n\nHalo Teknisi! Ini adalah pesan uji coba integrasi WhatsApp Gateway dari ${form.namaPerusahaan || 'DPT-AlaDin RT/RW Net'}.\n\nNotifikasi planning tugas baru akan dikirim secara otomatis ke nomor ini saat admin membuat planning.`;
      const res = await NotificationService.sendWhatsAppViaGateway(testPhone, msg, form);
      setWaTestResult(res);
    } catch (err: any) {
      setWaTestResult({
        success: false,
        message: err.message || 'Gagal mengirim pesan uji coba WhatsApp'
      });
    } finally {
      setIsTestingWa(false);
    }
  };

  const doSaveSettings = async (customForm?: AppSettings) => {
    const targetForm = customForm || form;
    let logoUrlToSave = targetForm.logoUrl || '';

    setIsSaving(true);
    setSaveBanner(null);

    // If logo is a base64 image and Apps Script URL is set, try auto-uploading to Google Drive
    if (logoUrlToSave.startsWith('data:image/') && targetForm.googleAppsScriptUrl?.trim()) {
      try {
        const uploadRes = await sendToGoogleAppsScript(targetForm.googleAppsScriptUrl, {
          action: 'uploadImage',
          base64Data: logoUrlToSave,
          filename: 'logo_perusahaan.jpg',
          folderName: 'DPT_AlaDin_Logo'
        });
        if (uploadRes.success && uploadRes.data?.fileUrl) {
          logoUrlToSave = uploadRes.data.fileUrl;
        }
      } catch (e) {
        console.warn('Auto upload logo to Drive failed:', e);
      }
    }

    const cleanedForm: AppSettings = {
      ...targetForm,
      logoUrl: logoUrlToSave,
      namaPerusahaan: targetForm.namaPerusahaan?.trim() || 'DPT AlaDin',
      adminUsername: targetForm.adminUsername?.trim() || 'admin',
      adminPassword: targetForm.adminPassword?.trim() || 'admin123',
      googleAppsScriptUrl: targetForm.googleAppsScriptUrl?.trim() || '',
      jumlahCutiMaksimalPerBulan: Number(targetForm.jumlahCutiMaksimalPerBulan) || 2,
      totalCutiPerTahun: Number(targetForm.totalCutiPerTahun) || 12
    };

    setForm(cleanedForm);

    try {
      await onSaveSettings(cleanedForm);
      if (cleanedForm.googleAppsScriptUrl) {
        setSaveBanner('Pengaturan berhasil disimpan & otomatis dikirim ke sheet PengaturanApp di Google Sheets!');
      } else {
        setSaveBanner('Pengaturan disimpan di lokal browser. Catatan: URL Google Apps Script belum diisi di tab "Integrasi Google Sheets".');
      }
    } catch (err: any) {
      setSaveBanner(`Gagal menyimpan: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveBanner(null), 5000);
    }
  };

  const handleTestConnection = async () => {
    const trimmedUrl = form.googleAppsScriptUrl?.trim() || '';
    if (!trimmedUrl) {
      setTestResult({
        success: false,
        message: 'Masukkan URL Google Apps Script Web App terlebih dahulu.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const ok = await onTestGoogleSheetsConnection(trimmedUrl);
      if (ok) {
        setTestResult({
          success: true,
          message: 'Berhasil terhubung ke Google Sheets Database!'
        });
        const updatedForm = { ...form, googleAppsScriptUrl: trimmedUrl, isGoogleSheetConnected: true };
        setForm(updatedForm);
        onSaveSettings(updatedForm);
      } else {
        setTestResult({
          success: false,
          message: 'Gagal terhubung. Pastikan Web App disetel ke "Anyone" (Siapa saja).'
        });
        const updatedForm = { ...form, googleAppsScriptUrl: trimmedUrl, isGoogleSheetConnected: false };
        setForm(updatedForm);
        onSaveSettings(updatedForm);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Error koneksi: ${err.message || 'Terjadi kesalahan'}`
      });
      const updatedForm = { ...form, isGoogleSheetConnected: false };
      setForm(updatedForm);
      onSaveSettings(updatedForm);
    } finally {
      setIsTesting(false);
    }
  };

  const copyAppsScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const subMenus = [
    {
      id: 'profil' as PengaturanTab,
      label: 'Profil Perusahaan',
      icon: Building,
      badge: 'Utama',
      desc: 'Nama, alamat, logo & akun admin'
    },
    {
      id: 'jam_kerja' as PengaturanTab,
      label: 'Jam Kerja & Potongan',
      icon: Clock,
      desc: 'Jam kerja & denda keterlambatan'
    },
    {
      id: 'notifikasi' as PengaturanTab,
      label: 'Notifikasi & Whatsapp Gateway',
      icon: Bell,
      desc: 'Push notif HP & WhatsApp bot'
    },
    {
      id: 'google_sheets' as PengaturanTab,
      label: 'Integrasi Google Sheet',
      icon: Database,
      badge: form.isGoogleSheetConnected ? 'Connected' : 'Offline',
      desc: 'Sinkronisasi database spreadsheet'
    },
    {
      id: 'panduan_sheets' as PengaturanTab,
      label: 'Struktur Column & Code Apps Script',
      icon: Code,
      desc: 'Script Code.gs & panduan kolom'
    }
  ];

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto">
      {/* 1. Header & Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-maroon-100 text-maroon-900 border border-maroon-200">
              Konfigurasi Sistem
            </span>
            {form.isGoogleSheetConnected ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Sheets Terhubung</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Penyimpanan Lokal Browser
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1.5 flex items-center gap-2">
            <Settings className="w-6 h-6 text-maroon-800" />
            <span>Pengaturan Aplikasi & Database</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => doSaveSettings()}
            className="px-4 py-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-rose-200" />
            ) : (
              <Save className="w-4 h-4 text-rose-200" />
            )}
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
          </button>
        </div>
      </div>

      {/* 2. Success Banner */}
      {saveBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold rounded-2xl flex items-start justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-emerald-950">Berhasil Disimpan</p>
              <p className="mt-0.5 text-emerald-800">{saveBanner}</p>
            </div>
          </div>
          <button
            onClick={() => setSaveBanner(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold px-2 py-1 text-xs"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 3. Sub Menu Bar (Clean & Organized) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {subMenus.map(sub => {
            const Icon = sub.icon;
            const isActive = activeTab === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleTabChange(sub.id)}
                className={`flex flex-col items-start p-2.5 rounded-xl transition-all text-left cursor-pointer ${
                  isActive
                    ? 'bg-maroon-800 text-white shadow-xs font-bold'
                    : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className={`p-1.5 rounded-lg ${isActive ? 'bg-white/15 text-white' : 'bg-white text-maroon-800 shadow-2xs'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {sub.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : sub.badge === 'Connected'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {sub.badge}
                    </span>
                  )}
                </div>
                <span className={`text-xs leading-snug line-clamp-1 ${isActive ? 'text-white' : 'text-slate-800 font-semibold'}`}>
                  {sub.label}
                </span>
                <span className={`text-[10px] mt-0.5 line-clamp-1 ${isActive ? 'text-rose-200' : 'text-slate-400'}`}>
                  {sub.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Sub Page Contents */}
      <div>
        {/* SUB 1: PROFIL PERUSAHAAN */}
        {activeTab === 'profil' && (
          <div className="space-y-6">
            {/* Card 1: Identitas Perusahaan */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Building className="w-5 h-5 text-maroon-800" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Informasi Dasar & Identitas Perusahaan</h3>
                  <p className="text-[11px] text-slate-500">Nama dan alamat ini tampil pada Kop Surat Laporan, Slip Gaji Teknisi, dan Header Aplikasi.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Nama Perusahaan / RT-RW Net</label>
                  <input
                    type="text"
                    value={form.namaPerusahaan}
                    onChange={e => setForm({ ...form, namaPerusahaan: e.target.value })}
                    placeholder="Contoh: DPT AlaDin"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-maroon-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Digunakan sebagai judul kop resmi slip honor dan banner aplikasi.</p>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Alamat Kantor / Server Pusat</label>
                  <textarea
                    rows={2}
                    value={form.alamatPerusahaan}
                    onChange={e => setForm({ ...form, alamatPerusahaan: e.target.value })}
                    placeholder="Alamat lengkap kantor operasional atau server utama..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-maroon-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Logo & Icon Aplikasi */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Logo Perusahaan & Ikon Aplikasi (PWA)</h3>
                  <p className="text-[11px] text-slate-500">Logo otomatis disinkronkan ke Web App Manifest HP, Favicon, dan Kop Surat Cetak.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex flex-col items-center space-y-2 shrink-0">
                  <div className="w-24 h-24 bg-white border border-slate-300 rounded-2xl flex items-center justify-center p-2 overflow-hidden shadow-xs">
                    {form.logoUrl ? (
                      <img src={form.logoUrl} alt="Logo Perusahaan" className="w-full h-full object-contain" />
                    ) : (
                      <Building className="w-12 h-12 text-slate-300" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                    Preview Ikon Layar HP
                  </span>
                </div>

                <div className="flex-1 space-y-3 w-full text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3.5 py-2 bg-maroon-800 hover:bg-maroon-900 text-white font-bold text-xs rounded-xl cursor-pointer inline-flex items-center space-x-1.5 shadow-xs transition-all active:scale-95">
                      <Building className="w-4 h-4 text-rose-300" />
                      <span>Upload File Logo Baru</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const b64 = reader.result as string;
                              setForm({ ...form, logoUrl: b64 });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    {form.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, logoUrl: '' })}
                        className="px-3 py-2 bg-slate-200 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        title="Hapus Logo"
                      >
                        Reset Logo
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 font-bold uppercase mb-1">
                      Atau Masukkan URL Gambar Logo Online:
                    </label>
                    <input
                      type="text"
                      value={form.logoUrl}
                      onChange={e => setForm({ ...form, logoUrl: e.target.value })}
                      placeholder="https://.../logo.png atau link Google Drive / PostImages"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                    />
                  </div>

                  <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl text-[11px] text-blue-900 space-y-1">
                    <p className="font-bold flex items-center space-x-1 text-blue-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Otomatis Sinkron ke Seluruh Fitur:</span>
                    </p>
                    <p className="text-slate-600 text-[10px]">
                      Logo yang tersimpan otomatis menjadi ikon aplikasi saat teknisi menambahkan aplikasi ke layar utama (Add to Home Screen), serta muncul pada kop surat cetak PDF.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: PWA & Instalasi Desktop PC (Shortcut Windows) / Smartphone */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white border border-slate-700/80 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-white text-sm">Instalasi Aplikasi Desktop PC & HP (PWA)</h3>
                      {pwaManager.isInstalled() ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Terpasang
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                          Siap Dipasang
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Buka aplikasi dalam jendela desktop mandiri & buat shortcut icon di Desktop PC Windows Anda.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => pwaManager.openModal()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer shrink-0 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>{pwaManager.isInstalled() ? 'Buka Panduan / Info' : 'Pasang di Desktop PC / HP'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-400 font-bold text-xs">
                    <Monitor className="w-4 h-4" />
                    <span>Shortcut Desktop PC</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Setelah dipasang di Chrome / Edge PC Windows, icon aplikasi akan otomatis muncul di Desktop & Start Menu komputer.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                    <Smartphone className="w-4 h-4" />
                    <span>Layar Utama HP</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Teknisi lapangan dapat menginstal aplikasi di Android & iOS tanpa Play Store / App Store dengan akses offline.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>Aplikasi Mandiri</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Tampilan bersih tanpa bar navigasi browser, waktu loading instan, dan notifikasi real-time terintegrasi.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 4: Konfigurasi User Login Admin */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Akses & Keamanan Akun Login Administrator</h3>
                  <p className="text-[11px] text-slate-500">Kredensial login admin pusat. Perubahan otomatis disinkronkan ke Google Sheets.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Username Admin</label>
                  <input
                    type="text"
                    value={form.adminUsername || 'admin'}
                    onChange={e => setForm({ ...form, adminUsername: e.target.value })}
                    placeholder="admin"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Password Admin</label>
                  <input
                    type="text"
                    value={form.adminPassword || 'admin123'}
                    onChange={e => setForm({ ...form, adminPassword: e.target.value })}
                    placeholder="admin123"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Pemeliharaan Cache Browser */}
            {onClearLocalCacheAndReload && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    <span>Pembersihan Cache Lokal Browser</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Gunakan opsi ini jika data di perangkat terasa tidak up-to-date atau ingin me-reload data murni dari database Google Sheets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearLocalCacheAndReload}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition-all shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bersihkan Cache & Reload</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* SUB 2: JAM KERJA & POTONGAN */}
        {activeTab === 'jam_kerja' && (
          <div className="space-y-6">
            {/* Card 1: Jam Kerja Operasional */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Clock className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Jam Kerja Operasional Standar</h3>
                  <p className="text-[11px] text-slate-500">Jadwal standar absensi masuk dan kepulangan teknisi harian.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Jam Masuk Standar</label>
                  <input
                    type="time"
                    value={form.jamMasukDefinisikan}
                    onChange={e => setForm({ ...form, jamMasukDefinisikan: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Contoh: 08:00 WIB</p>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Jam Pulang Standar</label>
                  <input
                    type="time"
                    value={form.jamPulangDefinisikan}
                    onChange={e => setForm({ ...form, jamPulangDefinisikan: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Contoh: 17:00 WIB</p>
                </div>
              </div>
            </div>

            {/* Card 2: Aturan Keterlambatan & Denda Potongan */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <AlertCircle className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Aturan Toleransi & Denda Potongan Keterlambatan</h3>
                  <p className="text-[11px] text-slate-500">Konfigurasi batas toleransi menit dan nominal denda yang otomatis memotong honor teknisi.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Toleransi Keterlambatan (Menit)</label>
                  <NumericInput
                    value={form.toleransiKeterlambatanMenit}
                    onChange={val => setForm({ ...form, toleransiKeterlambatanMenit: val })}
                    min={0}
                    suffix="menit"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Batas aman absensi masuk tanpa potongan (contoh: 15 menit).
                  </p>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Besaran Potongan per Keterlambatan (Rp)</label>
                  <NumericInput
                    value={form.potonganPerKeterlambatan}
                    onChange={val => setForm({ ...form, potonganPerKeterlambatan: val })}
                    min={0}
                    prefix="Rp "
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Nominal denda otomatis saat terlambat melewati batas toleransi.
                  </p>
                </div>
              </div>

              {/* Simulation Box */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Simulasi Aturan:</span>
                </span>
                <p className="mt-1 text-[11px] text-amber-800/90 leading-relaxed">
                  Jika jam masuk standar <strong>{form.jamMasukDefinisikan || '08:00'}</strong> dengan toleransi <strong>{form.toleransiKeterlambatanMenit || 15} menit</strong>, maka teknisi yang absen setelah jam <strong>08:{String(form.toleransiKeterlambatanMenit || 15).padStart(2, '0')}</strong> otomatis berstatus <em>Terlambat</em>, membutuhkan approval Admin, dan dikenakan potongan sebesar <strong>Rp {(form.potonganPerKeterlambatan || 0).toLocaleString('id-ID')}</strong> pada slip gaji.
                </p>
              </div>
            </div>

            {/* Card 3: Pengaturan Hari Libur & Aturan Lembur Otomatis */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <CalendarOff className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Pengaturan Hari Libur & Lembur Otomatis</h3>
                  <p className="text-[11px] text-slate-500">Konfigurasi hari libur mingguan serta tanggal libur khusus/nasional.</p>
                </div>
              </div>

              {/* Banner Aturan Hari Libur */}
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-rose-800">
                  <Sparkles className="w-4 h-4 text-rose-600" />
                  <span>Aturan Otomatis Sistem pada Hari Libur:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-rose-800/90 space-y-1 pl-1">
                  <li><strong>Absensi Perlu Approval Admin:</strong> Teknisi yang melakukan absen pada hari libur otomatis berstatus <em>Pending Approval</em> dan membutuhkan persetujuan Admin.</li>
                  <li><strong>Semua Pekerjaan Otomatis ACC Lembur:</strong> Setiap pekerjaan/tugas yang diinput pada hari libur otomatis disetujui sebagai <em>Lembur (ACC Lembur)</em> dan dihitung pada rekap gaji teknisi.</li>
                </ul>
              </div>

              {/* 1. Hari Libur Mingguan (Senin - Minggu) */}
              <div className="space-y-2">
                <label className="block text-slate-700 font-bold text-xs">
                  Pilih Hari Libur Mingguan Rutin:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((day) => {
                    const isSelected = (form.hariLibur || ['Minggu']).includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const current = form.hariLibur || ['Minggu'];
                          const next = isSelected
                            ? current.filter(d => d !== day)
                            : [...current, day];
                          setForm({ ...form, hariLibur: next.length > 0 ? next : ['Minggu'] });
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <Calendar className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        <span>{day}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full ${
                          isSelected ? 'bg-white/20 text-white' : 'text-slate-400'
                        }`}>
                          {isSelected ? 'Libur' : 'Kerja'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400">
                  Secara default sistem menetapkan hari <strong>Minggu</strong> sebagai hari libur operasional.
                </p>
              </div>

              {/* 2. Daftar Tanggal Libur Khusus / Nasional */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <label className="block text-slate-700 font-bold text-xs">
                  Daftar Tanggal Libur Khusus / Nasional (YYYY-MM-DD):
                </label>

                {/* Form Tambah Tanggal */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={e => setNewHolidayDate(e.target.value)}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Keterangan Libur (contoh: Libur Nasional / Cuti Bersama)"
                    value={newHolidayNote}
                    onChange={e => setNewHolidayNote(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newHolidayDate) return;
                      const entry = newHolidayNote.trim() ? `${newHolidayDate}|${newHolidayNote.trim()}` : newHolidayDate;
                      const current = form.tanggalLiburKhusus || [];
                      if (!current.some(c => c.split('|')[0] === newHolidayDate)) {
                        setForm({ ...form, tanggalLiburKhusus: [...current, entry] });
                      }
                      setNewHolidayDate('');
                      setNewHolidayNote('');
                    }}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Libur</span>
                  </button>
                </div>

                {/* List of Custom Holidays */}
                <div className="space-y-1.5 mt-2">
                  {(!form.tanggalLiburKhusus || form.tanggalLiburKhusus.length === 0) ? (
                    <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      Belum ada tanggal libur khusus / nasional yang ditambahkan.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {form.tanggalLiburKhusus.map((item, idx) => {
                        const [dateStr, note] = item.split('|');
                        return (
                          <div
                            key={idx}
                            className="p-2.5 bg-slate-50 hover:bg-rose-50/50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs transition-colors"
                          >
                            <div className="flex items-center space-x-2">
                              <CalendarOff className="w-4 h-4 text-rose-600 shrink-0" />
                              <div>
                                <p className="font-bold text-slate-800">{dateStr}</p>
                                <p className="text-[10px] text-slate-500">{note || 'Tanggal Libur Khusus'}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = (form.tanggalLiburKhusus || []).filter((_, i) => i !== idx);
                                setForm({ ...form, tanggalLiburKhusus: next });
                              }}
                              className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                              title="Hapus Tanggal Libur"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Acuan Pengaturan Jumlah & Kuota Cuti Karyawan / Teknisi */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center space-x-2">
                  <CalendarCheck className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Pengaturan Acuan Cuti Karyawan / Teknisi
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Sebagai acuan jumlah cuti dalam 1 tahun dan maksimal pengambilan cuti dalam 1 bulan (SOP Cuti).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* 1. Jumlah Cuti Maksimal per Bulan */}
                  <div>
                    <label className="block text-slate-700 font-bold text-xs mb-1.5">
                      Jumlah Cuti Maksimal per Bulan (Hari)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={form.jumlahCutiMaksimalPerBulan ?? 2}
                        onChange={e => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 0);
                          setForm({ ...form, jumlahCutiMaksimalPerBulan: val });
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                        placeholder="2"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-400 pointer-events-none">
                        Hari / Bulan
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Maksimal hari cuti yang dapat diambil karyawan dalam 1 bulan kalender (default: 2 hari).
                    </p>
                  </div>

                  {/* 2. Total Cuti per Tahun */}
                  <div>
                    <label className="block text-slate-700 font-bold text-xs mb-1.5">
                      Total Cuti per Tahun (Hari)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={form.totalCutiPerTahun ?? 12}
                        onChange={e => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 0);
                          setForm({ ...form, totalCutiPerTahun: val });
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                        placeholder="12"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-semibold text-slate-400 pointer-events-none">
                        Hari / Tahun
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Total kuota cuti tahunan karyawan / teknisi dalam 1 tahun kalender (default: 12 hari).
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl text-[11px] text-amber-900 flex items-start space-x-2">
                  <span className="text-sm">ℹ️</span>
                  <span>
                    <strong>Catatan SOP Cuti:</strong> Angka ini hanya sebagai acuan jumlah cuti dalam 1 tahun dan maksimal pengambilan cuti dalam 1 bulan untuk karyawan/teknisi.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB 3: NOTIFIKASI & WHATSAPP GATEWAY */}
        {activeTab === 'notifikasi' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-emerald-700" />
                <h4 className="font-extrabold text-emerald-950 text-sm">
                  Sistem Notifikasi Teknisi (Push Notif Layar HP & WhatsApp Gateway)
                </h4>
              </div>
              <p className="text-emerald-800 leading-relaxed text-[11px]">
                Fitur ini memastikan teknisi menerima pemberitahuan instan saat Admin atau Penanggung Jawab Server membuat <strong>Tugas Planning Baru</strong>, bahkan saat aplikasi sedang tidak dibuka.
              </p>
            </div>

            {/* Opsi Pengiriman Otomatis */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-2">
                Pengaturan Pemicu Notifikasi Otomatis
              </h4>

              <div className="space-y-3.5 text-xs">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoNotifyTechnicianOnPlanning !== false}
                    onChange={e => setForm({ ...form, autoNotifyTechnicianOnPlanning: e.target.checked })}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800">Kirim Notifikasi Otomatis saat Planning Baru Disimpan</span>
                    <p className="text-[11px] text-slate-500">
                      Sistem langsung menyiarkan tugas ke seluruh teknisi terkait ketika tombol Simpan Planning ditekan.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer pt-3 border-t border-slate-100">
                  <input
                    type="checkbox"
                    checked={form.notifyViaBrowserPush !== false}
                    onChange={e => setForm({ ...form, notifyViaBrowserPush: e.target.checked })}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800">Aktifkan Browser Push Notification & Suara Chime Alarm</span>
                    <p className="text-[11px] text-slate-500">
                      Menampilkan banner popup di layar HP / Desktop teknisi disertai nada dering alarm tugas.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer pt-3 border-t border-slate-100">
                  <input
                    type="checkbox"
                    checked={form.notifyViaWhatsApp !== false}
                    onChange={e => setForm({ ...form, notifyViaWhatsApp: e.target.checked })}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-800">Kirim Pesan WhatsApp Langsung ke Nomor HP Teknisi</span>
                    <p className="text-[11px] text-slate-500">
                      Mengirimkan rincian tugas, nama server, jenis pekerjaan, dan lokasi kerja ke WhatsApp teknisi.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Status Izin Notifikasi Perangkat */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Status Izin Notifikasi di Perangkat Ini</h4>
                    <p className="text-[11px] text-slate-500">Izin sistem browser pada HP / Laptop yang sedang Anda gunakan.</p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-xl text-[11px] font-bold ${
                    permissionState === 'granted'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : permissionState === 'denied'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {permissionState === 'granted'
                    ? '✅ Izin Aktif'
                    : permissionState === 'denied'
                    ? '❌ Izin Diblokir'
                    : '⚠️ Belum Diizinkan'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {permissionState !== 'granted' && (
                  <button
                    type="button"
                    onClick={handleRequestPushPermission}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Minta Izin Notifikasi Sekarang</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleTestChimeAndNotification}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-300 shadow-2xs cursor-pointer active:scale-95 transition-all"
                >
                  <Volume2 className="w-4 h-4 text-indigo-600" />
                  <span>Uji Coba Suara Alarm & Banner</span>
                </button>
              </div>
            </div>

            {/* Konfigurasi WhatsApp Gateway */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Konfigurasi WhatsApp Gateway (Fonnte / Wablas)</h4>
                  <p className="text-[11px] text-slate-500">Integrasikan token bot WhatsApp untuk pengiriman pesan otomatis ke teknisi.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Provider Gateway</label>
                  <select
                    value={form.waGatewayProvider || 'fonnte'}
                    onChange={e => setForm({ ...form, waGatewayProvider: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="fonnte">Fonnte API (Rekomendasi Indonesia - Free/Pro)</option>
                    <option value="wablas">Wablas API</option>
                    <option value="custom_webhook">Custom Webhook API / Bot</option>
                    <option value="direct">Direct WhatsApp Link Saja (Tanpa Token)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">API Token WhatsApp Gateway</label>
                  <input
                    type="password"
                    value={form.waApiToken || ''}
                    onChange={e => setForm({ ...form, waApiToken: e.target.value })}
                    placeholder="Masukkan Token Fonnte / Wablas..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {form.waGatewayProvider === 'fonnte' && (
                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-blue-900 flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold">Panduan Token Fonnte:</span>
                    <p className="text-slate-600 text-[10px] mt-0.5">
                      1. Buka <a href="https://fonnte.com" target="_blank" rel="noreferrer" className="text-blue-700 font-bold underline">fonnte.com</a>. 2. Scan QR dengan nomor WA bot Anda. 3. Salin API Token dari dashboard Fonnte dan tempel pada kolom di atas.
                    </p>
                  </div>
                  <a
                    href="https://fonnte.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold shrink-0 hover:bg-blue-700 flex items-center space-x-1"
                  >
                    <span>Buka Fonnte</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Uji Coba Pengiriman WA */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="font-bold text-slate-800 text-xs block">
                  Uji Coba Pengiriman Pesan WhatsApp ke Nomor HP:
                </span>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={testPhone}
                    onChange={e => setTestPhone(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="flex-1 p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleTestWhatsAppSend}
                    disabled={isTestingWa}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isTestingWa ? 'animate-spin' : ''}`} />
                    <span>{isTestingWa ? 'Mengirim...' : 'Kirim Pesan Uji Coba'}</span>
                  </button>
                </div>

                {waTestResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-center space-x-2 ${
                      waTestResult.success
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-rose-50 border-rose-300 text-rose-800'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="font-bold text-[11px]">{waTestResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB 4: INTEGRASI GOOGLE SHEETS */}
        {activeTab === 'google_sheets' && (
          <div className="space-y-6">
            {/* Connection Status Hero */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Google Sheets Live Database Integration</h3>
                    <p className="text-xs text-slate-500">Sinkronisasi dua arah real-time antara aplikasi DPT dengan spreadsheet Google Sheets Anda.</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {form.isGoogleSheetConnected ? (
                    <span className="px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-extrabold flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Terhubung (Online)</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-slate-100 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold">
                      Offline / Belum Terhubung
                    </span>
                  )}
                </div>
              </div>

              {/* URL Input */}
              <div className="space-y-1 text-xs">
                <label className="block text-slate-800 font-bold mb-1">
                  URL Google Apps Script Web App (Deployment URL)
                </label>
                <input
                  type="text"
                  value={form.googleAppsScriptUrl}
                  onChange={e => setForm({ ...form, googleAppsScriptUrl: e.target.value })}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-900 focus:ring-2 focus:ring-maroon-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  URL ini diperoleh setelah melakukan <em>Deploy &gt; New Deployment &gt; Web App</em> di editor Google Apps Script dengan izin akses <strong>"Who has access: Anyone"</strong>.
                </p>
              </div>

              {/* 2-Way Auto-Sync Status Info Box */}
              <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-emerald-900 shadow-2xs">
                <div className="p-1 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-emerald-950">Sinkronisasi Otomatis 2 Arah Aktif</h4>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Siap & Terhubung
                    </span>
                  </div>
                  <p className="text-emerald-800 text-[11px] mt-1 leading-relaxed">
                    Aplikasi otomatis menyinkronkan data secara 2 arah: setiap penambahan / perubahan data langsung dikirim ke Google Sheets, dan data terbaru dari Google Sheets otomatis diperbarui di latar belakang tanpa mengganggu kinerja.
                  </p>
                </div>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {onPullDatabase && (
                  <button
                    type="button"
                    onClick={() => onPullDatabase(form.googleAppsScriptUrl)}
                    disabled={isSyncing}
                    className="px-3.5 py-2.5 bg-maroon-700 hover:bg-maroon-800 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    title="Tarik Data Terbaru dari Google Sheets"
                  >
                    {isSyncing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{isSyncing ? 'Menarik Data...' : 'Tarik Data dari Sheets'}</span>
                  </button>
                )}

                {onSyncDatabase && (
                  <button
                    type="button"
                    onClick={() => onSyncDatabase()}
                    disabled={isSyncing}
                    className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    title="Kirim dan Sinkronkan Seluruh Data Lokal ke Google Sheets"
                  >
                    {isSyncing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4" />
                    )}
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Singkronkan Data ke Sheets'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Menguji...' : 'Uji Koneksi Database'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => doSaveSettings()}
                  disabled={isSaving}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan URL ke Pengaturan</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('panduan_sheets')}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center space-x-1.5 border border-slate-200 cursor-pointer"
                >
                  <Code className="w-4 h-4 text-purple-600" />
                  <span>Buka Script Code & Skema Kolom</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center space-x-2.5 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-bold text-xs">{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB 5: STRUKTUR COLUMN & CODE APPS SCRIPT */}
        {activeTab === 'panduan_sheets' && (
          <div className="space-y-6 text-xs">
            {/* Apps Script Code Box */}
            <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 space-y-4 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Kode Lengkap Google Apps Script (Code.gs)</h4>
                    <p className="text-[11px] text-slate-400">Salin dan tempelkan kode ini ke project Apps Script di spreadsheet Anda.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={copyAppsScript}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95 transition-all self-start sm:self-auto"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Berhasil Tersalin!' : 'Salin Script Code (Code.gs)'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-950 rounded-xl overflow-x-auto text-[11px] font-mono text-slate-300 max-h-72 border border-slate-800 leading-relaxed">
                {GOOGLE_APPS_SCRIPT_CODE}
              </pre>

              <div className="p-4 bg-slate-800/90 rounded-xl border border-slate-700 space-y-2">
                <p className="font-bold text-amber-300 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Petunjuk Deploy & Izin Folder Foto Google Drive:</span>
                </p>
                <ol className="list-decimal pl-5 space-y-1.5 text-slate-300 text-[11px]">
                  <li>Buka Spreadsheet Google Sheets Anda &gt; menu <strong>Extensions (Ekstensi)</strong> &gt; pilih <strong>Apps Script</strong>.</li>
                  <li>Hapus kode bawaan dan tempelkan kode yang disalin di atas ke file <strong>Code.gs</strong>.</li>
                  <li>Klik tombol <strong>Deploy</strong> (kanan atas) &gt; <strong>New Deployment (Penerapan Baru)</strong> &gt; pilih tipe <strong>Web app</strong>.</li>
                  <li>Atur <em>Execute as:</em> <strong>Me (email Anda)</strong> dan <em>Who has access:</em> <strong>Anyone (Siapa saja)</strong>.</li>
                  <li>Salin URL Web App yang dihasilkan lalu simpan di tab <strong>Integrasi Google Sheet</strong> pada aplikasi ini.</li>
                </ol>
              </div>
            </div>

            {/* Sheets Column Schema */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Struktur Sheet & Column Headers di Google Sheets</h4>
                  <p className="text-[11px] text-slate-500">Nama tab sheet dan nama header kolom yang digunakan oleh sistem secara otomatis.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {GOOGLE_SHEETS_SCHEMA.map(item => (
                  <div key={item.sheetName} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-maroon-800" />
                        <span>Tab:</span>
                        <code className="bg-maroon-100 text-maroon-900 px-2 py-0.5 rounded font-mono font-bold">
                          {item.sheetName}
                        </code>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{item.description}</p>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-[10px] font-mono text-slate-700 leading-relaxed overflow-x-auto">
                      <strong>Kolom:</strong> {item.columns.join(' | ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Bottom Sticky Save Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Settings className="w-4 h-4 text-maroon-800" />
          <span>Pastikan untuk menekan tombol simpan agar konfigurasi diperbarui di perangkat dan spreadsheet.</span>
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => doSaveSettings()}
          className="px-6 py-2.5 bg-maroon-800 hover:bg-maroon-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin text-rose-200" />
          ) : (
            <Save className="w-4 h-4 text-rose-200" />
          )}
          <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
        </button>
      </div>
    </div>
  );
};

export const PengaturanView: React.FC<PengaturanViewProps> = React.memo(PengaturanViewComponent);
