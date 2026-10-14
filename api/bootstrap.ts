import fs from 'fs';
import path from 'path';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const defaultUrl = process.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbyVyW9TxnWgCAQLS-sehGPay574Vnne2Fhn8t-mKqTX3PlvBwpS8kEbLzFF31dSaUj5/exec';

  let state: any = null;

  // Try reading bundled server_data/app_state.json if available
  try {
    const stateFile = path.join(process.cwd(), 'server_data', 'app_state.json');
    if (fs.existsSync(stateFile)) {
      const raw = fs.readFileSync(stateFile, 'utf-8');
      state = JSON.parse(raw);
    }
  } catch (err) {
    // Ephemeral serverless environment, fallback below
  }

  if (!state) {
    state = {
      settings: {
        namaPerusahaan: 'DPT AlaDin',
        alamatPerusahaan: 'Jl. Utama RT/RW Net No. 88, Jakarta East',
        adminUsername: 'admin',
        adminPassword: 'Admin143',
        jamMasukDefinisikan: '08:00',
        jamPulangDefinisikan: '17:00',
        toleransiKeterlambatanMenit: 15,
        potonganPerKeterlambatan: 25000,
        potonganPulangAwal: 20000,
        hariLibur: ['Minggu'],
        tanggalLiburKhusus: ['2026-10-14'],
        jumlahCutiMaksimalPerBulan: 2,
        totalCutiPerTahun: 12,
        waGatewayProvider: 'fonnte',
        waApiToken: '',
        waApiUrl: 'https://api.fonnte.com/send',
        autoNotifyTechnicianOnPlanning: true,
        notifyViaBrowserPush: true,
        notifyViaWhatsApp: true,
        logoUrl: 'https://lh3.googleusercontent.com/d/15UkXvneSLPZbr3JxQQn0j6Qwy50uoRBz',
        googleSheetUrl: '',
        googleAppsScriptUrl: defaultUrl,
        isGoogleSheetConnected: true
      }
    };
  }

  // Ensure defaultUrl is always filled if missing
  if (state.settings && (!state.settings.googleAppsScriptUrl || !state.settings.googleAppsScriptUrl.trim())) {
    state.settings.googleAppsScriptUrl = defaultUrl;
    state.settings.isGoogleSheetConnected = true;
  }

  return res.status(200).json({
    success: true,
    data: state
  });
}
