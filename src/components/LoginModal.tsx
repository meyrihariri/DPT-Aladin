import React, { useState } from 'react';
import { Mail, Lock, LogIn, AlertCircle, Eye, EyeOff, RefreshCw, KeyRound, MessageCircle } from 'lucide-react';
import { Employee, AppSettings } from '../types';

interface LoginModalProps {
  employees: Employee[];
  settings?: AppSettings;
  onLoginSuccess: (user: Employee) => void;
  isSyncing?: boolean;
  onPullDatabase?: (urlOverride?: string, silent?: boolean) => Promise<boolean>;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  employees,
  settings,
  onLoginSuccess,
  isSyncing = false
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Format admin phone number for direct WhatsApp assistance
  const adminPhone = (() => {
    const adminWithContact = employees.find(
      e => e.role === 'Admin' && e.kontak && e.kontak.trim() !== '-' && e.kontak.trim().length > 5
    );
    let raw = adminWithContact?.kontak || '';
    if (!raw) {
      const anyAdmin = employees.find(e => e.role === 'Admin' && e.kontak && e.kontak.trim() !== '-');
      raw = anyAdmin?.kontak || '';
    }
    if (!raw) {
      raw = '081234567890';
    }

    let clean = raw.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    } else if (clean.startsWith('620')) {
      clean = '62' + clean.slice(3);
    }
    return clean;
  })();

  const forgotMessage = "Halo Admin, saya lupa informasi login (username/password) akun saya di aplikasi DPT-AlaDin. Mohon bantuannya.";
  const forgotWaUrl = `https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(forgotMessage)}`;

  const supportMessage = "Halo Admin, saya membutuhkan bantuan akun login aplikasi DPT-AlaDin.";
  const supportWaUrl = `https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(supportMessage)}`;

  const findEmployeeMatch = (list: Employee[], inputUser: string, inputPass: string) => {
    return list.find(e => {
      const u = (e.username || '').trim().toLowerCase();
      const n = (e.namaLengkap || '').trim().toLowerCase();
      const id = (e.id || '').trim().toLowerCase();
      const email = (e.email || '').trim().toLowerCase();
      const pass = String(e.password || '').trim();

      const userMatches = (u && u === inputUser) || (n && n === inputUser) || (id && id === inputUser) || (email && email === inputUser);
      const passMatches = pass === inputPass;

      return userMatches && passMatches;
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputUser || !inputPass) {
      setError('Silakan masukkan username/email dan password.');
      return;
    }

    setIsVerifying(true);

    try {
      // 1. Search in existing local employees list (Admin / PJ Server / Teknisi)
      let matched = findEmployeeMatch(employees, inputUser, inputPass);

      // 2. Fallback check local storage
      if (!matched) {
        try {
          const stored = JSON.parse(localStorage.getItem('dpt_aladin_employees_v1') || '[]');
          if (Array.isArray(stored)) {
            matched = findEmployeeMatch(stored, inputUser, inputPass);
          }
        } catch {}
      }

      // 3. Fallback for master administrator credentials configured in settings
      if (!matched && settings?.adminUsername && inputUser === settings.adminUsername.trim().toLowerCase() && inputPass === (settings.adminPassword || '').trim()) {
        const adminEmp: Employee = {
          id: 'emp-admin',
          namaLengkap: 'Administrator',
          username: settings.adminUsername,
          password: settings.adminPassword,
          role: 'Admin',
          status: 'Tetap',
          honorTetapBulanan: 0,
          wilayahHandledIds: [],
          bonusTargetBulanan: 0,
          kontak: '-',
          isOnline: true
        };
        onLoginSuccess(adminEmp);
        setIsVerifying(false);
        return;
      }

      if (matched) {
        onLoginSuccess(matched);
        setIsVerifying(false);
        return;
      }

      setError('Username / Email atau Password salah. Silakan coba lagi.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      {/* Login Card - Simple, Sleek, Maroon Theme */}
      <div className="w-full max-w-[390px] bg-white rounded-3xl p-7 sm:p-9 shadow-2xl border border-slate-100 flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand / Logo Container */}
        <div className="w-20 h-20 rounded-2xl bg-maroon-50 border border-maroon-100 flex items-center justify-center mb-4 p-2 shadow-2xs overflow-hidden">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="text-center">
              <span className="font-black text-xl text-maroon-800 tracking-tight block">DPT</span>
              <span className="text-[10px] font-bold text-maroon-600 uppercase tracking-widest block -mt-1">AlaDin</span>
            </div>
          )}
        </div>

        {/* Title & Description */}
        <h1 className="text-2xl font-black text-slate-900 tracking-tight text-center">
          Login
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1 mb-6 text-center">
          Masuk ke akun Anda untuk melanjutkan
        </p>

        {/* Error Alert */}
        {error && (
          <div className="w-full mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start space-x-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="w-full space-y-3.5">
          {/* Username / Email */}
          <div className="relative text-left">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username atau Email"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:border-maroon-800 transition-all"
            />
          </div>

          {/* Password */}
          <div className="relative text-left">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 focus:border-maroon-800 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4 text-maroon-800" /> : <Eye className="w-4 h-4 text-slate-400" />}
            </button>
          </div>

          {/* Submit Button in Maroon */}
          <button
            type="submit"
            disabled={isVerifying}
            className="w-full py-3.5 px-4 bg-maroon-800 hover:bg-maroon-900 active:bg-maroon-950 text-white font-bold text-sm rounded-xl shadow-md shadow-maroon-950/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-70 mt-2"
          >
            {isVerifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4 text-white" />
                <span>Login</span>
              </>
            )}
          </button>

          {/* Footer Assistance Links */}
          <div className="flex items-center justify-between pt-4 text-xs font-semibold text-slate-500">
            <a
              href={forgotWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 hover:text-maroon-800 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>Lupa Password?</span>
            </a>
            <a
              href={supportWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 hover:text-maroon-800 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>Bantuan Admin</span>
            </a>
          </div>
        </form>

        {isSyncing && (
          <div className="mt-4 flex items-center justify-center space-x-2 text-[11px] text-slate-400 font-medium">
            <RefreshCw className="w-3 h-3 animate-spin text-maroon-800" />
            <span>Menyinkronkan data...</span>
          </div>
        )}
      </div>
    </div>
  );
};
