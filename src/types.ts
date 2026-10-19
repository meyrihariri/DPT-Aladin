export type UserRole = 'Admin' | 'Penanggungjawab Server' | 'Teknisi';

export type EmployeeStatus = 'Tetap' | 'Freelance' | 'Magang';

export interface ServerHonorRateHistory {
  berlakuMulai: string; // Format YYYY-MM (contoh: "2026-09", "2026-10")
  nominal: number;      // Besaran honor tetap yang berlaku mulai periode tersebut
}

export interface EmployeeServerHonor {
  serverId: string;
  namaServer?: string;
  nominal: number; // Besaran honor tetap aktif/terbaru yang diterima karyawan/teknisi dari server ini
  berlakuMulai?: string; // Periode mulai berlaku tarif terbaru (YYYY-MM)
  riwayat?: ServerHonorRateHistory[]; // Riwayat perubahan honor tetap per periode bulan (YYYY-MM)
}

export interface Employee {
  id: string;
  namaLengkap: string;
  username: string;
  password?: string;
  role: UserRole;
  status: EmployeeStatus;
  honorTetapBulanan?: number;
  serverHonors?: EmployeeServerHonor[]; // Rincian besaran honor tetap per server yang diterima teknisi/karyawan
  wilayahHandledIds: string[]; // Wilayah IDs handled by technician
  bonusTargetBulanan: number;
  kontak: string;
  alamat?: string;
  rekening?: string;
  isOnline?: boolean;
  serverId?: string; // Assigned server ID for Penanggungjawab Server
  namaServer?: string; // Assigned server name for Penanggungjawab Server
  email?: string;
  telegram?: string;
  lastLogin?: string;
  createdAt?: string;
}

export interface ServerData {
  id: string;
  namaServer: string;
  penanggungJawabId: string; // Employee ID or name
  penanggungJawabNama: string;
  alamat: string;
  lat: number;
  lng: number;
  toleransiRadiusMeter: number;
  honorTetapTeknisi?: number; // (Legacy) Sebelumnya honor tetap per teknisi ditentukan di menu server, sekarang dikelola per karyawan di menu Karyawan
  targetPekerjaanBulanan?: number; // Target kuota jumlah pekerjaan per bulan (misal 100 pekerjaan)
  bonusTargetBulanan?: number; // Besaran nominal bonus jika mencapai 100% target (misal Rp 100.000)
  kontakPJ: string;
  createdAt?: string;
}

export interface WilayahPekerjaan {
  id: string;
  namaWilayah: string;
  serverId: string;
  namaServer: string;
  honorPJWilayah: number; // Honor Penanggung Jawab Wilayah
  besaranTransport: number;
  createdAt?: string;
}

export interface JenisPekerjaan {
  id: string;
  jenisPekerjaan: string;
  subPekerjaan: string;
  tarifDasar: number;
  tarifTitik: number;
  tarifTarikKabelPerMeter: number;
  tarifLemburPerMenit: number;
  butuhInputTitik: boolean;
  butuhPanjangKabel: boolean;
  isMultiTeknisi: boolean;
  createdAt?: string;
}

export type VehicleType = 'Inventaris' | 'Pribadi' | 'Jalan Kaki';

export interface JobRecord {
  id: string;
  tanggal: string; // YYYY-MM-DD or ISO
  teknisiIds: string[]; // 1 or multi teknisi (Index 0 is Teknisi Utama)
  teknisiNamas: string[];
  teknisiVehicles?: Record<string, VehicleType>; // Map of teknisiId -> 'Inventaris' | 'Pribadi' | 'Jalan Kaki'
  jenisPekerjaanId: string;
  jenisPekerjaanNama: string;
  subPekerjaanNama: string;
  serverId: string;
  namaServer: string;
  wilayahId?: string;
  wilayahIds?: string[]; // Wilayah IDs where work took place (bisa pilih lebih dari satu)
  wilayahNamas?: string[]; // Nama-nama wilayah yang dipilih
  totalTransportWilayah?: number; // Besaran transport akumulasi sesuai nominal transport pada data wilayah
  transport?: number; // Alias untuk totalTransportWilayah
  jumlahTitik: number;
  panjangKabelMeter: number;
  adaLembur?: boolean;
  menitLembur: number;
  lemburApproved?: boolean; // Persetujuan lembur oleh Admin
  lemburApprovedBy?: string; // Nama Admin yang menyetujui
  lemburApprovedAt?: string; // Timestamp persetujuan
  estimasiTotalHonor: number; // Akumulasi total biaya pekerjaan (honor dasar utuh + lembur utuh + titik + kabel + transport)
  honorPerTeknisi: number; // Honor pokok per teknisi (honor dasar utuh + lembur utuh + pembagian titik & kabel)
  buktiFotoUrl?: string;
  buktiFotoUrls?: string[];
  catatan?: string;
  planningTaskId?: string; // Link to planning if converted
  isHonorLunas?: boolean; // Status pelunasan honor pekerjaan
  honorLunasId?: string; // ID transaksi pelunasan honor
  honorLunasAt?: string; // Waktu pelunasan
  createdAt?: string;
}

