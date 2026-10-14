import React from 'react';
import { PayrollRecap, AppSettings, ServerData, Employee } from '../types';
import { formatRupiah } from '../services/payroll';
import { terbilang } from '../utils/numberToWords';

interface OfficialSlipGajiDocumentProps {
  recap: PayrollRecap;
  settings?: AppSettings;
  servers?: ServerData[];
  employees?: Employee[];
  selectedServerId?: string;
  selectedServerName?: string;
  slipSignInfo: {
    roleTitle: string;
    personName: string;
  };
}

export const OfficialSlipGajiDocument: React.FC<OfficialSlipGajiDocumentProps> = ({
  recap,
  settings,
  selectedServerId,
  selectedServerName,
  slipSignInfo
}) => {
  const companyName = settings?.namaPerusahaan || 'DPT AlaDin';
  const companyAddress = settings?.alamatPerusahaan || 'Jl. Raya Merdeka No. 1945 Indonesia Raya';
  const cleanPeriod = recap.periode || new Date().toISOString().slice(0, 7);

  // Format periode bahasa Indonesia: "2026-09" -> "September 2026"
  const formattedPeriode = React.useMemo(() => {
    try {
      const parts = cleanPeriod.split('-');
      if (parts.length === 2) {
        const year = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const date = new Date(year, monthIndex, 1);
        return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      }
      return cleanPeriod;
    } catch {
      return cleanPeriod;
    }
  }, [cleanPeriod]);

  // Tanggal cetak hari ini
  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const docNo = `DPT/SLIP/${cleanPeriod.replace('-', '')}/${recap.teknisiId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '001'}`;

  // Filter server name label
  const serverScopeLabel = React.useMemo(() => {
    if (!selectedServerId || selectedServerId === 'all' || selectedServerName?.toLowerCase() === 'semua server') {
      return 'Semua Server';
    }
    return selectedServerName || 'Server Terkait';
  }, [selectedServerId, selectedServerName]);

  // Earnings items
  const earningsList: { label: string; amount: number; note?: string }[] = [
    { label: 'Honor Pokok Tetap Server', amount: recap.honorTetapServer || 0 },
    ...(recap.honorPJWilayah > 0 ? [{ label: 'Honor PJ Wilayah', amount: recap.honorPJWilayah }] : []),
    {
      label: 'Honor Dasar Pekerjaan',
      amount: recap.honorDasarPekerjaan || 0,
      note: `${recap.totalPekerjaanCount || 0} pekerjaan selesai`
    },
    { label: 'Honor Titik (Pembagian Tim)', amount: recap.honorTitik || 0 },
    { label: 'Honor Tarik Kabel (Pembagian Tim)', amount: recap.honorPanjangKabel || 0 },
    {
      label: 'Honor Lembur (ACC)',
      amount: recap.honorLembur || 0,
      note: recap.totalMenitLembur ? `${recap.totalMenitLembur} menit lembur di-ACC` : undefined
    },
    ...(recap.honorTransportKendaraan > 0
      ? [{ label: 'Honor Transport Kendaraan Pribadi', amount: recap.honorTransportKendaraan }]
      : []),
    ...(recap.bonusTarget > 0
      ? [{ label: 'Bonus Capaian Target Bulanan', amount: recap.bonusTarget }]
      : [])
  ];

  // Deductions items (selalu tampilkan komponen potongan standar seperti Gambar 1)
  const deductionsList: { label: string; amount: number; note?: string }[] = [
    {
      label: 'Potongan Terlambat / Absensi Ditolak',
      amount: recap.potonganTerlambatAbsen || 0
    },
    {
      label: 'Potongan Kasbon Manual',
      amount: recap.potonganManualKasbon || 0
    }
  ];

  if (recap.potonganManualDetails && recap.potonganManualDetails.length > 0) {
    recap.potonganManualDetails.forEach(pd => {
      deductionsList.push({
        label: `• Kasbon: ${pd.serverNama} (${pd.tanggal})`,
        amount: pd.nominal,
        note: pd.keterangan || undefined
      });
    });
  }

  // Ensure balanced rows for side-by-side presentation
  const maxRows = Math.max(earningsList.length, deductionsList.length, 6);

  return (
    <div
      id="slip-gaji-print-area"
      className="bg-white text-slate-900 w-full max-w-4xl mx-auto p-6 sm:p-8 font-sans text-xs print:p-0 print:m-0 print:max-w-none print:shadow-none print:border-none"
    >
      {/* 1. KOP SURAT RESMI */}
      <div className="flex items-start justify-between pb-3 border-b-2 border-[#800020]">
        <div className="flex items-center space-x-3.5">
          {settings?.logoUrl ? (
            <div className="w-14 h-14 bg-white rounded-lg border border-slate-200 p-1 flex items-center justify-center shrink-0">
              <img
                src={settings.logoUrl}
                alt="Logo Perusahaan"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-14 h-14 bg-[#800020] text-white rounded-lg flex flex-col items-center justify-center font-black shrink-0 tracking-wider">
              <span className="text-base leading-none">ALA</span>
              <span className="text-[10px] text-amber-300 leading-tight">DIN</span>
            </div>
          )}

          <div>
            <h1 className="text-lg font-black tracking-wide text-[#800020] uppercase leading-tight">
              {companyName}
            </h1>
            <p className="text-[10px] font-bold text-slate-800 tracking-wider uppercase mt-0.5">
              Jasa Instalasi Internet dan Jaringan
            </p>
            <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
              {companyAddress}
            </p>
            <p className="text-[9px] text-slate-400 italic">
              Layanan Operasional Lapangan & Pemeliharaan Layanan Internet
            </p>
          </div>
        </div>

        <div className="text-right hidden sm:block print:block">
          <span className="inline-block px-2.5 py-1 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono font-bold text-slate-700">
            DOKUMEN RESMI
          </span>
          <p className="text-[9px] text-slate-400 mt-1">Sistem Penggajian DPT</p>
        </div>
      </div>
      <div className="h-0.5 bg-slate-200 mb-4" />

      {/* 2. JUDUL DOKUMEN & IDENTITAS SLIP */}
      <div className="text-center my-3">
        <h2 className="text-base font-black tracking-wider text-slate-900 uppercase">
          SLIP GAJI & HONORARIUM TEKNISI
        </h2>
        <div className="flex items-center justify-center space-x-3 text-[11px] text-slate-600 mt-0.5">
          <span>No. Dokumen: <strong className="text-slate-800 font-mono">{docNo}</strong></span>
          <span>•</span>
          <span>Periode: <strong className="text-slate-800">{formattedPeriode}</strong></span>
        </div>
      </div>

      {/* 3. TABEL DATA PEGAWAI (KARTU IDENTITAS RESMI) */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 my-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Nama Teknisi</span>
            <span className="font-extrabold text-slate-900 text-sm">{recap.teknisiNama}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">NIK / ID Teknisi</span>
            <span className="font-mono font-bold text-slate-800">{recap.teknisiId}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Status Kepegawaian</span>
            <span className="font-bold text-slate-800">{recap.statusKaryawan || 'Tetap'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Server Penugasan</span>
            <span className="font-bold text-slate-800">{serverScopeLabel}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Total Tugas Selesai</span>
            <span className="font-bold text-[#800020]">{recap.totalPekerjaanCount || 0} Pekerjaan</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Total Lembur ACC</span>
            <span className="font-bold text-amber-700">{recap.totalMenitLembur || 0} Menit</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Tanggal Cetak</span>
            <span className="font-semibold text-slate-800">{printDateStr}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Status Pembayaran</span>
            <span className="font-bold text-emerald-700">SIAP TRANSFER / TUNAI</span>
          </div>
        </div>
      </div>

      {/* 4. TABEL UTAMA DUA KOLOM: PENERIMAAN (EARNINGS) & POTONGAN (DEDUCTIONS) */}
      <div className="border border-slate-300 rounded-lg overflow-hidden my-3">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-300">
              <th
                colSpan={2}
                className="w-1/2 bg-[#800020] text-white font-extrabold text-left px-3 py-2 text-xs uppercase tracking-wide border-r border-slate-300"
              >
                A. PENERIMAAN / HAK (EARNINGS)
              </th>
              <th
                colSpan={2}
                className="w-1/2 bg-rose-900 text-white font-extrabold text-left px-3 py-2 text-xs uppercase tracking-wide"
              >
                B. POTONGAN (DEDUCTIONS)
              </th>
            </tr>
            <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-300 text-[11px]">
              <th className="text-left px-3 py-1.5 w-[33%]">Komponen Penerimaan</th>
              <th className="text-right px-3 py-1.5 w-[17%] border-r border-slate-300">Jumlah (Rp)</th>
              <th className="text-left px-3 py-1.5 w-[33%]">Komponen Potongan</th>
              <th className="text-right px-3 py-1.5 w-[17%]">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {Array.from({ length: maxRows }).map((_, idx) => {
              const earn = earningsList[idx];
              const ded = deductionsList[idx];
              return (
                <tr key={idx} className="hover:bg-slate-50/50">
                  {/* Kolom Penerimaan */}
                  <td className="px-3 py-1.5 align-top text-slate-800">
                    {earn ? (
                      <div>
                        <span className="font-medium">{earn.label}</span>
                        {earn.note && (
                          <span className="block text-[10px] text-slate-500 font-normal italic">
                            ({earn.note})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-transparent">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 align-top text-right font-semibold text-slate-900 border-r border-slate-300">
                    {earn ? formatRupiah(earn.amount) : ''}
                  </td>

                  {/* Kolom Potongan */}
                  <td className="px-3 py-1.5 align-top text-slate-800">
                    {ded ? (
                      <div>
                        <span className={`font-medium ${ded.amount > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                          {ded.label}
                        </span>
                        {ded.note && (
                          <span className="block text-[10px] text-slate-500 font-normal italic">
                            ({ded.note})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-transparent">-</span>
                    )}
                  </td>
                  <td className={`px-3 py-1.5 align-top text-right font-semibold ${ded && ded.amount > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                    {ded ? (ded.amount > 0 ? `-${formatRupiah(ded.amount)}` : 'Rp 0') : ''}
                  </td>
                </tr>
              );
            })}

            {/* Subtotal Row */}
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-xs">
              <td className="px-3 py-2 text-slate-700">Total Penerimaan Kotor (Gross)</td>
              <td className="px-3 py-2 text-right text-slate-900 border-r border-slate-300">
                {formatRupiah(recap.totalHonorGross || 0)}
              </td>
              <td className="px-3 py-2 text-rose-800">Total Potongan</td>
              <td className="px-3 py-2 text-right text-rose-800">
                {recap.totalPotongan > 0 ? `-${formatRupiah(recap.totalPotongan)}` : 'Rp 0'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 5. KOTAK TOTAL GAJI BERSIH (TAKE HOME PAY / NETT) */}
      <div className="bg-emerald-50 border-2 border-emerald-500 rounded-lg p-3 my-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-black text-emerald-900 uppercase tracking-wider block">
              TOTAL GAJI / TAKE HOME PAY NETT DITERIMA :
            </span>
            <p className="text-[11px] text-emerald-800 italic font-medium mt-0.5">
              Terbilang: <strong>{terbilang(recap.totalHonorNett || 0)}</strong>
            </p>
          </div>
          <div className="text-right">
            <span className="text-lg sm:text-xl font-black text-emerald-700 font-mono tracking-tight block">
              {formatRupiah(recap.totalHonorNett || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 6. RINCIAN DISTRIBUSI SERVER (Jika Multi-Server) */}
      {recap.serverBreakdowns && recap.serverBreakdowns.length > 1 && (
        <div className="border border-slate-200 rounded-lg p-2.5 my-2.5 bg-slate-50 text-[10px]">
          <span className="font-bold text-slate-700 block mb-1">
            * Distribusi Beban Pembayaran Honor Antar-Server ({recap.serverBreakdowns.length} Server):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recap.serverBreakdowns.map((sb, sIdx) => (
              <div key={sIdx} className="flex justify-between bg-white px-2 py-1 rounded border border-slate-200">
                <span>
                  <strong>Server {sb.serverNama}</strong> ({sb.jobCount} Jobs)
                </span>
                <span className="font-bold text-slate-900">{formatRupiah(sb.totalGross)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. TANDA TANGAN MENGETAHUI & MENYETUJUI */}
      <div className="grid grid-cols-2 gap-8 mt-6 pt-2">
        {/* Kolom Kiri: Penerima */}
        <div className="text-center">
          <p className="font-bold text-slate-800 text-xs">Penerima / Karyawan,</p>
          <p className="text-[10px] text-slate-500 mb-12">Teknisi Bersangkutan</p>

          <div className="inline-block border-b border-slate-800 min-w-[180px] pb-1">
            <span className="font-bold text-slate-900 text-xs">
              ( {recap.teknisiNama} )
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">Tanda tangan & Nama Terang</p>
        </div>

        {/* Kolom Kanan: Mengetahui & Menyetujui */}
        <div className="text-center">
          <p className="font-bold text-slate-800 text-xs">Mengetahui & Menyetujui,</p>
          <p className="text-[10px] text-slate-600 font-semibold mb-12">
            {slipSignInfo.roleTitle}
          </p>

          <div className="inline-block border-b border-slate-800 min-w-[180px] pb-1">
            <span className="font-bold text-slate-900 text-xs">
              ( {slipSignInfo.personName} )
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5">Penanggung Jawab / Otorisasi</p>
        </div>
      </div>

      {/* 8. CATATAN & FOOTER RESMI */}
      <div className="mt-8 pt-2 border-t border-slate-200 text-center">
        <p className="text-[9px] text-slate-400 italic">
          Catatan: Slip gaji ini adalah dokumen sah yang diterbitkan secara komputerisasi oleh sistem DPT AlaDin dan tidak memerlukan cap basah jika telah ditandatangani.
        </p>
      </div>
    </div>
  );
};
