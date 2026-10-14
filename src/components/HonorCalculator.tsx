import React, { useState } from 'react';
import { Calculator, Users, Ruler, Clock, Car, Bike, Shield, Sparkles, RotateCcw } from 'lucide-react';
import { JenisPekerjaan, WilayahPekerjaan } from '../types';
import { formatRupiah } from '../services/payroll';
import { NumericInput } from './NumericInput';
import { sortJenisPekerjaan, findJenisPekerjaan, isJobNeedTitik, isJobNeedKabel, isJobMulti } from '../services/storage';

interface HonorCalculatorProps {
  jenisList: JenisPekerjaan[];
  wilayahList?: WilayahPekerjaan[];
  title?: string;
  subtitle?: string;
  className?: string;
}

export const HonorCalculator: React.FC<HonorCalculatorProps> = ({
  jenisList,
  wilayahList = [],
  title = 'Kalkulator Estimasi Honor',
  subtitle,
  className = ''
}) => {
  const sortedJenisList = React.useMemo(() => sortJenisPekerjaan(jenisList), [jenisList]);

  const groupedJenisOptions = React.useMemo(() => {
    const map = new Map<string, JenisPekerjaan[]>();
    sortedJenisList.forEach(item => {
      const group = (item.jenisPekerjaan || 'Lain-lain').trim();
      if (!map.has(group)) {
        map.set(group, []);
      }
      map.get(group)!.push(item);
    });
    return Array.from(map.entries());
  }, [sortedJenisList]);

  const [selectedJenisId, setSelectedJenisId] = useState(sortedJenisList[0]?.id || jenisList[0]?.id || '');
  const [jumlahTitik, setJumlahTitik] = useState(2);
  const [panjangKabel, setPanjangKabel] = useState(100);
  const [menitLembur, setMenitLembur] = useState(30);
  const [jumlahTeknisi, setJumlahTeknisi] = useState(1);
  const [vehicleType, setVehicleType] = useState<'Pribadi' | 'Inventaris'>('Pribadi');
  const [selectedWilayahId, setSelectedWilayahId] = useState(wilayahList[0]?.id || '');

  const selectedJenis = findJenisPekerjaan(selectedJenisId, sortedJenisList) || findJenisPekerjaan(selectedJenisId, jenisList) || sortedJenisList[0] || jenisList[0];
  const selectedWilayah = wilayahList.find(w => w.id === selectedWilayahId) || wilayahList[0];

  const tarifDasar = Number(selectedJenis?.tarifDasar) || 0;
  const needTitik = isJobNeedTitik(selectedJenis);
  const needKabel = isJobNeedKabel(selectedJenis);
  const isMulti = isJobMulti(selectedJenis);

  const tarifTitik = needTitik ? (Number(selectedJenis?.tarifTitik) || 0) : 0;
  const tarifKabel = needKabel ? (Number(selectedJenis?.tarifTarikKabelPerMeter) || 0) : 0;
  const tarifLembur = Number(selectedJenis?.tarifLemburPerMenit) || 0;

  // Transport allowance (only if using personal vehicle)
  const transportRatePerTech = vehicleType === 'Pribadi'
    ? (selectedWilayah?.besaranTransport ?? 20000)
    : 0;

  const totalDasar = tarifDasar;
  const totalTitik = needTitik ? (tarifTitik * jumlahTitik) : 0;
  const totalKabel = needKabel ? (tarifKabel * panjangKabel) : 0;
  const totalLembur = tarifLembur * menitLembur;
  const numTechs = isMulti ? Math.max(1, jumlahTeknisi) : 1;

  // Sesuai SOP & Aturan Penggajian:
  // 1. Honor Dasar Pekerjaan: Diterima UTUH oleh masing-masing teknisi (tidak dibagi).
  // 2. Honor Lembur: Diterima UTUH oleh masing-masing teknisi (tidak dibagi).
  // 3. Yang DIBAGI RATA hanya Honor Titik dan Honor Tarik/Panjang Kabel.
  const dasarPerTech = totalDasar;
  const lemburPerTech = totalLembur;
  const titikPerTech = Math.round(totalTitik / numTechs);
  const kabelPerTech = Math.round(totalKabel / numTechs);

  const perTechWorkBase = dasarPerTech + lemburPerTech + titikPerTech + kabelPerTech;

  // Total received per technician includes their own transport allowance
  const honorPerTeknisi = perTechWorkBase + transportRatePerTech;
  const totalBaseWork = (dasarPerTech * numTechs) + (lemburPerTech * numTechs) + totalTitik + totalKabel;
  const totalHonorGabungan = totalBaseWork + (transportRatePerTech * numTechs);

  const handleReset = () => {
    setSelectedJenisId(jenisList[0]?.id || '');
    setJumlahTitik(0);
    setPanjangKabel(0);
    setMenitLembur(0);
    setJumlahTeknisi(1);
    setVehicleType('Pribadi');
  };

  return (
    <div className={`bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3.5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-maroon-50 text-maroon-800 rounded-lg sm:rounded-xl">
            <Calculator className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-sm flex items-center space-x-1.5">
              <span>{title}</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </h3>
            {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="px-2.5 py-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
          title="Reset Perhitungan"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Inputs Section */}
      <div className="space-y-3 text-xs">
        {/* 1. Jenis & Sub Pekerjaan */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-slate-700 font-bold text-[11px] block">
              Jenis & Sub Pekerjaan
            </label>
            <span className="text-[10px] text-maroon-800 font-semibold bg-maroon-50 px-2 py-0.5 rounded-md border border-maroon-100">
              Tarif Dasar: {formatRupiah(tarifDasar)}
            </span>
          </div>
          <select
            value={selectedJenisId}
            onChange={e => setSelectedJenisId(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-maroon-800 cursor-pointer transition-colors"
          >
            {groupedJenisOptions.map(([groupName, items]) => (
              <optgroup key={groupName} label={`📁 ${groupName.toUpperCase()}`}>
                {items.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.jenisPekerjaan} - {j.subPekerjaan} ({formatRupiah(j.tarifDasar)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 2. Parameter Volume: Titik, Kabel, Lembur (Dinamis sesuai kebutuhan Jenis Pekerjaan) */}
        <div className={`grid gap-2 ${
          needTitik && needKabel ? 'grid-cols-3' : (needTitik || needKabel) ? 'grid-cols-2' : 'grid-cols-1'
        }`}>
          {/* Jumlah Titik */}
          {needTitik && (
            <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/80 flex flex-col justify-between">
              <div className="mb-1.5">
                <span className="text-[11px] font-bold text-slate-700 block truncate">
                  Jumlah Titik
                </span>
                <span className="text-[10px] text-slate-400 font-medium block truncate">
                  @{formatRupiah(tarifTitik)}
                </span>
              </div>
              <NumericInput
                value={jumlahTitik}
                onChange={val => setJumlahTitik(val)}
                min={0}
                suffix="Titik"
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>
          )}

          {/* Panjang Kabel */}
          {needKabel && (
            <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/80 flex flex-col justify-between">
              <div className="mb-1.5">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1 truncate">
                  <Ruler className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">Panjang Kabel</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium block truncate">
                  @{formatRupiah(tarifKabel)}/m
                </span>
              </div>
              <NumericInput
                value={panjangKabel}
                onChange={val => setPanjangKabel(val)}
                min={0}
                suffix="Meter"
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
              />
            </div>
          )}

          {/* Waktu Lembur */}
          <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <div className="mb-1.5">
              <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1 truncate">
                <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="truncate">Waktu Lembur</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium block truncate">
                @{formatRupiah(tarifLembur)}/mnt
              </span>
            </div>
            <NumericInput
              value={menitLembur}
              onChange={val => setMenitLembur(val)}
              min={0}
              suffix="Menit"
              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
            />
          </div>
        </div>

        {/* 3. Kendaraan Operasional (Baris Tersendiri, Lebar Penuh, Teks Lega) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-slate-700 font-bold text-[11px] flex items-center space-x-1.5">
              <Car className="w-3.5 h-3.5 text-blue-600" />
              <span>Kendaraan Operasional</span>
            </label>
            {vehicleType === 'Pribadi' && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70">
                +{formatRupiah(transportRatePerTech)} / teknisi
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVehicleType('Pribadi')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                vehicleType === 'Pribadi'
                  ? 'bg-maroon-800 text-white border-maroon-800 shadow-xs ring-2 ring-maroon-800/20'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Bike className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Pribadi (+Transport)</span>
            </button>
            <button
              type="button"
              onClick={() => setVehicleType('Inventaris')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                vehicleType === 'Inventaris'
                  ? 'bg-maroon-800 text-white border-maroon-800 shadow-xs ring-2 ring-maroon-800/20'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Car className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Inventaris (Rp 0)</span>
            </button>
          </div>

          {/* Wilayah Transport (Hanya saat Pribadi) */}
          {vehicleType === 'Pribadi' && wilayahList.length > 0 && (
            <div className="mt-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1">
              <label className="block text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                Wilayah Uang Transport:
              </label>
              <select
                value={selectedWilayahId}
                onChange={e => setSelectedWilayahId(e.target.value)}
                className="w-full p-2 bg-white border border-blue-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-maroon-800 cursor-pointer"
              >
                {wilayahList.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.namaWilayah} — {formatRupiah(w.besaranTransport)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 4. Jumlah Teknisi (Baris Tersendiri, Lebar Penuh, Teks Nyaman) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-slate-700 font-bold text-[11px] flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Jumlah Teknisi Pengerjaan</span>
            </label>
            <span className="text-[10px] text-slate-400 font-medium">
              {!isMulti ? 'Single Teknisi (1 orang)' : (jumlahTeknisi === 1 ? '1 orang (sendiri)' : `Pengerjaan tim ${jumlahTeknisi} orang`)}
            </span>
          </div>
          {isMulti ? (
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setJumlahTeknisi(n)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                    jumlahTeknisi === n
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs ring-2 ring-slate-900/20'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {n} Orang
                </button>
              ))}
            </div>
          ) : (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-bold text-xs flex items-center justify-between">
              <span>👤 Pekerjaan Single-Teknisi</span>
              <span className="text-[10px] text-slate-500 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">1 Orang (Tidak dapat diubah)</span>
            </div>
          )}
        </div>
      </div>

      {/* Rincian Perhitungan & Estimasi Honor (2 Kolom Bersih, Tidak Berhimpitan) */}
      <div className="pt-3 border-t border-slate-100 bg-slate-50/80 rounded-2xl p-3 sm:p-3.5 space-y-2.5 text-xs">
        <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[10px] block">
          Rincian Simulasi Honor
        </span>

        {/* 4 Komponen: 2 Kolom x 2 Baris */}
        <div className="grid grid-cols-2 gap-2 text-slate-600">
          {/* Card 1: Tarif Dasar */}
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 truncate">Tarif Dasar</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px] border border-emerald-200/60 shrink-0">
                Utuh
              </span>
            </div>
            <span className="font-black text-slate-900 text-xs sm:text-sm">
              {formatRupiah(totalDasar)}
            </span>
          </div>

          {/* Card 2: Titik */}
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 truncate">
                Titik ({jumlahTitik})
              </span>
              {numTechs > 1 ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[9px] border border-amber-200/60 shrink-0">
                  Bagi {numTechs}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px] border border-emerald-200/60 shrink-0">
                  Utuh
                </span>
              )}
            </div>
            <div>
              <span className="font-black text-slate-900 text-xs sm:text-sm">
                {formatRupiah(titikPerTech)}
              </span>
              {numTechs > 1 && (
                <span className="block text-[9px] text-slate-400 font-normal mt-0.5 truncate">
                  Tot: {formatRupiah(totalTitik)}
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Kabel */}
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 truncate">
                Kabel ({panjangKabel}m)
              </span>
              {numTechs > 1 ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[9px] border border-amber-200/60 shrink-0">
                  Bagi {numTechs}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px] border border-emerald-200/60 shrink-0">
                  Utuh
                </span>
              )}
            </div>
            <div>
              <span className="font-black text-slate-900 text-xs sm:text-sm">
                {formatRupiah(kabelPerTech)}
              </span>
              {numTechs > 1 && (
                <span className="block text-[9px] text-slate-400 font-normal mt-0.5 truncate">
                  Tot: {formatRupiah(totalKabel)}
                </span>
              )}
            </div>
          </div>

          {/* Card 4: Lembur */}
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 truncate">
                Lembur ({menitLembur}m)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[9px] border border-emerald-200/60 shrink-0">
                Utuh
              </span>
            </div>
            <span className="font-black text-slate-900 text-xs sm:text-sm">
              {formatRupiah(totalLembur)}
            </span>
          </div>
        </div>

        {/* Transport Kendaraan Row */}
        <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200/80 text-[11px]">
          <span className="text-slate-600 flex items-center space-x-1.5">
            <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Uang Transport Kendaraan:</span>
          </span>
          <span className={`font-bold ${transportRatePerTech > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
            {transportRatePerTech > 0 ? `+${formatRupiah(transportRatePerTech)}` : 'Rp 0 (Inventaris)'}
          </span>
        </div>

        {/* Final Estimasi per Teknisi (Card Highlight Maroon) */}
        <div className="bg-maroon-800 text-white rounded-2xl p-3 sm:p-4 shadow-sm space-y-2 mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-rose-200/90 font-medium block">
              Estimasi Honor Diterima per Teknisi:
            </span>
            <span className="text-[10px] text-rose-200/80 font-bold bg-white/10 px-2 py-0.5 rounded-full">
              {numTeknisiText(jumlahTeknisi)}
            </span>
          </div>

          <div className="text-2xl font-black text-amber-300 leading-tight">
            {formatRupiah(honorPerTeknisi)}
          </div>

          <div className="text-[10px] text-rose-200/80 border-t border-white/15 pt-2 space-y-1">
            <div className="flex justify-between items-center font-semibold">
              <span>Total Pengerjaan Pekerjaan:</span>
              <span className="text-white font-black">{formatRupiah(totalHonorGabungan)}</span>
            </div>
            {numTechs > 1 && (
              <p className="text-[9.5px] text-amber-200/90 leading-normal">
                * Honor dasar & lembur diterima utuh per teknisi, honor titik & kabel dibagi rata {numTechs} orang.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function numTeknisiText(n: number): string {
  if (n <= 1) return 'Sendiri / 1 Orang';
  return `${n} Orang`;
}

