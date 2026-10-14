import React, { useState } from 'react';
import { ShieldCheck, UserCheck, HardHat, Lock, User, ArrowRight, AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Employee, UserRole, AppSettings } from '../types';

interface LoginModalProps {
  employees: Employee[];
  settings?: AppSettings;
  onLoginSuccess: (user: Employee) => void;
  isSyncing?: boolean;
  onPullDatabase?: (urlOverride?: string, silent?: boolean) => Promise<boolean>;
}

const roleLabels: Record<UserRole, string> = {
  'Admin': 'Admin',
  'Penanggungjawab Server': 'PJ Server',
  'Teknisi': 'Teknisi'
};

const normalizeRole = (role?: string): UserRole => {
  const r = (role || '').toLowerCase().trim();
  if (r.includes('admin')) return 'Admin';
  if (r.includes('pj') || r.includes('server') || r.includes('penanggung')) return 'Penanggungjawab Server';
  return 'Teknisi';
};

export const LoginModal: React.FC<LoginModalProps> = ({
  employees,
  settings,
  onLoginSuccess,
  isSyncing = false,
  onPullDatabase
}) => {
  const [activeTab, setActiveTab] = useState<UserRole>('Admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Format admin phone number for direct WhatsApp links
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

  const forgotMessage = "Assalamualaikum Admin. Tolong kirim username dan sandi login saya";
  const forgotWaUrl = adminPhone
    ? `https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(forgotMessage)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(forgotMessage)}`;

  const currentTypedUsername = username.trim() || '...';
  const changeMessage = `Assalamualaikum Admin. Saya ingin mengubah data user login saya. Username: ${currentTypedUsername} Sandi: ...`;
  const changeWaUrl = adminPhone
    ? `https://api.whatsapp.com/send?phone=${adminPhone}&text=${encodeURIComponent(changeMessage)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(changeMessage)}`;

  const handleRoleTabChange = (role: UserRole) => {
    setActiveTab(role);
    setError('');
  };

  const findEmployeeMatch = (list: Employee[], inputUser: string, inputPass: string) => {
    return list.find(e => {
      const u = (e.username || '').trim().toLowerCase();
      const n = (e.namaLengkap || '').trim().toLowerCase();
      const id = (e.id || '').trim().toLowerCase();
      const pass = String(e.password || '').trim();

      const userMatches = (u && u === inputUser) || (n && n === inputUser) || (id && id === inputUser);
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
      setError('Silakan masukkan username dan password.');
      return;
    }

    setIsVerifying(true);

    const selectedRole = normalizeRole(activeTab);
    const selectedLabel = roleLabels[selectedRole] || selectedRole;

    try {
      // 1. Search in existing local employees list
      let matched = findEmployeeMatch(employees, inputUser, inputPass);

      // 2. If not found locally and onPullDatabase is provided, attempt to pull latest from Google Sheets / server
      if (!matched && onPullDatabase) {
        try {
          await onPullDatabase(undefined, true);
          // Check again from localStorage in case state hasn't re-rendered yet
          const latestEmployees = JSON.parse(localStorage.getItem('dpt_aladin_employees_v1') || '[]');
          matched = findEmployeeMatch(latestEmployees, inputUser, inputPass);
        } catch {
          // Continue to fallback checks
        }
      }

      if (matched) {
        const userRole = normalizeRole(matched.role);
        const userRoleLabel = roleLabels[userRole] || userRole;

        // STRICT ROLE VALIDATION: The selected tab MUST match the employee's role
        if (userRole !== selectedRole) {
          setError(
            `Akun Anda (${matched.namaLengkap || matched.username}) terdaftar dengan hak akses "${userRoleLabel}". Silakan pilih tab akses "${userRoleLabel}" di atas untuk login.`
          );
          setIsVerifying(false);
          return;
        }

        onLoginSuccess(matched);
        setIsVerifying(false);
        return;
      }

      // 3. Fallback for Admin if configured in App Settings
      if (
        settings?.adminUsername &&
        inputUser === settings.adminUsername.trim().toLowerCase() &&
        inputPass === (settings.adminPassword || '').trim()
      ) {
        if (selectedRole !== 'Admin') {
          setError(`Akun Administrator ini terdaftar dengan hak akses "Admin". Silakan pilih tab akses "Admin" untuk login.`);
          setIsVerifying(false);
          return;
        }

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

      setError('Username atau Password salah / akun belum terdaftar di Data Karyawan. Silakan periksa kembali.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 transition-all">
        {/* App Banner Header in Maroon */}
        <div className="bg-gradient-to-br from-maroon-950 via-maroon-900 to-maroon-800 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-rose-400/20 rounded-full blur-xl" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-amber-400/15 rounded-full blur-xl" />

          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-xs border border-white/20 rounded-2xl mx-auto flex items-center justify-center p-1.5 shadow-lg mb-3 overflow-hidden">
              {settings?.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo Perusahaan" className="w-full h-full object-contain" />
              ) : (
                <span className="font-black text-2xl text-white">A</span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              {(!settings?.namaPerusahaan || /aladin\s*nusantara/i.test(settings.namaPerusahaan))
                ? 'DPT-AlaDin'
                : settings.namaPerusahaan}
            </h1>
            <p className="text-xs text-rose-200 mt-1 font-medium max-w-xs mx-auto">
              Daftar Pendataan Pekerjaan & Gaji Teknisi
            </p>
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div className="p-5 sm:p-6">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
            Pilih Akses Login
          </label>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl mb-5">
            <button
              type="button"
              onClick={() => handleRoleTabChange('Admin')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'Admin'
                  ? 'bg-white text-maroon-800 shadow-sm border border-maroon-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 mb-1" />
              <span>Admin</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabChange('Penanggungjawab Server')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'Penanggungjawab Server'
                  ? 'bg-white text-maroon-800 shadow-sm border border-maroon-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4 mb-1" />
              <span>PJ Server</span>
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabChange('Teknisi')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'Teknisi'
                  ? 'bg-white text-maroon-800 shadow-sm border border-maroon-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <HardHat className="w-4 h-4 mb-1" />
              <span>Teknisi</span>
            </button>
          </div>

          {/* Form Credentials */}
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Masukkan username akun"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 transition-all font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Masukkan password akun"
                  className="w-full pl-9 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-maroon-800 transition-all font-medium text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-maroon-800" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-3 bg-maroon-800 text-white font-bold text-sm rounded-xl hover:bg-maroon-900 active:scale-98 shadow-lg shadow-maroon-900/25 transition-all flex items-center justify-center space-x-2 mt-4 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <span>Masuk Aplikasi</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Link Aksi Lupa user/sandi & Ubah User/Sandi via WhatsApp Admin */}
            <div className="flex items-center justify-center space-x-3 pt-3 text-xs font-medium text-slate-500">
              <a
                href={forgotWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-maroon-800 hover:underline transition-colors cursor-pointer py-1 font-semibold"
                title="Hubungi WhatsApp Admin untuk meminta username & sandi login"
              >
                Lupa user/sandi
              </a>
              <span className="text-slate-300 select-none">•</span>
              <a
                href={changeWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-maroon-800 hover:underline transition-colors cursor-pointer py-1 font-semibold"
                title="Hubungi WhatsApp Admin untuk mengubah data user & sandi login"
              >
                Ubah User/Sandi
              </a>
            </div>
          </form>

          {isSyncing && (
            <div className="mt-3 flex items-center justify-center space-x-2 text-[11px] text-slate-500 font-medium">
              <RefreshCw className="w-3 h-3 animate-spin text-maroon-800" />
              <span>Menyinkronkan data dari Google Sheets...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