export interface PlanningTask {
  id: string;
  tanggal: string;
  targetTeknisiIds: string[]; // 1 or multi
  targetTeknisiNamas: string[];
  serverId: string;
  namaServer: string;
  jenisPekerjaanId: string;
  subPekerjaanNama: string;
  detailPekerjaan: string;
  fotoLokasiUrl?: string;
  status: 'Pending' | 'Proses' | 'Selesai';
  createdById: string;
  namaKlien?: string;
  alamatKlien?: string;
  noWaKlien?: string;
  sales?: string;
  detailOdp?: string;
  noRegistrasi?: string;
  inputBy?: string;
  createdAt?: string;
}

export type AbsensiStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Cuti' | 'Ditolak' | 'Pending Approval';

export type ApprovalReasonType = 'Terlambat' | 'Pulang Awal' | 'Terlambat & Pulang Awal' | 'Luar Jam Kerja' | 'Di Luar Jam Kerja' | 'Luar Radius' | 'Izin/Cuti' | 'Izin / Cuti';

export interface AttendanceRecord {
  id: string;
  tanggal: string; // YYYY-MM-DD
  teknisiId: string;
  teknisiNama: string;
  jamMasuk: string; // HH:mm
  jamPulang?: string;
  serverId?: string;
  serverNama?: string;
  lat?: number;
  lng?: number;
  distanceMeter?: number;
  isWithinRadius?: boolean;
  fotoProofUrl?: string; // Foto Kamera Absen Masuk
  fotoPulangUrl?: string; // Foto Kamera Absen Pulang
  status: AbsensiStatus;
  keterangan?: string;
  keteranganPulang?: string;
  needsApproval: boolean;
  approvalType?: ApprovalReasonType;
  approvalNote?: string;
  isApproved?: boolean;
  isManual?: boolean;
  potonganOtomatis: number;
}

export interface LeaveRequest {
  id: string;
  tanggal: string;
  teknisiId: string;
  teknisiNama: string;
  jenis: 'Izin' | 'Cuti' | 'Sakit';
  alasan: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  dokumenUrl?: string;
}

export type JenisPotonganManual = 'Kasbon' | 'Pinjaman Karyawan' | 'Potongan Operasional Server' | 'Lainnya';

export interface PotonganManual {
  id: string;
  tanggal: string; // YYYY-MM-DD
  karyawanId: string;
  karyawanNama: string;
  serverId: string; // Server yang bersangkutan / mengeluarkan kasbon
  serverNama: string;
  jenisPotongan: JenisPotonganManual | string;
  nominal: number; // Nominal pemotongan honor tetap
  keterangan: string; // Catatan kasbon / keperluan
  isLunas?: boolean; // Status sudah diselesaikan saat pelunasan honor
  honorLunasId?: string; // ID transaksi pelunasan honor
  createdAt?: string;
  createdById?: string;
  createdByNama?: string;
}

export interface ServerBonusDetail {
  serverId: string;
  serverNama: string;
  targetPekerjaan: number; // Target kuota pekerjaan bulanan server (misal 100 pekerjaan)
  jobCount: number;        // Jumlah pekerjaan yang diselesaikan teknisi di server ini
  percentage: number;      // Persentase capaian target (misal 100% atau 90%)
  serverBonusPool: number; // Besaran nominal bonus maksimal jika target 100% (misal Rp 100.000)
  bonusAmount: number;     // Nominal bonus yang diperoleh teknisi (misal Rp 90.000)
  rank?: number;           // (Optional) Peringkat pencapaian
  totalCompetitors?: number;
}

export interface ServerPayrollBreakdown {
  serverId: string;
  serverNama: string;
  jobCount: number;
  honorTetapServer: number;
  potonganManualServer?: number;           // Potongan manual / kasbon yang dibebankan ke honor tetap server ini
  honorTetapSetelahPotongan?: number;      // Honor tetap server setelah dikurangi potongan kasbon
  honorPJWilayah: number;
  honorDasarPekerjaan: number;
  honorTitik: number;
  honorPanjangKabel: number;
  honorLembur: number;
  menitLembur?: number;            // Total menit lembur disetujui pada server ini
  lemburJobCount?: number;         // Jumlah pekerjaan dengan lembur disetujui pada server ini
  honorTransportKendaraan: number; // Transport kendaraan yang dikeluarkan server ini
  bonusTarget: number;             // Bonus pencapaian target yang dikeluarkan server ini
  estimasiHonor: number;           // Estimasi honor: Dasar + Lembur + Titik + Kabel
  totalGross: number;              // Total pengeluaran honor oleh server ini
  totalNett?: number;              // Total pengeluaran bersih server ini setelah potongan kasbon
}

