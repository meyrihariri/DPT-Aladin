import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  Monitor,
  X,
  Check,
  Share,
  Info,
  ExternalLink,
  Laptop,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { pwaManager } from '../utils/pwaManager';

interface PWAInstallPromptProps {
  appName?: string;
  logoUrl?: string;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  appName = 'DPT-AlaDin',
  logoUrl
}) => {
  const [isInstalled, setIsInstalled] = useState<boolean>(() => pwaManager.isInstalled());
  const [hasPrompt, setHasPrompt] = useState<boolean>(() => pwaManager.isInstallPromptAvailable());
  const [isModalOpen, setIsModalOpen] = useState<boolean>(() => pwaManager.isModalOpen());
  const [isDesktop, setIsDesktop] = useState<boolean>(() => pwaManager.isDesktop());
  const [isWindows, setIsWindows] = useState<boolean>(() => pwaManager.isWindows());
  const [isIOS, setIsIOS] = useState<boolean>(() => pwaManager.isIOS());

  const [dismissedBanner, setDismissedBanner] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pwa_dismissed') === 'true';
  });

  const [activeGuideTab, setActiveGuideTab] = useState<'pc' | 'android' | 'ios'>(() => {
    if (pwaManager.isDesktop()) return 'pc';
    if (pwaManager.isIOS()) return 'ios';
    return 'android';
  });

  useEffect(() => {
    const syncState = () => {
      setIsInstalled(pwaManager.isInstalled());
      setHasPrompt(pwaManager.isInstallPromptAvailable());
      setIsModalOpen(pwaManager.isModalOpen());
      setIsDesktop(pwaManager.isDesktop());
      setIsWindows(pwaManager.isWindows());
      setIsIOS(pwaManager.isIOS());
    };

    const unsubscribe = pwaManager.subscribe(syncState);
    syncState();
    return unsubscribe;
  }, []);

  const handleInstallClick = async () => {
    if (pwaManager.isInstallPromptAvailable()) {
      const success = await pwaManager.triggerInstall();
      if (!success) {
        pwaManager.openModal();
      }
    } else {
      pwaManager.openModal();
    }
  };

  const handleDismissBanner = () => {
    try {
      localStorage.setItem('pwa_dismissed', 'true');
    } catch {}
    setDismissedBanner(true);
  };

  const handleMarkAsInstalled = () => {
    pwaManager.markAsInstalled();
    setDismissedBanner(true);
  };

  const appIconSrc = logoUrl || '/icon.svg';

  return (
    <>
      {/* 1. BOTTOM POPUP BANNER (Shown if not standalone and not dismissed) */}
      {!isInstalled && !dismissedBanner && !isModalOpen && (
        <div className="fixed bottom-16 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-slate-900/95 text-white p-4 sm:p-5 rounded-3xl shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between space-x-3">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-white p-1 border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md">
                <img
                  src={appIconSrc}
                  alt={appName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/icon.svg';
                  }}
                />
              </div>

              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 bg-blue-500/30 text-blue-300 rounded-full border border-blue-400/20 uppercase tracking-wide flex items-center gap-1">
                    {isDesktop ? (
                      <>
                        <Monitor className="w-3 h-3 text-blue-400" />
                        <span>Aplikasi PC / Windows</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-3 h-3 text-blue-400" />
                        <span>Aplikasi Mandiri (PWA)</span>
                      </>
                    )}
                  </span>
                </div>
                <h3 className="font-extrabold text-white text-sm sm:text-base mt-1">
                  {isDesktop ? `Instal ${appName} di Desktop PC` : `Instal Aplikasi ${appName}`}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                  {isDesktop
                    ? 'Buka dalam jendela tersendiri dan buat icon Shortcut di Desktop PC Windows Anda.'
                    : 'Instal sebagai aplikasi mandiri di HP untuk kecepatan kerja teknisi di lapangan.'}
                </p>
              </div>
            </div>

            <button
              onClick={handleDismissBanner}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center space-x-2">
            <button
              onClick={handleInstallClick}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              {isDesktop ? <Laptop className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{isDesktop ? 'Pasang di Desktop PC' : 'Instal Sekarang'}</span>
            </button>

            <button
              onClick={() => pwaManager.openModal()}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
              title="Lihat Panduan Pemasangan"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Panduan</span>
            </button>
          </div>

          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={handleMarkAsInstalled}
              className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Sudah dipasang? <span className="underline font-bold text-slate-300">Jangan tampilkan lagi</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. RICH INSTALL MODAL / DIALOG (Can be opened anytime from Header/Sidebar/Settings) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 text-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-maroon-950 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white p-1 border border-slate-700 flex-shrink-0 flex items-center justify-center shadow-lg">
                  <img
                    src={appIconSrc}
                    alt={appName}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/icon.svg';
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded-full border border-rose-500/30 uppercase tracking-wider">
                      PWA Progressive Web App
                    </span>
                    {isInstalled && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Terpasang
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                    Instal Aplikasi {appName}
                  </h2>
                </div>
              </div>
              <button
                onClick={() => pwaManager.closeModal()}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Device Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-1.5 shrink-0">
              <button
                onClick={() => setActiveGuideTab('pc')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeGuideTab === 'pc'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Komputer / PC Windows</span>
              </button>
              <button
                onClick={() => setActiveGuideTab('android')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeGuideTab === 'android'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>HP Android</span>
              </button>
              <button
                onClick={() => setActiveGuideTab('ios')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeGuideTab === 'ios'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Share className="w-4 h-4" />
                <span>iPhone / iPad</span>
              </button>
            </div>

            {/* Modal Body with Guides */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm text-slate-300">
              {/* TAB 1: PC WINDOWS / CHROME / EDGE */}
              {activeGuideTab === 'pc' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-950/40 rounded-2xl border border-blue-800/50 space-y-2">
                    <div className="flex items-center gap-2 text-blue-400 font-extrabold text-sm">
                      <Laptop className="w-5 h-5" />
                      <span>Keuntungan Pasang di PC & Desktop Windows:</span>
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                      <li>Otomatis membuat <strong>Shortcut Aplikasi di Desktop PC</strong> & Start Menu Windows.</li>
                      <li>Berjalan seperti <strong>software desktop mandiri</strong> tanpa address bar browser yang mengganggu.</li>
                      <li>Performa jauh lebih ringan, cepat, dan notifikasi real-time aktif di Windows.</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-extrabold text-white text-xs uppercase tracking-wider text-slate-400">
                      Cara Memasang di PC & Membuat Shortcut Desktop:
                    </h4>

                    {/* Method 1: Omnibox Icon */}
                    <div className="p-3.5 bg-blue-950/40 rounded-xl border border-blue-800/60 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div className="text-xs">
                        <p className="font-bold text-white flex items-center gap-1.5">
                          <span>Melalui Ikon di Kolom URL (Address Bar) Chrome / Edge</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/30 text-blue-300 rounded font-semibold border border-blue-400/30">
                            Paling Cepat
                          </span>
                        </p>
                        <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                          Di sisi kanan kolom alamat URL browser Anda, klik ikon <strong>Komputer dengan panah ke bawah (🖥️⬇️)</strong>, lalu klik <strong>"Instal"</strong>. Icon shortcut aplikasi akan langsung dibuat di Desktop PC Windows Anda.
                        </p>
                      </div>
                    </div>

                    {/* Method 2: Menu Chrome */}
                    <div className="p-3.5 bg-slate-800/70 rounded-xl border border-slate-700/80 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div className="text-xs">
                        <p className="font-bold text-white">Melalui Menu Titik Tiga (⋮) Browser Chrome / Edge</p>
                        <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                          Klik ikon <strong>Titik Tiga (⋮)</strong> di sudut kanan atas browser &gt; pilih menu <strong>"Simpan dan Bagikan" (Save and Share)</strong> &gt; klik <strong>"Instal DPT-AlaDin - Manajemen Pekerjaan & Honor Teknisi..."</strong>.
                        </p>
                      </div>
                    </div>

                    {/* Method 3: Direct Button */}
                    <div className="p-3.5 bg-slate-800/70 rounded-xl border border-slate-700/80 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <div className="text-xs">
                        <p className="font-bold text-white">Tombol "Pasang di Desktop PC" di Bawah</p>
                        <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
                          Klik tombol <strong>"Pasang di Desktop PC"</strong> di bawah ini untuk langsung memicu kotak dialog konfirmasi instalasi dari browser.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ANDROID */}
              {activeGuideTab === 'android' && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-800/50 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm">
                      <Smartphone className="w-5 h-5" />
                      <span>Keuntungan Pasang di HP Android:</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Teknisi dapat membuka aplikasi dari Layar Utama HP seperti aplikasi Play Store, lengkap dengan fitur Presensi GPS Kamera, Tugas Planning, dan Notifikasi Pop-up.
                    </p>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <div>
                        <p className="font-bold text-white">Buka di Google Chrome / Edge Android</p>
                        <p className="text-slate-300 text-[11px] mt-0.5">
                          Pastikan Anda membuka tautan web aplikasi ini melalui browser Chrome.
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <div>
                        <p className="font-bold text-white">Tekan Tombol "Instal Sekarang" atau Titik Tiga (⋮)</p>
                        <p className="text-slate-300 text-[11px] mt-0.5">
                          Pilih menu <strong>"Tambahkan ke Layar Utama"</strong> atau <strong>"Instal Aplikasi"</strong>.
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <div>
                        <p className="font-bold text-white">Icon Aplikasi Muncul di Menu HP</p>
                        <p className="text-slate-300 text-[11px] mt-0.5">
                          Aplikasi siap digunakan kapan saja dengan 1 sentuhan.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: IOS */}
              {activeGuideTab === 'ios' && (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-950/40 rounded-2xl border border-amber-800/50 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                      <Share className="w-5 h-5" />
                      <span>Cara Instal di iPhone / iPad (Safari):</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Apple Safari menggunakan fitur "Add to Home Screen" untuk memasang Progressive Web App.
                    </p>
                  </div>

                  <ol className="space-y-2.5 text-xs text-slate-300 list-decimal list-inside">
                    <li className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80">
                      Buka website aplikasi ini menggunakan browser <strong>Safari</strong> di iPhone Anda.
                    </li>
                    <li className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80">
                      Ketuk tombol <strong>Bagikan (Share Icon ⎋ / Kotak Panah Atas)</strong> di bilah navigasi bawah Safari.
                    </li>
                    <li className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80">
                      Gulir ke bawah dan pilih menu <strong>"Tambah ke Layar Utama" (Add to Home Screen)</strong>.
                    </li>
                    <li className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/80">
                      Ketuk <strong>"Tambah" (Add)</strong> di pojok kanan atas. Icon aplikasi {appName} akan langsung terpasang di Home Screen iPhone!
                    </li>
                  </ol>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-5 sm:p-6 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleMarkAsInstalled}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Sudah terpasang? <span className="underline font-bold text-slate-300">Tandai Selesai</span>
              </button>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => pwaManager.closeModal()}
                  className="flex-1 sm:flex-none py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await pwaManager.triggerInstall();
                  }}
                  className="flex-1 sm:flex-none py-2.5 px-5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  {isDesktop ? <Laptop className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  <span>{hasPrompt ? (isDesktop ? 'Pasang di Desktop PC' : 'Pasang Aplikasi') : (isDesktop ? 'Pasang di Desktop PC' : 'Instal Aplikasi')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
