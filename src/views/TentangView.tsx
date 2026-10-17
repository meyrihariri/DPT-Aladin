import React from 'react';
import {
  Info,
  Code2,
  Cpu,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Smartphone,
  Database,
  Cloud,
  FileSpreadsheet,
  Briefcase,
  MapPin,
  Camera,
  Calculator,
  Users,
  Award,
  Sparkles,
  ExternalLink,
  Laptop
} from 'lucide-react';
import { AppSettings, Employee } from '../types';

interface TentangViewProps {
  settings?: AppSettings;
  currentUser?: Employee | null;
}

export const TentangView: React.FC<TentangViewProps> = ({ settings, currentUser }) => {
  const appName = settings?.namaPerusahaan || 'DPT-AlaDin';
  const logoUrl = settings?.logoUrl;

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-maroon-900 via-[#530000] to-maroon-800 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-12 top-4 w-32 h-32 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={appName} className="w-full h-full object-cover" />
              ) : (
                <Layers className="w-6 h-6 sm:w-7 sm:h-7 text-rose-200" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Tentang Aplikasi
                </h1>
                <span className="px-2.5 py-0.5 bg-rose-500/30 text-rose-100 text-[10px] sm:text-xs font-bold rounded-full border border-rose-400/30">
                  v2.5.0 PWA
                </span>
              </div>
              <p className="text-xs sm:text-sm text-rose-100/90 mt-0.5">
                {appName} • Sistem Manajemen Pekerjaan & Honor Presensi Teknisi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/25 backdrop-blur-xs rounded-xl border border-white/10 text-xs text-rose-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-semibold">Versi Produksi Aktif</span>
          </div>
        </div>
      </div>

      {/* Primary Section: Pembuat Aplikasi (Developer) - Sesuai Permintaan */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-maroon-800/5 to-transparent rounded-bl-full pointer-events-none" />

        <div className="flex items-center space-x-2.5 mb-4">
          <div className="p-2 bg-maroon-100 text-maroon-800 rounded-xl">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Pembuat Aplikasi
            </h2>
            <p className="text-xs text-slate-500">
              Informasi perancang dan pengembang sistem aplikasi
            </p>
          </div>
        </div>

        {/* Developer Badge Card */}
        <div className="bg-gradient-to-r from-slate-900 via-[#1a040b] to-maroon-950 text-white rounded-2xl p-4 sm:p-6 border border-maroon-900/60 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-maroon-800 to-rose-600 flex items-center justify-center font-black text-2xl text-white shadow-md border-2 border-white/20 shrink-0">
                O
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-rose-300 block">
                  Author & Software Engineer
                </span>
                <p className="text-xl sm:text-2xl font-black text-white tracking-wide mt-0.5">
                  Developer by: OEBEK
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Full-Stack Application & System Architecture Developer
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end gap-1.5 self-stretch sm:self-auto justify-between border-t sm:border-t-0 border-white/10 pt-3 sm:pt-0">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[11px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Verified Creator
              </span>
              <span className="text-[10px] text-slate-400">
                Didesain Khusus untuk Operasional RT/RW Net
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 text-xs sm:text-[13px] text-slate-300 leading-relaxed">
            Aplikasi <strong className="text-white font-bold">{appName}</strong> dirancang dan dikembangkan secara khusus oleh <strong className="text-white font-bold">OEBEK</strong> untuk menghadirkan solusi digital menyeluruh bagi operasional jaringan internet RT/RW Net. Mengutamakan transparansi honor teknisi, akurasi data kehadiran lapangan dengan foto selfie dan radius GPS server, serta stabilitas sinkronisasi cloud real-time tanpa ketergantungan biaya database sewa pihak ketiga.
          </div>
        </div>
      </div>

      {/* Section: Keterangan Tentang Aplikasi */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-rose-100 text-maroon-800 rounded-xl">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Keterangan Tentang Aplikasi
            </h2>
            <p className="text-xs text-slate-500">
              Gambaran umum, fungsi utama, dan arsitektur sistem {appName}
            </p>
          </div>
        </div>

        {/* Overview Box */}
        <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 text-slate-700 text-xs sm:text-sm leading-relaxed space-y-2.5">
          <p>
            <strong className="text-slate-900 font-bold">{appName}</strong> (Daftar Pekerjaan & Presensi Teknisi AlaDin) adalah aplikasi manajemen lapangan dan otomasi penggajian yang dibangun untuk mempermudah koordinasi antara <em>Administrator</em>, <em>Penanggungjawab Server</em>, dan <em>Teknisi Jaringan</em>.
          </p>
          <p>
            Aplikasi ini mendigitalkan seluruh alur kerja harian—mulai dari pembagian tugas kerja (planning), pencatatan hasil kerja lapangan, verifikasi kehadiran dengan selfie dan radius GPS server, hingga perhitungan honor transparan dengan rincian honor dasar, insentif titik, panjang kabel, lembur kerja, uang bensin/transport, kasbon/potongan, dan slip gaji digital.
          </p>
        </div>

        {/* 6 Core Pillars Grid */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Fitur Utama & Keunggulan Sistem
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Fitur 1 */}
            <div className="p-4 rounded-xl sm:rounded-2xl border border-slate-200 hover:border-maroon-300 transition-all bg-white hover:shadow-xs group">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-maroon-800 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Briefcase className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Manajemen Pekerjaan Lapangan
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pencatatan pekerjaan instalasi PSB, perbaikan gangguan (trouble), penarikan kabel feeder, splicing ODP/ODC, hingga pembagian porsi teknisi ganda secara otomatis.
              </p>
            </div>

            {/* Fitur 2 */}
            <div className="p-4 rounded-xl sm:rounded-2xl border border-slate-200 hover:border-maroon-300 transition-all bg-white hover:shadow-xs group">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Camera className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Presensi Selfie & Radius GPS
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Absensi mandiri dengan validasi koordinat jarak terhadap server aktif dan bukti foto selfie live camera anti-kecurangan untuk menjamin kehadiran nyata di lapangan.
              </p>
            </div>

            {/* Fitur 3 */}
            <div className="p-4 rounded-xl sm:rounded-2xl border border-slate-200 hover:border-maroon-300 transition-all bg-white hover:shadow-xs group">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Calculator className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Kalkulasi Honor & Slip Gaji
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Penghitungan otomatis honor dasar, insentif titik, panjang kabel, lembur, transport wilayah, potongan kasbon, bonus target, serta cetak slip gaji digital.
              </p>
            </div>

            {/* Fitur 4 */}
            <div className="p-4 rounded-xl sm:rounded-2xl border border-slate-200 hover:border-maroon-300 transition-all bg-white hover:shadow-xs group">
              <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Database className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Integrasi Cloud Google Sheets
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sinkronisasi data on-demand dua arah dengan Google Sheets melalui Google Apps Script Web App tanpa kuota database berbayar dan dapat dipantau langsung di spreadsheet.
              </p>
            </div>

            {/* Fitur 5 */}
            <div className="p-4 rounded-xl sm:rounded-2xl border border-slate-200 hover:border-maroon-300 transition-all bg-white hover:shadow-xs group">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Smartphone className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Progressive Web App (PWA)
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Dapat diinstal langsung di Android, iOS, dan Desktop layaknya aplikasi native dengan dukungan offline caching instan (0ms) untuk akses cepat dan hemat kuota.
              </p>
            </div>

            {/* Fitur 6 */}
            <div className="p-4 rounded-xl sm:rounded-2xl border border-slate-200 hover:border-maroon-300 transition-all bg-white hover:shadow-xs group">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Users className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Multi-Peran & Keamanan Akses
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Pemisahan hak akses terstruktur antara Administrator, Penanggungjawab Server, dan Teknisi Lapangan untuk menjamin privasi data dan akuntabilitas kerja.
              </p>
            </div>
          </div>
        </div>

        {/* Technical Architecture Specs */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Spesifikasi & Teknologi Sistem
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] font-semibold">Frontend Engine</span>
              <span className="font-bold text-slate-800">React 18 & Vite</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] font-semibold">Language & Types</span>
              <span className="font-bold text-slate-800">TypeScript 5.x</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] font-semibold">Styling & UI</span>
              <span className="font-bold text-slate-800">Tailwind CSS 4</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] font-semibold">Cloud Database</span>
              <span className="font-bold text-slate-800">Google Sheets & Drive</span>
            </div>
          </div>
        </div>

        {/* Copyright Footer */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 text-center sm:text-left">
          <div>
            <span>© 2026 {appName}. Seluruh hak cipta dilindungi.</span>
          </div>
          <div className="font-semibold text-slate-600">
            Developer by: <span className="text-maroon-800 font-bold">OEBEK</span>
          </div>
        </div>
      </div>
    </div>
  );
};