export interface PayrollRecap {
  teknisiId: string;
  teknisiNama: string;
  statusKaryawan: EmployeeStatus;
  periode: string; // e.g. "2026-09"
  totalPekerjaanCount: number;
  
  // Salary Breakdown
  honorTetapServer: number;
  honorTetapSetelahPotongan?: number;      // Honor tetap bersih setelah dikurangi potongan manual kasbon
  honorPJWilayah: number;
  honorDasarPekerjaan: number;
  honorTitik: number;
  honorPanjangKabel: number;
  honorLembur: number;
  totalMenitLembur?: number;       // Total akumulasi menit lembur yang telah di-ACC
  honorTransportKendaraan: number;
  bonusTarget: number;
  bonusTargetDetails?: ServerBonusDetail[]; // Rincian perolehan bonus per server
  serverBreakdowns?: ServerPayrollBreakdown[]; // Rincian pembagian pengeluaran honor per server
  
  // Deductions
  potonganTerlambatAbsen: number;
  potonganManualKasbon: number;
  potonganManualDetails?: PotonganManual[]; // Daftar rincian potongan manual kasbon teknisi ini
  
  // Estimasi Honor (Dasar + Lembur + Titik + Kabel)
  estimasiHonor: number;

  // Final Net (Rekap Honor: Honor Tetap + PJ Wilayah + Dasar + Lembur + Titik + Kabel + Transport + Bonus - Potongan)
  totalHonorGross: number;
  totalPotongan: number;
  totalHonorNett: number;
  
  // Detailed Jobs
  jobList: JobRecord[];
  attendanceList: AttendanceRecord[];
}

export interface HonorLunasRecord {
  id: string;
  tanggalLunas: string; // YYYY-MM-DD
  periodeAwal: string;  // YYYY-MM-DD
  periodeAkhir: string; // YYYY-MM-DD
  teknisiId: string;
  teknisiNama: string;
  statusKaryawan: EmployeeStatus | string;
  serverId: string;
  namaServer: string;
  jobCount?: number;
  totalPekerjaanCount: number;
  honorTetapServer: number;
  honorPJWilayah: number;
  honorDasarPekerjaan: number;
  honorTitik: number;
  honorPanjangKabel: number;
  honorLembur: number;
  honorTransportKendaraan: number;
  bonusTarget: number;
  potonganTerlambatAbsen: number;
  potonganManualKasbon: number;
  totalHonorGross?: number;
  totalPotongan?: number;
  totalTagihanAwal?: number;
  totalHonorNett: number;
  sisaHonor?: number;
  isParsial?: boolean;
  jobIds?: string[];
  potonganIds?: string[];
  dilunaskanOleh?: string;
  dilunaskanAt?: string;
  waktuPelunasan?: string;
  catatan?: string;
}

export interface AppSettings {
  namaPerusahaan: string;
  alamatPerusahaan: string;
  logoUrl: string;
  adminUsername?: string;
  adminPassword?: string;
  jamMasukDefinisikan: string; // e.g. "08:00"
  jamPulangDefinisikan: string; // e.g. "17:00"
  hariLibur: string[]; // e.g. ["Minggu"]
  tanggalLiburKhusus?: string[]; // e.g. ["2026-10-04", "2026-12-25"] (YYYY-MM-DD)
  jumlahCutiMaksimalPerBulan?: number; // e.g. 2
  totalCutiPerTahun?: number; // e.g. 12
  toleransiKeterlambatanMenit: number; // e.g. 15
  potonganPerKeterlambatan: number; // e.g. 25000
  potonganPulangAwal: number; // e.g. 20000
  googleSheetUrl: string;
  googleAppsScriptUrl: string;
  isGoogleSheetConnected: boolean;

  // Notification & WhatsApp Gateway Configuration
  waGatewayProvider?: 'fonnte' | 'wablas' | 'custom_webhook' | 'direct';
  waApiToken?: string;
  waApiUrl?: string;
  autoNotifyTechnicianOnPlanning?: boolean;
  notifyViaBrowserPush?: boolean;
  notifyViaWhatsApp?: boolean;
}

export interface AdminNotificationEvent {
  id: string;
  type: 'technician_online' | 'attendance_submitted' | 'planning_created' | 'job_submitted';
  title: string;
  body: string;
  timestamp: number;
  data?: Record<string, any>;
  read?: boolean;
}
