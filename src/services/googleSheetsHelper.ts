import {
  ServerData,
  WilayahPekerjaan,
  JenisPekerjaan,
  Employee,
  EmployeeServerHonor,
  JobRecord,
  PlanningTask,
  AttendanceRecord,
  AbsensiStatus,
  AppSettings,
  PotonganManual,
  HonorLunasRecord
} from '../types';
import { parseCoordinate } from '../utils/coordinates';
import { PhotoCacheService } from './photoCache';
import { sanitizePhotoUrl } from '../utils/imageHelper';
import { sortJenisPekerjaan, consolidateAttendanceRecords, getNormalizedTechKey } from './storage';

export const GOOGLE_SHEETS_SCHEMA = [
  {
    sheetName: 'DataServer',
    description: 'Menyimpan data server RT/RW Net, target pekerjaan, dan honor teknisi',
    columns: [
      'ID', 'Nama Server', 'Penanggung Jawab ID', 'Nama Penanggung Jawab',
      'Alamat', 'Latitude', 'Longitude', 'Toleransi Radius (m)',
      'Honor Tetap Teknisi', 'Target Pekerjaan Bulanan', 'Bonus Target Bulanan', 'Kontak PJ'
    ]
  },
  {
    sheetName: 'DataWilayah',
    description: 'Menyimpan data wilayah operasional dan honor PJ Wilayah',
    columns: [
      'ID', 'Nama Wilayah', 'Server ID', 'Nama Server',
      'Honor PJ Wilayah', 'Besaran Transport'
    ]
  },
  {
    sheetName: 'JenisPekerjaan',
    description: 'Menyimpan jenis & sub pekerjaan beserta tarif dasar, titik, kabel & lembur',
    columns: [
      'ID', 'Jenis Pekerjaan', 'Sub Pekerjaan', 'Tarif Dasar',
      'Tarif Titik', 'Tarif Kabel /m', 'Tarif Lembur /min',
      'Butuh Input Titik', 'Butuh Panjang Kabel', 'Multi Teknisi'
    ]
  },
  {
    sheetName: 'DataKaryawan',
    description: 'Menyimpan data login, role akses, status karyawan, honor tetap per server, server penugasan & profil',
    columns: [
      'ID', 'Nama Lengkap', 'Username', 'Password', 'Role',
      'Status', 'Honor Tetap Server', 'Wilayah Handled IDs', 'Bonus Target Bulanan',
      'Kontak', 'Alamat', 'Rekening', 'Server ID', 'Nama Server'
    ]
  },
  {
    sheetName: 'DaftarPekerjaan',
    description: 'Riwayat pekerjaan teknisi di lapangan',
    columns: [
      'ID', 'Tanggal', 'Teknisi Utama', 'Teknisi Pendukung', 'Kendaraan Teknisi',
      'Jenis ID', 'Jenis Nama', 'Sub Pekerjaan', 'Server ID', 'Nama Server',
      'Wilayah Pengerjaan', 'Transport Wilayah',
      'Jumlah Titik', 'Panjang Kabel (m)', 'Ada Lembur', 'Menit Lembur',
      'Status Lembur', 'Lembur Disetujui Oleh', 'Waktu ACC Lembur',
      'Estimasi Total Honor', 'Honor Per Teknisi', 'Bukti Foto URLs', 'Catatan'
    ]
  },
  {
    sheetName: 'PlanningPekerjaan',
    description: 'Tugas pekerjaan yang direncanakan oleh Admin / PJ Server',
    columns: [
      'ID', 'Tanggal', 'Target Teknisi IDs', 'Target Teknisi Namas',
      'Server ID', 'Nama Server', 'Jenis ID', 'Sub Pekerjaan',
      'Detail Pekerjaan', 'Foto Lokasi URL', 'Status'
    ]
  },
  {
    sheetName: 'AbsensiHarian',
    description: 'Catatan Absen Masuk dan Absen Pulang harian teknisi dengan verifikasi GPS & Foto Kamera',
    columns: [
      'ID', 'Tanggal', 'Teknisi ID', 'Nama Teknisi', 'Jam Masuk', 'Foto Masuk Kamera',
      'Jam Pulang', 'Foto Pulang Kamera', 'Server ID', 'Nama Server',
      'Jarak ke Server (m)', 'Dalam Radius', 'Status', 'Keterangan', 'Potongan Otomatis'
    ]
  },
  {
    sheetName: 'ApprovalAbsensi',
    description: 'Data absensi harian, koordinat GPS dan status approval',
    columns: [
      'ID', 'Tanggal', 'Teknisi ID', 'Teknisi Nama', 'Jam Masuk',
      'Jam Pulang', 'Latitude', 'Longitude', 'Jarak (m)',
      'Dalam Radius', 'Foto Proof URL', 'Status', 'Needs Approval',
      'Approval Type', 'Potongan Otomatis'
    ]
  },
  {
    sheetName: 'RekapHonor',
    description: 'Rekapitulasi penggajian per periode bulanan',
    columns: [
      'Periode', 'Teknisi ID', 'Nama Teknisi', 'Status',
      'Total Pekerjaan', 'Honor Tetap Server', 'Honor PJ Wilayah',
      'Honor Dasar', 'Honor Titik', 'Honor Kabel', 'Honor Lembur',
      'Bonus Target', 'Potongan Absen', 'Total Net Honor'
    ]
  },
  {
    sheetName: 'PotonganManual',
    description: 'Catatan pemotongan honor manual & kasbon karyawan per server',
    columns: [
      'ID', 'Tanggal', 'Karyawan ID', 'Nama Karyawan', 'Server ID',
      'Nama Server', 'Jenis Potongan', 'Nominal', 'Keterangan', 'Dibuat Oleh'
    ]
  },
  {
    sheetName: 'HonorLunas',
    description: 'Catatan riwayat pelunasan honor teknisi yang telah dibayarkan',
    columns: [
      'ID', 'Tanggal Lunas', 'Periode Awal', 'Periode Akhir',
      'Teknisi ID', 'Nama Teknisi', 'Status', 'Server ID', 'Nama Server',
      'Total Pekerjaan', 'Honor Tetap', 'Honor PJ Wilayah',
      'Honor Dasar', 'Honor Titik', 'Honor Kabel', 'Honor Lembur',
      'Transport Kendaraan', 'Bonus Target', 'Potongan Absen', 'Potongan Kasbon',
      'Total Honor Nett', 'Job IDs', 'Dilunaskan Oleh', 'Waktu Pelunasan', 'Catatan'
    ]
  },
  {
    sheetName: 'PengaturanApp',
    description: 'Pengaturan nama perusahaan, username & password login admin, jam kerja, toleransi & potongan',
    columns: ['Key', 'Value', 'Keterangan']
  }
];

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * Google Apps Script - DPT-AlaDin Web API & Google Drive Integration (Version 3.2 - Clean)
 * Fitur Aktif:
 * 1. doGet:
 *    - ping: Cek status koneksi Google Sheets & Google Drive
 *    - getAllData: Menarik seluruh data tabel dalam format teks display murni
 * 2. doPost:
 *    - uploadImage: Simpan foto bukti/selfie langsung ke Google Drive Folder (DPT_AlaDin_Bukti_Foto)
 *    - syncFullDatabase: Sinkronisasi seluruh tabel database ke Google Sheets (Format teks '@')
 *    - savePengaturan: Simpan konfigurasi pengaturan perusahaan ke sheet PengaturanApp
 *    - updateLemburStatus: Update status ACC lembur pada sheet DaftarPekerjaan
 * Deploy sebagai Web App dengan Akses: "Anyone" (Siapa Saja)
 */

function doGet(e) {
  var action = e ? e.parameter.action : 'ping';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (!action || action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Koneksi Database DPT-AlaDin Google Sheets & Google Drive Berhasil!',
      spreadsheetName: ss.getName(),
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getAllData') {
    var sheetNames = ['DataServer', 'DataWilayah', 'JenisPekerjaan', 'DataKaryawan', 'DaftarPekerjaan', 'PlanningPekerjaan', 'AbsensiHarian', 'ApprovalAbsensi', 'PotonganManual', 'HonorLunas', 'PengaturanApp'];
    var result = {};
    for (var i = 0; i < sheetNames.length; i++) {
      var sName = sheetNames[i];
      var sh = ss.getSheetByName(sName);
      if (sh) {
        // Menggunakan getDisplayValues agar nilai jam kerja (08:00, 17:00) tidak diubah menjadi format tanggal ISO 1899
        result[sName] = sh.getDataRange().getDisplayValues();
      }
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getImage') {
    var fileId = e ? e.parameter.id : '';
    if (!fileId) return responseError('ID file diperlukan');
    try {
      var file = DriveApp.getFileById(fileId);
      var blob = file.getBlob();
      var b64 = Utilities.base64Encode(blob.getBytes());
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        mimeType: blob.getContentType(),
        base64: b64
      })).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return responseError('Gagal mengambil file: ' + err.toString());
    }
  }
  
  return responseError('Aksi GET tidak valid');
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Action Upload Foto Langsung ke Google Drive
    if (action === 'uploadImage') {
      var base64Data = postData.base64Data;
      var filename = postData.filename || ('foto_' + new Date().getTime() + '.jpg');
      var folderName = postData.folderName || 'DPT_AlaDin_Bukti_Foto';

      if (!base64Data) {
        return responseError('Data foto base64 kosong');
      }

      var folder = getOrCreateDriveFolder(folderName);
      var cleanBase64 = String(base64Data);
      var b64Idx = cleanBase64.indexOf('base64,');
      if (b64Idx !== -1) {
        cleanBase64 = cleanBase64.substring(b64Idx + 7);
      }
      // Replace spaces with '+' so characters are never dropped, then strip whitespace
      cleanBase64 = cleanBase64.split(" ").join("+").replace(/[^A-Za-z0-9+/=]/g, "");
      var bytes = Utilities.base64Decode(cleanBase64);
      var decodedBlob = Utilities.newBlob(bytes, 'image/jpeg', filename);

      var driveFile = folder.createFile(decodedBlob);
      try {
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch(eSharing) {}

      var fileId = driveFile.getId();
      var directUrl = "https://drive.usercontent.google.com/download?id=" + fileId + "&export=view";

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        fileId: fileId,
        fileUrl: directUrl,
        driveUrl: driveFile.getUrl(),
        message: 'Foto berhasil disimpan ke Google Drive!'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. Action Full Sync Semua Tabel ke Google Sheets
    if (action === 'syncFullDatabase' || action === 'syncAll') {
      var tables = postData.tables || {};
      for (var sheetName in tables) {
        if (tables.hasOwnProperty(sheetName)) {
          var tableData = tables[sheetName]; // Array of row arrays
          var sheet = getOrCreateSheet(ss, sheetName);
          
          if (tableData && tableData.length > 0) {
            // Safety sanitization
            for (var r = 0; r < tableData.length; r++) {
              for (var c = 0; c < tableData[r].length; c++) {
                var cellVal = tableData[r][c];
                if (typeof cellVal === 'string') {
                  // If base64 data was sent directly in sync table, upload to Drive automatically
                  if (cellVal.indexOf('data:image') === 0 && cellVal.length > 300) {
                    try {
                      var folderAuto = getOrCreateDriveFolder('DPT_AlaDin_Bukti_Foto');
                      var cleanB64 = cellVal;
                      var b64SubIdx = cleanB64.indexOf('base64,');
                      if (b64SubIdx !== -1) {
                        cleanB64 = cleanB64.substring(b64SubIdx + 7);
                      }
                      cleanB64 = cleanB64.split(" ").join("+").replace(/[^A-Za-z0-9+/=]/g, "");
                      var bBytes = Utilities.base64Decode(cleanB64);
                      var blob = Utilities.newBlob(bBytes, 'image/jpeg', 'auto_sync_' + new Date().getTime() + '.jpg');
                      var autoFile = folderAuto.createFile(blob);
                      try { autoFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(eS) {}
                      tableData[r][c] = "https://drive.usercontent.google.com/download?id=" + autoFile.getId() + "&export=view";
                    } catch(errB64) {
                      tableData[r][c] = "[Foto Upload Tersimpan]";
                    }
                  } else if (cellVal.length > 45000) {
                    tableData[r][c] = cellVal.substring(0, 45000);
                  }
                }
              }
            }
            sheet.clearContents();
            var targetRange = sheet.getRange(1, 1, tableData.length, tableData[0].length);
            // Format range as Plain Text '@' to prevent Google Sheets from auto-converting HH:mm times to ISO Dates
            targetRange.setNumberFormat('@');
            targetRange.setValues(tableData);
            sheet.getRange(1, 1, 1, tableData[0].length).setFontWeight("bold").setBackground("#E2E8F0");
          }
        }
      }
      return responseSuccess('Semua data berhasil disinkronkan ke Google Sheets!');
    }

    // 3. Action Khusus Simpan Pengaturan App
    if (action === 'savePengaturan') {
      var settingsData = postData.settings || {};
      var sheet = getOrCreateSheet(ss, 'PengaturanApp');
      sheet.clearContents();
      
      var rows = [
        ['Key', 'Value', 'Keterangan'],
        ['NamaPerusahaan', String(settingsData.namaPerusahaan || ''), 'Profil Perusahaan'],
        ['AlamatPerusahaan', String(settingsData.alamatPerusahaan || ''), 'Profil Perusahaan'],
        ['LogoUrl', String(settingsData.logoUrl || ''), 'Logo Perusahaan URL'],
        ['AdminUsername', String(settingsData.adminUsername || 'admin'), 'Login Admin Username'],
        ['AdminPassword', String(settingsData.adminPassword || 'admin123'), 'Login Admin Password'],
        ['JamMasukDefinisikan', String(settingsData.jamMasukDefinisikan || '08:00'), 'Jam Kerja Standar'],
        ['JamPulangDefinisikan', String(settingsData.jamPulangDefinisikan || '17:00'), 'Jam Pulang Standar'],
        ['ToleransiKeterlambatanMenit', String(settingsData.toleransiKeterlambatanMenit != null ? settingsData.toleransiKeterlambatanMenit : 15), 'Toleransi Terlambat (Menit)'],
        ['PotonganPerKeterlambatan', String(settingsData.potonganPerKeterlambatan != null ? settingsData.potonganPerKeterlambatan : 25000), 'Potongan Terlambat (Rp)'],
        ['PotonganPulangAwal', String(settingsData.potonganPulangAwal != null ? settingsData.potonganPulangAwal : 20000), 'Potongan Pulang Awal (Rp)']
      ];

      var pRange = sheet.getRange(1, 1, rows.length, 3);
      pRange.setNumberFormat('@');
      pRange.setValues(rows);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#E2E8F0");
      return responseSuccess('PengaturanApp berhasil diperbarui di Google Sheets!');
    }

    // 4. Action Update Status ACC Lembur Langsung
    if (action === 'updateLemburStatus' || action === 'approveLembur') {
      var jobId = String(postData.jobId || '').trim();
      var lemburApproved = postData.lemburApproved === true || String(postData.lemburApproved).toLowerCase() === 'true';
      var approvedBy = postData.approvedBy || 'Admin';
      var approvedAt = postData.approvedAt || new Date().toISOString();
      var sheet = getOrCreateSheet(ss, 'DaftarPekerjaan');
      var data = sheet.getDataRange().getDisplayValues();

      if (data.length > 1) {
        var header = data[0].map(function(h) { return String(h || '').toLowerCase().trim(); });
        var idCol = 0;
        var statusCol = -1;
        var byCol = -1;
        var atCol = -1;

        for (var c = 0; c < header.length; c++) {
          if (/^id$/i.test(header[c])) idCol = c;
          if (/status lembur|acc lembur|lembur acc/i.test(header[c])) statusCol = c;
          if (/disetujui oleh|approved by|acc oleh/i.test(header[c])) byCol = c;
          if (/waktu acc|approved at|tanggal acc/i.test(header[c])) atCol = c;
        }

        if (statusCol === -1) {
          statusCol = sheet.getLastColumn();
          sheet.getRange(1, statusCol + 1).setValue('Status Lembur').setFontWeight('bold').setBackground('#E2E8F0');
        }
        if (byCol === -1) {
          byCol = statusCol + 1;
          sheet.getRange(1, byCol + 1).setValue('Lembur Disetujui Oleh').setFontWeight('bold').setBackground('#E2E8F0');
        }
        if (atCol === -1) {
          atCol = byCol + 1;
          sheet.getRange(1, atCol + 1).setValue('Waktu ACC Lembur').setFontWeight('bold').setBackground('#E2E8F0');
        }

        var statusStr = lemburApproved ? 'Disetujui (ACC)' : 'Menunggu ACC';
        var byStr = lemburApproved ? approvedBy : '-';
        var atStr = lemburApproved ? approvedAt : '-';

        for (var r = 1; r < data.length; r++) {
          if (String(data[r][idCol] || '').trim() === jobId) {
            var rowNum = r + 1;
            sheet.getRange(rowNum, statusCol + 1).setNumberFormat('@').setValue(statusStr);
            sheet.getRange(rowNum, byCol + 1).setNumberFormat('@').setValue(byStr);
            sheet.getRange(rowNum, atCol + 1).setNumberFormat('@').setValue(atStr);
            return responseSuccess('Status lembur pekerjaan ' + jobId + ' (' + statusStr + ') berhasil dikonfirmasi ke Google Sheets!');
          }
        }
      }
      return responseSuccess('Konfirmasi lembur diterima untuk pekerjaan ' + jobId);
    }

    // 5. Action Simpan / Update Absensi Langsung (Cepat, Ringan & Aman)
    if (action === 'saveAttendance' || action === 'updateAttendance') {
      var att = postData.attendance;
      if (att && att.tanggal && (att.teknisiId || att.teknisiNama)) {
        var sheet = getOrCreateSheet(ss, 'AbsensiHarian');
        var dataRange = sheet.getDataRange();
        var values = dataRange.getDisplayValues();
        var targetRow = -1;
        var cleanTgl = String(att.tanggal).trim();
        var targetTechId = String(att.teknisiId || '').trim().toLowerCase();
        var targetTechNama = String(att.teknisiNama || '').trim().toLowerCase();

        // Helper normalisasi tanggal untuk perbandingan di GAS (mendukung YYYY-MM-DD dan DD/MM/YYYY)
        function normalizeDateForMatch(dStr) {
          if (!dStr) return '';
          var s = String(dStr).trim().split('T')[0];
          var dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
          if (dmy) {
            var y = dmy[3].length === 2 ? ('20' + dmy[3]) : dmy[3];
            return y + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
          }
          return s;
        }
        var matchTargetTgl = normalizeDateForMatch(cleanTgl);

        // Cari indeks kolom secara dinamis berdasarkan baris header
        var header = values.length > 0 ? values[0].map(function(h) { return String(h || '').toLowerCase().trim(); }) : [];
        var colJamPulang = -1;
        var colFotoPulang = -1;
        var colStatus = -1;
        var colKet = -1;
        for (var c = 0; c < header.length; c++) {
          if (/^(?=.*(pulang|keluar|out|checkout|selesai))(?!.*(?:foto|bukti|kamera|selfie|image)).*$/i.test(header[c])) colJamPulang = c;
          if (/(?:foto|bukti|kamera|selfie|image).*(?:pulang|keluar|out)|(?:pulang|keluar|out).*(?:foto|bukti|kamera|selfie|image)/i.test(header[c])) colFotoPulang = c;
          if (/^status$/i.test(header[c])) colStatus = c;
          if (/keterangan|catatan|notes/i.test(header[c])) colKet = c;
        }
        if (colJamPulang === -1) colJamPulang = 6;
        if (colFotoPulang === -1) colFotoPulang = 7;
        if (colStatus === -1) colStatus = 12;
        if (colKet === -1) colKet = 13;
        
        for (var r = 1; r < values.length; r++) {
          var rowTgl = normalizeDateForMatch(values[r][1]);
          var rowTechId = String(values[r][2] || '').trim().toLowerCase();
          var rowTechNama = String(values[r][3] || '').trim().toLowerCase();
          var rowId = String(values[r][0] || '').trim();

          var isDateMatch = (rowTgl === matchTargetTgl) || (String(values[r][1]).trim() === cleanTgl);
          var isTechMatch = (rowTechId && targetTechId && (rowTechId === targetTechId || rowTechId === ('emp-' + targetTechId) || targetTechId === ('emp-' + rowTechId))) ||
                            (rowTechNama && targetTechNama && (rowTechNama === targetTechNama || rowTechNama.indexOf(targetTechNama) !== -1 || targetTechNama.indexOf(rowTechNama) !== -1));
          var isIdMatch = Boolean(att.id && rowId && rowId === att.id);

          if (isIdMatch || (isDateMatch && isTechMatch)) {
            targetRow = r + 1;
            break;
          }
        }
        
        if (targetRow > 0) {
          if (att.jamPulang) sheet.getRange(targetRow, colJamPulang + 1).setNumberFormat('@').setValue(att.jamPulang);
          if (att.fotoPulangUrl) sheet.getRange(targetRow, colFotoPulang + 1).setNumberFormat('@').setValue(att.fotoPulangUrl);
          if (att.status) sheet.getRange(targetRow, colStatus + 1).setNumberFormat('@').setValue(att.status);
          if (att.keteranganPulang) {
            var existingKet = sheet.getRange(targetRow, colKet + 1).getValue();
            sheet.getRange(targetRow, colKet + 1).setNumberFormat('@').setValue(existingKet ? (existingKet + ' | ' + att.keteranganPulang) : att.keteranganPulang);
          }
        } else {
          sheet.appendRow([
            att.id || ('att-' + new Date().getTime()),
            att.tanggal,
            att.teknisiId || '',
            att.teknisiNama || '',
            att.jamMasuk || '08:00',
            att.fotoProofUrl || '',
            att.jamPulang || '',
            att.fotoPulangUrl || '',
            att.serverId || '',
            att.serverNama || '',
            att.distanceMeter || 0,
            att.isWithinRadius ? 'Ya' : 'Tidak',
            att.status || 'Hadir',
            att.keterangan || '',
            att.potonganOtomatis || 0
          ]);
        }
        return responseSuccess('Absensi berhasil disimpan langsung ke Google Sheets!');
      }
    }
    
    return responseError('Action POST tidak valid');
  } catch (err) {
    return responseError(err.toString());
  }
}

// Helper: Ambil Sheet atau Buat Otomatis Jika Belum Ada
function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

// Helper: Ambil Folder Google Drive atau Buat Otomatis
function getOrCreateDriveFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function responseSuccess(msg) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: msg
  })).setMimeType(ContentService.MimeType.JSON);
}

function responseError(msg) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: msg
  })).setMimeType(ContentService.MimeType.JSON);
}
`;

/**
 * Utility to sanitize time string values from Google Sheets or form inputs.
 * Converts decimal fractions, ISO date strings, "17.00.00", "05:00 PM",
 * "08.00", "08:00:00", integer hours (e.g. "17"), and checkout phrases into clean "HH:mm" format.
 */
export function sanitizeTimeString(val: any, defaultTime = '08:00'): string {
  if (val === undefined || val === null) return defaultTime;
  let str = String(val).trim();
  if (!str || str === '-' || str === '--:--' || str === 'null' || str === 'undefined' || str === '--' || /^(belum|pending)/i.test(str)) return defaultTime;

  // 1. Decimal number / fraction of day from Google Sheets / Excel (e.g. 0.7083333333333334 for 17:00, or serial date fraction)
  const numVal = typeof val === 'number' ? val : Number(str);
  if (!isNaN(numVal) && numVal > 0 && (numVal < 1 || (numVal > 1 && numVal % 1 !== 0 && numVal < 1000))) {
    const fraction = numVal % 1;
    const totalMinutes = Math.round(fraction * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // Clean trailing timezone strings common in Indonesia (WIB, WIT, WITA)
  str = str.replace(/\s*(WIB|WIT|WITA)\s*/gi, '').trim();

  // If plain integer hour (e.g. "17", "18", 17, 8)
  const hourOnly = str.match(/^([01]?\d|2[0-3])$/);
  if (hourOnly) {
    return `${hourOnly[1].padStart(2, '0')}:00`;
  }

  // Handle textual checkout phrases common in sheets (e.g. "Sudah Pulang", "Pulang", "Selesai")
  if (/^(sudah\s*pulang|pulang|selesai|selesai\s*kerja|checkout|check\s*out|hadir)$/i.test(str)) {
    return defaultTime || '17:00';
  }

  // Handle 12-hour AM/PM formats (e.g. "05:00 PM", "5:00 PM", "04:15:20 AM")
  const pmMatch = str.match(/(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(AM|PM)/i);
  if (pmMatch) {
    let hour = parseInt(pmMatch[1], 10);
    const minute = pmMatch[2];
    const meridiem = pmMatch[3].toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  // Handle datetime strings (e.g. "2026-10-04 16:30:00", "04/10/2026 16:30:00", "04.10.2026 16.30")
  const dateTimeMatch = str.match(/(?:[\d\/\-\.]{8,10})\s+([01]?\d|2[0-3])[:.]([0-5]\d)/);
  if (dateTimeMatch) {
    return `${dateTimeMatch[1].padStart(2, '0')}:${dateTimeMatch[2]}`;
  }

  // Handle ISO string with T
  if (str.includes('T')) {
    const timeSub = str.split('T')[1];
    if (timeSub) {
      const match = timeSub.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)/);
      if (match && !str.includes('Z')) {
        return `${match[1].padStart(2, '0')}:${match[2]}`;
      }
    }
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        try {
          const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          const formatted = formatter.format(d);
          const parts = formatted.split(':');
          if (parts.length === 2) {
            let h = Number(parts[0]);
            let m = Number(parts[1]);
            // If historical 1899 Batavia offset (+7m), round to closest 5 minutes
            if (str.includes('1899-12-30') && m % 5 !== 0) {
              m = Math.round(m / 5) * 5;
              if (m === 60) { m = 0; h = (h + 1) % 24; }
            }
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }
        } catch {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        }
      }
    } catch {}
  }

  // Standard "HH:mm" or "H:mm" with colon or dot
  const cleanMatch = str.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
  if (cleanMatch) {
    return `${cleanMatch[1].padStart(2, '0')}:${cleanMatch[2]}`;
  }

  // "HH:mm:ss" or "H:mm:ss" or "HH.mm.ss"
  const hmsMatch = str.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)[:.]([0-5]\d)(?:\.\d+)?$/);
  if (hmsMatch) {
    return `${hmsMatch[1].padStart(2, '0')}:${hmsMatch[2]}`;
  }

  // Any embedded time pattern in string with word boundaries (e.g. "pukul 17.00", "jam 17:00")
  const generalMatch = str.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (generalMatch) {
    return `${generalMatch[1].padStart(2, '0')}:${generalMatch[2]}`;
  }

  return defaultTime;
}

/**
 * Helper to get local date string YYYY-MM-DD reliably in Asia/Jakarta timezone
 */
export function getEffectiveTodayISO(d: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Utility to sanitize date strings into YYYY-MM-DD taking into account local timezone (WIB)
 * Supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, 2-digit years, Indonesian month names,
 * day-only numbers ("10"), and Google Sheets / Excel serial numbers.
 */
export function sanitizeDateString(val: any, defaultDate?: string): string {
  const fallback = defaultDate || getEffectiveTodayISO();
  if (val === undefined || val === null) return fallback;
  let str = String(val).trim();
  if (!str || str === '-' || str === 'null' || str === 'undefined' || str === '--') return fallback;

  // 1. Google Sheets / Excel numeric serial date (e.g. 45575, 46305)
  const numVal = typeof val === 'number' ? val : Number(str);
  if (!isNaN(numVal) && numVal > 30000 && numVal < 60000) {
    const d = new Date(Math.round((numVal - 25569) * 86400 * 1000));
    return getEffectiveTodayISO(d);
  }

  // 2. ISO string like 2026-10-09T17:00:00.000Z or date with time: parse using Asia/Jakarta
  if (str.includes('T') || str.includes('Z')) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return getEffectiveTodayISO(parsed);
    }
    return str.split('T')[0];
  }

  // 3. Isolated day-only number (e.g. "10" for the 10th of current month)
  const dayOnlyMatch = str.match(/^([1-9]|[12]\d|3[01])$/);
  if (dayOnlyMatch) {
    const cur = getEffectiveTodayISO();
    const [y, m] = cur.split('-');
    return `${y}-${m}-${dayOnlyMatch[1].padStart(2, '0')}`;
  }

  // 4. Day and month only without year (e.g. "10/10", "10-10", "10.10")
  const dmMatch = str.match(/^([1-9]|[12]\d|3[01])[\/\-\.]([1-9]|0[1-9]|1[0-2])$/);
  if (dmMatch) {
    const curYr = new Date().getFullYear();
    return `${curYr}-${dmMatch[2].padStart(2, '0')}-${dmMatch[1].padStart(2, '0')}`;
  }

  // 5. Indonesian month names (e.g. "10 Okt 2026", "10 Oktober 2026", "10-Okt-2026")
  const indMonthRegex = /^(\d{1,2})[\s\-\/\.]([a-zA-Z]{3,9})[\s\-\/\.](\d{2,4})/;
  const indMatch = str.match(indMonthRegex);
  if (indMatch) {
    const mStr = indMatch[2].toLowerCase();
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
      jun: '06', jul: '07', agu: '08', ags: '08', aug: '08', sep: '09',
      okt: '10', oct: '10', nop: '11', nov: '11', des: '12', dec: '12'
    };
    const prefix = mStr.substring(0, 3);
    const mNum = months[prefix];
    if (mNum) {
      let yr = indMatch[3];
      if (yr.length === 2) yr = '20' + yr;
      return `${yr}-${mNum}-${indMatch[1].padStart(2, '0')}`;
    }
  }

  // 6. DD/MM/YY or DD-MM-YY with 2-digit year
  const dmyShortMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyShortMatch) {
    return `20${dmyShortMatch[3]}-${dmyShortMatch[2].padStart(2, '0')}-${dmyShortMatch[1].padStart(2, '0')}`;
  }

  // 7. Standard DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  // 8. Standard YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // 9. Standard Date parsing for string representations (e.g. "Sat Oct 10 2026", "October 10, 2026")
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2035) {
      return getEffectiveTodayISO(d);
    }
  } catch {}

  return str;
}

export interface AttendanceEvaluationResult {
  status: 'Hadir' | 'Pending Approval' | 'Terlambat' | 'Ditolak';
  needsApproval: boolean;
  approvalType?: 'Terlambat' | 'Pulang Awal' | 'Terlambat & Pulang Awal' | 'Di Luar Jam Kerja' | 'Luar Radius' | 'Izin / Cuti';
  potonganOtomatis: number;
  reason?: string;
}

/**
 * Utility to check if a specific date is a configured holiday (weekly day off or custom holiday date)
 */
export function isHolidayDate(dateStr?: string, settings?: Partial<AppSettings> | AppSettings | null): { isHoliday: boolean; reason?: string; dayName?: string } {
  if (!dateStr) return { isHoliday: false };
  const cleanDate = sanitizeDateString(dateStr);

  // 1. Check custom / national holiday dates (supports "2026-10-04" or "2026-10-04|Keterangan")
  if (settings?.tanggalLiburKhusus && Array.isArray(settings.tanggalLiburKhusus)) {
    for (const item of settings.tanggalLiburKhusus) {
      if (!item) continue;
      const parts = String(item).split('|');
      const itemDate = sanitizeDateString(parts[0]);
      if (itemDate === cleanDate) {
        const customReason = parts[1]?.trim() || 'Tanggal Libur Khusus / Nasional';
        return { isHoliday: true, reason: customReason };
      }
    }
  }

  // 2. Check regular weekly day off (e.g. Minggu, Sabtu)
  const hariNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  try {
    const d = new Date(cleanDate + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      const dayName = hariNames[d.getDay()];
      const activeHariLibur = (settings?.hariLibur && Array.isArray(settings.hariLibur) && settings.hariLibur.length > 0)
        ? settings.hariLibur
        : ['Minggu'];
      if (activeHariLibur.includes(dayName)) {
        return { isHoliday: true, reason: `Hari Libur (${dayName})`, dayName };
      }
    }
  } catch {}

  return { isHoliday: false };
}

/**
 * Centralized business rule evaluation for attendance approval
 * Checks for:
 * 1. Late arrival (> jamMasuk + toleransiKeterlambatan)
 * 2. Early checkout (< jamPulang standar)
 * 3. Outside work hours / Hari libur
 * 4. Outside server radius (!isWithinRadius)
 */
export function evaluateAttendanceApproval(params: {
  jamMasuk: string;
  jamPulang?: string;
  tanggal: string;
  isWithinRadius?: boolean;
  distanceMeter?: number;
  settings?: any;
  alreadyApproved?: boolean;
}): AttendanceEvaluationResult {
  const settings = params.settings;
  const stdMasuk = sanitizeTimeString(settings?.jamMasukDefinisikan, '08:00');
  const stdPulang = sanitizeTimeString(settings?.jamPulangDefinisikan, '17:00');
  const toleransi = Number(settings?.toleransiKeterlambatanMenit ?? 15);
  const potonganTerlambat = Number(settings?.potonganPerKeterlambatan ?? 25000);

  const cleanJamMasuk = sanitizeTimeString(params.jamMasuk, '08:00');
  const [inH, inM] = cleanJamMasuk.split(':').map(Number);
  const checkInMinutes = (inH || 0) * 60 + (inM || 0);

  const [stdH, stdM] = stdMasuk.split(':').map(Number);
  const maxOnTimeMinutes = (stdH || 8) * 60 + (stdM || 0) + toleransi;

  const [pulangH, pulangM] = stdPulang.split(':').map(Number);
  const endOfDayMinutes = (pulangH || 17) * 60 + (pulangM || 0);

  // Check early checkout (pulang lebih awal dari jam operasional yang ditentukan)
  let isEarlyDeparture = false;
  let cleanJamPulang = '';
  if (params.jamPulang && params.jamPulang !== '-' && params.jamPulang.trim()) {
    cleanJamPulang = sanitizeTimeString(params.jamPulang, '');
    if (cleanJamPulang && cleanJamPulang.includes(':')) {
      const [outH, outM] = cleanJamPulang.split(':').map(Number);
      const checkOutMinutes = (outH || 0) * 60 + (outM || 0);
      if (checkOutMinutes < endOfDayMinutes) {
        isEarlyDeparture = true;
      }
    }
  }

  // 1. Check Hari Libur (Mingguan maupun Tanggal Khusus)
  const holidayCheck = isHolidayDate(params.tanggal, settings);
  const isHariLibur = holidayCheck.isHoliday;

  // 2. Check Luar Radius
  const isOutsideRadius = params.isWithinRadius === false;

  // 3. Check Terlambat
  const isLate = checkInMinutes > maxOnTimeMinutes;

  // 4. Check Di Luar Jam Kerja (outside operational hours or on weekend/holiday)
  const isOutsideHours = isHariLibur || checkInMinutes > endOfDayMinutes || checkInMinutes < ((stdH || 8) * 60 - 120);

  // Jika sudah disetujui sebelumnya oleh admin atau berstatus Hadir
  if (params.alreadyApproved) {
    return {
      status: 'Hadir',
      needsApproval: false,
      potonganOtomatis: 0
    };
  }

  if (isLate || isEarlyDeparture || isOutsideRadius || isOutsideHours) {
    let approvalType: 'Terlambat' | 'Pulang Awal' | 'Terlambat & Pulang Awal' | 'Di Luar Jam Kerja' | 'Luar Radius' = 'Terlambat';
    let reason = '';
    const limitStr = `${String(Math.floor(maxOnTimeMinutes / 60)).padStart(2, '0')}:${String(maxOnTimeMinutes % 60).padStart(2, '0')}`;

    if (isOutsideRadius) {
      approvalType = 'Luar Radius';
      reason = `Lokasi berada di luar radius server (${params.distanceMeter || 0}m)`;
    } else if (isLate && isEarlyDeparture) {
      approvalType = 'Terlambat & Pulang Awal';
      reason = `Terlambat hadir (${cleanJamMasuk} WIB, batas ${limitStr}) & Pulang lebih awal (${cleanJamPulang} WIB, jam pulang ${stdPulang} WIB)`;
    } else if (isLate) {
      approvalType = 'Terlambat';
      reason = `Terlambat hadir (${cleanJamMasuk} WIB, batas toleransi ${limitStr})`;
    } else if (isEarlyDeparture) {
      approvalType = 'Pulang Awal';
      reason = `Pulang lebih awal (${cleanJamPulang} WIB, jam kerja selesai ${stdPulang} WIB)`;
    } else if (isOutsideHours) {
      approvalType = 'Di Luar Jam Kerja';
      reason = isHariLibur
        ? `Absensi pada hari libur (${holidayCheck.reason || 'Hari Libur Operasional'}) - Perlu Approval Admin`
        : 'Absensi di luar rentang jam operasional';
    }

    return {
      status: 'Pending Approval',
      needsApproval: true,
      approvalType,
      potonganOtomatis: isLate ? potonganTerlambat : 0,
      reason
    };
  }

  return {
    status: 'Hadir',
    needsApproval: false,
    potonganOtomatis: 0
  };
}

// Helper for preparing full database sync payload to Google Sheets
export function buildGoogleSheetsSyncPayload(data: {
  servers: any[];
  wilayah: any[];
  jenisList: any[];
  employees: any[];
  jobs: any[];
  planningTasks: any[];
  attendanceList: any[];
  potonganManualList?: any[];
  honorLunasList?: any[];
  settings: any;
}) {
  const logoStr = String(data.settings?.logoUrl || '');
  const safeLogoUrl = logoStr.startsWith('data:image/') && logoStr.length > 2000
    ? '[Logo Image (Base64)]'
    : logoStr;

  const rawTables = {
    DataServer: [
      ['ID', 'Nama Server', 'Penanggung Jawab ID', 'Nama Penanggung Jawab', 'Alamat', 'Latitude', 'Longitude', 'Toleransi Radius (m)', 'Honor Tetap Teknisi', 'Target Pekerjaan Bulanan', 'Bonus Target Bulanan', 'Kontak PJ'],
      ...data.servers.map(s => [
        s.id,
        s.namaServer,
        s.penanggungJawabId,
        s.penanggungJawabNama,
        s.alamat,
        s.lat,
        s.lng,
        s.toleransiRadiusMeter,
        s.honorTetapTeknisi,
        (s.targetPekerjaanBulanan !== undefined ? s.targetPekerjaanBulanan : 100),
        (s.bonusTargetBulanan !== undefined ? s.bonusTargetBulanan : 100000),
        s.kontakPJ
      ])
    ],
    DataWilayah: [
      ['ID', 'Nama Wilayah', 'Server ID', 'Nama Server', 'Honor PJ Wilayah', 'Besaran Transport'],
      ...data.wilayah.map(w => [
        w.id, w.namaWilayah, w.serverId, w.namaServer, w.honorPJWilayah, w.besaranTransport
      ])
    ],
    JenisPekerjaan: [
      ['ID', 'Jenis Pekerjaan', 'Sub Pekerjaan', 'Tarif Dasar', 'Tarif Titik', 'Tarif Kabel /m', 'Tarif Lembur /min', 'Butuh Input Titik', 'Butuh Panjang Kabel', 'Multi Teknisi'],
      ...data.jenisList.map(j => [
        j.id, j.jenisPekerjaan, j.subPekerjaan, j.tarifDasar, j.tarifTitik, j.tarifTarikKabelPerMeter, j.tarifLemburPerMenit, j.butuhInputTitik, j.butuhPanjangKabel, j.isMultiTeknisi
      ])
    ],
    DataKaryawan: [
      ['ID', 'Nama Lengkap', 'Username', 'Password', 'Role', 'Status', 'Honor Tetap Server', 'Wilayah Handled IDs', 'Bonus Target Bulanan', 'Kontak', 'Alamat', 'Rekening', 'Server ID', 'Nama Server'],
      ...data.employees.map(e => [
        e.id,
        e.namaLengkap,
        e.username,
        e.password || '',
        e.role,
        e.status,
        e.serverHonors && e.serverHonors.length > 0
          ? e.serverHonors.filter(sh => (Number(sh.nominal) || 0) > 0).map(sh => `${sh.namaServer || sh.serverId}: ${sh.nominal}`).join('; ')
          : '',
        (e.wilayahHandledIds || []).join(', '),
        e.bonusTargetBulanan,
        e.kontak || '',
        e.alamat || '',
        e.rekening || '',
        e.serverId || '',
        e.namaServer || ''
      ])
    ],
    DaftarPekerjaan: [
      ['ID', 'Tanggal', 'Teknisi Utama', 'Teknisi Pendukung', 'Kendaraan Teknisi', 'Jenis ID', 'Jenis Nama', 'Sub Pekerjaan', 'Server ID', 'Nama Server', 'Wilayah Pengerjaan', 'Transport Wilayah', 'Jumlah Titik', 'Panjang Kabel (m)', 'Ada Lembur', 'Menit Lembur', 'Status Lembur', 'Lembur Disetujui Oleh', 'Waktu ACC Lembur', 'Estimasi Total Honor', 'Honor Per Teknisi', 'Bukti Foto URLs', 'Catatan'],
      ...data.jobs.map(j => {
        const mainTechNama = j.teknisiNamas?.[0] || '';
        const supportTechNamas = (j.teknisiNamas || []).slice(1).join(', ') || '-';
        const vehiclesDetail = j.teknisiVehicles
          ? Object.entries(j.teknisiVehicles).map(([tid, v]) => {
              const empName = (data.employees || []).find((e: any) => e.id === tid)?.namaLengkap || tid;
              return `${empName} (${v})`;
            }).join('; ')
          : 'Inventaris';

        // Sanitize photos: ensure strings don't cause cell overflow if offline/uncompressed
        const rawPhotos = (j.buktiFotoUrls && j.buktiFotoUrls.length > 0)
          ? j.buktiFotoUrls
          : (j.buktiFotoUrl ? [j.buktiFotoUrl] : []);
        
        const safePhotosStr = rawPhotos
          .map(url => (typeof url === 'string' && url.startsWith('data:image') && url.length > 30000 ? '[Foto Base64]' : url))
          .join(' | ');

        // Clean date format YYYY-MM-DD
        const cleanTgl = sanitizeDateString(j.tanggal);

        // Wilayah pengerjaan text string (can be multi wilayah)
        const wilayahStr = (j.wilayahNamas && j.wilayahNamas.length > 0)
          ? j.wilayahNamas.join(', ')
          : (j.wilayahId ? ((data.wilayah || []).find((w: any) => w.id === j.wilayahId)?.namaWilayah || j.wilayahId) : '-');

        // Total transport nominal
        const transportVal = Number(j.totalTransportWilayah !== undefined ? j.totalTransportWilayah : (j.transport || 0));

        // Resolve safe server name
        const srvObj = (data.servers || []).find((s: any) => s.id === j.serverId || s.id === j.namaServer || s.namaServer === j.namaServer);
        const resolvedNamaServer = srvObj ? srvObj.namaServer : (j.namaServer && !j.namaServer.startsWith('srv-') ? j.namaServer : '-');

        const statusLemburStr = j.adaLembur
          ? (j.lemburApproved ? 'Disetujui (ACC)' : 'Menunggu ACC')
          : 'Tanpa Lembur';
        const lemburByStr = (j.adaLembur && j.lemburApproved) ? (j.lemburApprovedBy || 'Admin') : '-';
        const lemburAtStr = (j.adaLembur && j.lemburApproved) ? (j.lemburApprovedAt || '-') : '-';

        return [
          j.id,
          cleanTgl,
          mainTechNama,
          supportTechNamas,
          vehiclesDetail,
          j.jenisPekerjaanId,
          j.jenisPekerjaanNama,
          j.subPekerjaanNama,
          j.serverId,
          resolvedNamaServer,
          wilayahStr,
          transportVal,
          j.jumlahTitik,
          j.panjangKabelMeter,
          j.adaLembur ? 'Ya' : 'Tidak',
          j.menitLembur,
          statusLemburStr,
          lemburByStr,
          lemburAtStr,
          j.estimasiTotalHonor,
          j.honorPerTeknisi,
          safePhotosStr,
          j.catatan || ''
        ];
      })
    ],
    PlanningPekerjaan: [
      ['ID', 'Tanggal', 'Target Teknisi IDs', 'Target Teknisi Namas', 'Server ID', 'Nama Server', 'Jenis ID', 'Sub Pekerjaan', 'Detail Pekerjaan', 'Foto Lokasi URL', 'Status'],
      ...data.planningTasks.map(p => [
        p.id, sanitizeDateString(p.tanggal), (p.targetTeknisiIds || []).join(','), (p.targetTeknisiNamas || []).join(','), p.serverId, p.namaServer, p.jenisPekerjaanId, p.subPekerjaanNama, p.detailPekerjaan, p.fotoLokasiUrl, p.status
      ])
    ],
    AbsensiHarian: [
      ['ID', 'Tanggal', 'Teknisi ID', 'Nama Teknisi', 'Jam Masuk', 'Foto Masuk Kamera', 'Jam Pulang', 'Foto Pulang Kamera', 'Server ID', 'Nama Server', 'Jarak ke Server (m)', 'Dalam Radius', 'Status', 'Keterangan', 'Potongan Otomatis'],
      ...data.attendanceList.map(a => {
        const isPending = Boolean(a.needsApproval || a.status === 'Pending Approval');
        const rawMasuk = sanitizePhotoUrl(a.fotoProofUrl);
        const rawPulang = sanitizePhotoUrl(a.fotoPulangUrl);

        if (rawMasuk && rawMasuk.startsWith('data:image')) {
          if (a.id) PhotoCacheService.set(`${a.id}_masuk`, rawMasuk);
          PhotoCacheService.set('[Foto Masuk Tersimpan]', rawMasuk);
        }
        if (rawPulang && rawPulang.startsWith('data:image')) {
          if (a.id) PhotoCacheService.set(`${a.id}_pulang`, rawPulang);
          PhotoCacheService.set('[Foto Pulang Tersimpan]', rawPulang);
        }

        const cleanFotoMasuk = rawMasuk && rawMasuk.startsWith('data:image') && rawMasuk.length > 500
          ? '[Foto Masuk Tersimpan]'
          : rawMasuk;
        const cleanFotoPulang = rawPulang && rawPulang.startsWith('data:image') && rawPulang.length > 500
          ? '[Foto Pulang Tersimpan]'
          : rawPulang;

        return [
          a.id,
          sanitizeDateString(a.tanggal),
          a.teknisiId,
          a.teknisiNama,
          sanitizeTimeString(a.jamMasuk, '08:00'),
          cleanFotoMasuk,
          a.jamPulang ? sanitizeTimeString(a.jamPulang, '') : '',
          cleanFotoPulang,
          a.serverId || '',
          a.serverNama || '',
          a.distanceMeter || 0,
          a.isWithinRadius ? 'Ya' : 'Tidak',
          isPending ? 'Pending Approval' : (a.status || 'Hadir'),
          a.keterangan || (isPending ? (a.approvalType || 'Perlu Approval') : ''),
          a.potonganOtomatis || 0
        ];
      })
    ],
    ApprovalAbsensi: [
      ['ID', 'Tanggal', 'Teknisi ID', 'Teknisi Nama', 'Jam Masuk', 'Jam Pulang', 'Latitude', 'Longitude', 'Jarak (m)', 'Dalam Radius', 'Foto Proof URL', 'Status', 'Needs Approval', 'Approval Type', 'Potongan Otomatis'],
      ...data.attendanceList.map(a => {
        const isPending = Boolean(a.needsApproval || a.status === 'Pending Approval');
        const rawMasuk = sanitizePhotoUrl(a.fotoProofUrl);
        const cleanFotoMasuk = rawMasuk && rawMasuk.startsWith('data:image') && rawMasuk.length > 500
          ? '[Foto Masuk Tersimpan]'
          : rawMasuk;

        return [
          a.id,
          sanitizeDateString(a.tanggal),
          a.teknisiId,
          a.teknisiNama,
          sanitizeTimeString(a.jamMasuk, '08:00'),
          a.jamPulang ? sanitizeTimeString(a.jamPulang, '') : '',
          a.lat || 0,
          a.lng || 0,
          a.distanceMeter || 0,
          a.isWithinRadius ? 'Ya' : 'Tidak',
          cleanFotoMasuk,
          isPending ? 'Pending Approval' : (a.status || 'Hadir'),
          isPending ? 'Ya' : 'Tidak',
          a.approvalType || (isPending ? 'Terlambat' : ''),
          a.potonganOtomatis || 0
        ];
      })
    ],
    PengaturanApp: [
      ['Key', 'Value', 'Keterangan'],
      ['NamaPerusahaan', data.settings?.namaPerusahaan || '', 'Profil Perusahaan'],
      ['AlamatPerusahaan', data.settings?.alamatPerusahaan || '', 'Profil Perusahaan'],
      ['LogoUrl', safeLogoUrl, 'Logo Perusahaan URL'],
      ['AdminUsername', data.settings?.adminUsername || 'admin', 'Login Admin Username'],
      ['AdminPassword', data.settings?.adminPassword || 'admin123', 'Login Admin Password'],
      ['JamMasukDefinisikan', sanitizeTimeString(data.settings?.jamMasukDefinisikan, '08:00'), 'Jam Kerja Standar'],
      ['JamPulangDefinisikan', sanitizeTimeString(data.settings?.jamPulangDefinisikan, '17:00'), 'Jam Pulang Standar'],
      ['ToleransiKeterlambatanMenit', data.settings?.toleransiKeterlambatanMenit ?? 15, 'Toleransi Terlambat (Menit)'],
      ['PotonganPerKeterlambatan', data.settings?.potonganPerKeterlambatan ?? 25000, 'Potongan Terlambat (Rp)'],
      ['PotonganPulangAwal', data.settings?.potonganPulangAwal ?? 20000, 'Potongan Pulang Awal (Rp)'],
      ['HariLibur', (data.settings?.hariLibur && data.settings.hariLibur.length > 0 ? data.settings.hariLibur : ['Minggu']).join(', '), 'Hari Libur Operasional Mingguan'],
      ['TanggalLiburKhusus', (data.settings?.tanggalLiburKhusus || []).join(', '), 'Tanggal Libur Khusus / Nasional (YYYY-MM-DD)'],
      ['JumlahCutiMaksimalPerBulan', data.settings?.jumlahCutiMaksimalPerBulan ?? 2, 'Batas Maksimal Cuti Bulanan (Hari/Bulan)'],
      ['TotalCutiPerTahun', data.settings?.totalCutiPerTahun ?? 12, 'Total Kuota Cuti Tahunan (Hari/Tahun)'],
      ['WaGatewayProvider', data.settings?.waGatewayProvider || 'fonnte', 'WhatsApp Gateway Provider (fonnte/wablas/custom)'],
      ['WaApiToken', data.settings?.waApiToken || '', 'API Token WhatsApp Gateway'],
      ['WaApiUrl', data.settings?.waApiUrl || 'https://api.fonnte.com/send', 'URL Endpoint API WhatsApp'],
      ['AutoNotifyTechnicianOnPlanning', data.settings?.autoNotifyTechnicianOnPlanning !== false ? 'Ya' : 'Tidak', 'Auto Notifikasi Teknisi saat Planning Baru'],
      ['NotifyViaBrowserPush', data.settings?.notifyViaBrowserPush !== false ? 'Ya' : 'Tidak', 'Notifikasi Push Layar HP & Laptop'],
      ['NotifyViaWhatsApp', data.settings?.notifyViaWhatsApp !== false ? 'Ya' : 'Tidak', 'Notifikasi Pesan WhatsApp ke HP Teknisi']
    ],
    PotonganManual: [
      ['ID', 'Tanggal', 'Karyawan ID', 'Nama Karyawan', 'Server ID', 'Nama Server', 'Jenis Potongan', 'Nominal', 'Keterangan', 'Dibuat Oleh'],
      ...(data.potonganManualList || []).map(p => [
        p.id,
        sanitizeDateString(p.tanggal),
        p.karyawanId,
        p.karyawanNama,
        p.serverId,
        p.serverNama,
        p.jenisPotongan,
        p.nominal || 0,
        p.keterangan || '',
        p.createdByNama || 'Admin'
      ])
    ],
    HonorLunas: [
      ['ID', 'Tanggal Lunas', 'Periode Awal', 'Periode Akhir', 'Teknisi ID', 'Nama Teknisi', 'Status', 'Server ID', 'Nama Server', 'Total Pekerjaan', 'Honor Tetap', 'Honor PJ Wilayah', 'Honor Dasar', 'Honor Titik', 'Honor Kabel', 'Honor Lembur', 'Transport Kendaraan', 'Bonus Target', 'Potongan Absen', 'Potongan Kasbon', 'Total Honor Nett', 'Job IDs', 'Dilunaskan Oleh', 'Waktu Pelunasan', 'Catatan'],
      ...(data.honorLunasList || []).map(hl => [
        hl.id,
        sanitizeDateString(hl.tanggalLunas),
        sanitizeDateString(hl.periodeAwal),
        sanitizeDateString(hl.periodeAkhir),
        hl.teknisiId,
        hl.teknisiNama,
        hl.statusKaryawan,
        hl.serverId || '',
        hl.namaServer || '',
        hl.totalPekerjaanCount || 0,
        hl.honorTetapServer || 0,
        hl.honorPJWilayah || 0,
        hl.honorDasarPekerjaan || 0,
        hl.honorTitik || 0,
        hl.honorPanjangKabel || 0,
        hl.honorLembur || 0,
        hl.honorTransportKendaraan || 0,
        hl.bonusTarget || 0,
        hl.potonganTerlambatAbsen || 0,
        hl.potonganManualKasbon || 0,
        hl.totalHonorNett || 0,
        Array.isArray(hl.jobIds) ? hl.jobIds.join(',') : (hl.jobIds || ''),
        hl.dilunaskanOleh || 'Admin',
        hl.waktuPelunasan || '',
        hl.catatan || ''
      ])
    ]
  };

  // Sanitize all table cells so no undefined/null values are ever passed to Google Apps Script
  const sanitizedTables: Record<string, any[][]> = {};
  for (const sheetName in rawTables) {
    if (Object.prototype.hasOwnProperty.call(rawTables, sheetName)) {
      sanitizedTables[sheetName] = rawTables[sheetName as keyof typeof rawTables].map(row =>
        row.map(cell => (cell === undefined || cell === null ? '' : cell))
      );
    }
  }

  return {
    action: 'syncFullDatabase',
    tables: sanitizedTables
  };
}

// Helper to send POST request safely to Google Apps Script Web App without CORS preflight blocking
export async function sendToGoogleAppsScript(scriptUrl: string, payload: any) {
  if (!scriptUrl || !scriptUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum diisi.' };
  }
  const cleanUrl = scriptUrl.trim();

  // Try via server proxy first (avoids browser iframe CORS or redirect restrictions)
  try {
    const proxyRes = await fetch('/api/sync/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptUrl: cleanUrl, payload })
    });
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.success) {
        return { success: true, data: json.data };
      }
    }
  } catch {
    // Fall back to direct fetch below if server proxy isn't reachable
  }

  try {
    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    try {
      const data = await response.json();
      return { success: true, data };
    } catch {
      return { success: true };
    }
  } catch {
    // Fallback using mode: 'no-cors' with text/plain (simple request)
    try {
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });
      return { success: true };
    } catch (fallbackErr: any) {
      console.error('Apps Script Post Error:', fallbackErr);
      return { success: false, message: fallbackErr.message || 'Gagal terhubung ke Google Apps Script.' };
    }
  }
}

// Helper to upload single photo to Google Drive via Google Apps Script (routed via proxy for reliable CORS & caching)
export async function uploadPhotoToGoogleDrive(
  scriptUrl: string,
  base64Data: string,
  filename?: string
): Promise<{ success: boolean; url?: string; fileId?: string; message?: string }> {
  if (!base64Data) {
    return { success: false, message: 'Data foto base64 kosong.' };
  }

  const targetFilename = filename || `bukti_${Date.now()}.jpg`;

  // 1. First priority: Server-side proxy upload (bypasses browser CORS & saves pristine cache)
  try {
    const proxyRes = await fetch('/api/proxy/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptUrl: (scriptUrl || '').trim(),
        base64Data,
        filename: targetFilename,
        folderName: 'DPT_AlaDin_Bukti_Foto'
      })
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data && (data.success || data.fileId || data.fileUrl)) {
        const fileId = data.fileId || '';
        const resolvedUrl = fileId
          ? `https://drive.usercontent.google.com/download?id=${fileId}&export=view`
          : (data.fileUrl || data.driveUrl || '');

        if (fileId) {
          PhotoCacheService.set(fileId, base64Data);
          PhotoCacheService.set(`https://lh3.googleusercontent.com/d/${fileId}`, base64Data);
          PhotoCacheService.set(`https://drive.usercontent.google.com/download?id=${fileId}&export=view`, base64Data);
          PhotoCacheService.set(`/api/proxy/image?id=${fileId}`, base64Data);
        }
        if (resolvedUrl) {
          PhotoCacheService.set(resolvedUrl, base64Data);
        }
        return {
          success: true,
          fileId,
          url: resolvedUrl
        };
      }
    }
  } catch (proxyErr) {
    console.warn('Server proxy upload attempt failed, trying direct:', proxyErr);
  }

  // 2. Direct fallback (if server proxy is not responding)
  if (!scriptUrl || !scriptUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum diisi.' };
  }
  const cleanUrl = scriptUrl.trim();
  try {
    let cleanB64 = String(base64Data);
    const b64Idx = cleanB64.indexOf('base64,');
    if (b64Idx !== -1) {
      cleanB64 = cleanB64.substring(b64Idx + 7);
    }
    cleanB64 = cleanB64.split(' ').join('+').replace(/[^A-Za-z0-9+/=]/g, '');

    const payload = {
      action: 'uploadImage',
      base64Data: cleanB64,
      filename: targetFilename,
      folderName: 'DPT_AlaDin_Bukti_Foto'
    };

    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    try {
      const data = await response.json();
      if (data && (data.status === 'success' || data.fileUrl || data.fileId)) {
        const fileId = data.fileId || '';
        const resolvedUrl = fileId
          ? `https://drive.usercontent.google.com/download?id=${fileId}&export=view`
          : (data.fileUrl || data.driveUrl || '');

        if (fileId) {
          PhotoCacheService.set(fileId, base64Data);
          PhotoCacheService.set(`https://lh3.googleusercontent.com/d/${fileId}`, base64Data);
          PhotoCacheService.set(`https://drive.usercontent.google.com/download?id=${fileId}&export=view`, base64Data);
          PhotoCacheService.set(`/api/proxy/image?id=${fileId}`, base64Data);
        }
        if (resolvedUrl) {
          PhotoCacheService.set(resolvedUrl, base64Data);
        }
        return {
          success: true,
          fileId,
          url: resolvedUrl
        };
      }
      return { success: false, message: data?.message || 'Gagal menyimpan foto ke Google Drive.' };
    } catch {
      return { success: false, message: 'Respon Apps Script bukan format JSON valid.' };
    }
  } catch (err: any) {
    console.error('uploadPhotoToGoogleDrive error:', err);
    return { success: false, message: err.message || 'Gagal terhubung ke Google Apps Script.' };
  }
}

// Helper khusus untuk mengirim konfirmasi ACC Lembur langsung ke Google Sheets
export async function sendLemburStatusToSheets(
  scriptUrl: string,
  params: {
    jobId: string;
    lemburApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
  }
): Promise<{ success: boolean; message?: string }> {
  if (!scriptUrl || !scriptUrl.trim()) {
    return { success: false, message: 'URL Google Apps Script belum diisi.' };
  }
  const cleanUrl = scriptUrl.trim();
  const payload = {
    action: 'updateLemburStatus',
    jobId: params.jobId,
    lemburApproved: params.lemburApproved,
    approvedBy: params.approvedBy || 'Admin',
    approvedAt: params.approvedAt || new Date().toISOString()
  };

  try {
    const res = await sendToGoogleAppsScript(cleanUrl, payload);
    return res;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal mengirim status lembur ke Google Sheets' };
  }
}

// Helper to parse PengaturanApp rows from Google Sheets
export function parsePengaturanFromSheetRows(rows: any[][]): Partial<AppSettings> {
  if (!rows || !Array.isArray(rows) || rows.length <= 1) return {};
  const settingsObj: Partial<AppSettings> = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i]?.[0] || '').trim();
    const val = rows[i]?.[1];
    if (!key) continue;

    if (key === 'NamaPerusahaan') {
      const rawName = String(val || '').trim();
      settingsObj.namaPerusahaan = /aladin\s*nusantara/i.test(rawName) ? 'DPT-AlaDin' : (rawName || 'DPT-AlaDin');
    }
    if (key === 'AlamatPerusahaan') settingsObj.alamatPerusahaan = String(val || '');
    if (key === 'LogoUrl') {
      const valStr = String(val || '');
      if (valStr && valStr !== '[Logo Image (Base64)]') {
        settingsObj.logoUrl = valStr;
      }
    }
    if (key === 'AdminUsername') settingsObj.adminUsername = String(val || '');
    if (key === 'AdminPassword') settingsObj.adminPassword = String(val || '');
    if (key === 'JamMasukDefinisikan' || /jam.*masuk/i.test(key)) {
      settingsObj.jamMasukDefinisikan = sanitizeTimeString(val, '08:00');
    }
    if (key === 'JamPulangDefinisikan' || /jam.*pulang/i.test(key)) {
      settingsObj.jamPulangDefinisikan = sanitizeTimeString(val, '17:00');
    }
    if (key === 'ToleransiKeterlambatanMenit') settingsObj.toleransiKeterlambatanMenit = Number(val) || 15;
    if (key === 'PotonganPerKeterlambatan') settingsObj.potonganPerKeterlambatan = Number(val) || 25000;
    if (key === 'PotonganPulangAwal') settingsObj.potonganPulangAwal = Number(val) || 20000;
    if (key === 'HariLibur' || /hari.*libur/i.test(key)) {
      const parts = String(val || '').split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) settingsObj.hariLibur = parts;
    }
    if (key === 'TanggalLiburKhusus' || /tanggal.*libur/i.test(key)) {
      const parts = String(val || '').split(',').map(s => sanitizeDateString(s.trim())).filter(Boolean);
      settingsObj.tanggalLiburKhusus = parts;
    }
    if (key === 'JumlahCutiMaksimalPerBulan' || /cuti.*maks/i.test(key)) {
      settingsObj.jumlahCutiMaksimalPerBulan = Number(val) || 2;
    }
    if (key === 'TotalCutiPerTahun' || /total.*cuti/i.test(key)) {
      settingsObj.totalCutiPerTahun = Number(val) || 12;
    }
    if (key === 'WaGatewayProvider') {
      const g = String(val || '').toLowerCase().trim();
      if (g === 'fonnte' || g === 'wablas' || g === 'custom_webhook' || g === 'direct') {
        settingsObj.waGatewayProvider = g as any;
      }
    }
    if (key === 'WaApiToken') settingsObj.waApiToken = String(val || '').trim();
    if (key === 'WaApiUrl') settingsObj.waApiUrl = String(val || '').trim();
    if (key === 'AutoNotifyTechnicianOnPlanning') {
      settingsObj.autoNotifyTechnicianOnPlanning = String(val || '').toLowerCase() !== 'tidak';
    }
    if (key === 'NotifyViaBrowserPush') {
      settingsObj.notifyViaBrowserPush = String(val || '').toLowerCase() !== 'tidak';
    }
    if (key === 'NotifyViaWhatsApp') {
      settingsObj.notifyViaWhatsApp = String(val || '').toLowerCase() !== 'tidak';
    }
  }
  return settingsObj;
}

// Helper to fetch live database from Google Sheets
export async function fetchFullDatabaseFromGoogleSheets(scriptUrl: string) {
  const cleanUrl = scriptUrl.trim();
  const result: Record<string, any[][]> = {};

  // Try via server proxy first (avoids browser iframe CORS or redirect restrictions)
  try {
    const proxyRes = await fetch(`/api/proxy/sheets?url=${encodeURIComponent(cleanUrl)}&action=getAllData`);
    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json.status === 'success' && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
        return json.data as Record<string, any[][]>;
      }
    }
  } catch {
    // Continue to direct fetch below if server proxy isn't available
  }

  try {
    const res = await fetch(`${cleanUrl}?action=getAllData`);
    const json = await res.json();
    if (json.status === 'success' && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
      return json.data as Record<string, any[][]>;
    }
  } catch (e) {
    console.warn('getAllData failed, trying individual sheet fetch:', e);
  }

  const sheetsToFetch = [
    'DataServer',
    'DataWilayah',
    'JenisPekerjaan',
    'DataKaryawan',
    'DaftarPekerjaan',
    'PlanningPekerjaan',
    'AbsensiHarian',
    'PotonganManual',
    'HonorLunas',
    'PengaturanApp'
  ];

  for (const sheetName of sheetsToFetch) {
    try {
      const res = await fetch(`${cleanUrl}?action=getData&sheet=${encodeURIComponent(sheetName)}`);
      const json = await res.json();
      if (json.status === 'success' && Array.isArray(json.data)) {
        result[sheetName] = json.data;
      }
    } catch (err) {
      console.warn(`Failed to fetch sheet ${sheetName}:`, err);
    }
  }

  return result;
}

// Helper to convert sheet 2D arrays into typed application state
export function parseParsedSheetsToState(sheetsData: Record<string, any[][]> | any) {
  const normalizedData: Record<string, any[][]> = (sheetsData && typeof sheetsData === 'object' && sheetsData.data && !Array.isArray(sheetsData.data))
    ? sheetsData.data
    : (sheetsData || {});

  const result: {
    servers?: ServerData[];
    wilayah?: WilayahPekerjaan[];
    jenisList?: JenisPekerjaan[];
    employees?: Employee[];
    jobs?: JobRecord[];
    planningTasks?: PlanningTask[];
    attendanceList?: AttendanceRecord[];
    settings?: Partial<AppSettings>;
    potonganManualList?: PotonganManual[];
    honorLunasList?: HonorLunasRecord[];
  } = {};

  // 1. DataServer
  const serverRows = normalizedData['DataServer'];
  if (serverRows && Array.isArray(serverRows)) {
    if (serverRows.length <= 1) {
      result.servers = [];
    } else {
      const headerRow = serverRows[0].map(h => String(h || '').toLowerCase().trim());
      const targetCol = headerRow.findIndex(h => /target|kuota/i.test(h) && !/bonus/i.test(h));
      const bonusCol = headerRow.findIndex(h => /bonus/i.test(h));
      const kontakCol = headerRow.findIndex(h => /kontak/i.test(h));

      result.servers = serverRows.slice(1).map((row, idx) => {
        const targetVal = targetCol >= 0
          ? (Number(row[targetCol]) || 100)
          : (row.length >= 12 ? (Number(row[9]) || 100) : 100);
        const bonusVal = bonusCol >= 0
          ? (Number(row[bonusCol]) || 100000)
          : (row.length >= 12 ? (Number(row[10]) || 100000) : (row.length > 10 ? (Number(row[9]) || 100000) : 100000));
        const kontakVal = kontakCol >= 0
          ? String(row[kontakCol] || '')
          : (row.length >= 12 ? String(row[11] || '') : (row.length > 10 ? String(row[10] || '') : String(row[9] || '')));

        return {
          id: String(row[0] || `srv-${idx + 1}`),
          namaServer: String(row[1] || ''),
          penanggungJawabId: String(row[2] || ''),
          penanggungJawabNama: String(row[3] || ''),
          alamat: String(row[4] || ''),
          lat: parseCoordinate(row[5], 0),
          lng: parseCoordinate(row[6], 0),
          toleransiRadiusMeter: Number(row[7]) || 100,
          honorTetapTeknisi: Number(row[8]) || 0,
          targetPekerjaanBulanan: targetVal,
          bonusTargetBulanan: bonusVal,
          kontakPJ: kontakVal
        };
      }).filter(s => s.namaServer);
    }
  }

  // 2. DataWilayah
  const wilayahRows = normalizedData['DataWilayah'];
  if (wilayahRows && Array.isArray(wilayahRows)) {
    if (wilayahRows.length <= 1) {
      result.wilayah = [];
    } else {
      result.wilayah = wilayahRows.slice(1).map((row, idx) => ({
        id: String(row[0] || `wil-${idx + 1}`),
        namaWilayah: String(row[1] || ''),
        serverId: String(row[2] || ''),
        namaServer: String(row[3] || ''),
        honorPJWilayah: Number(row[4]) || 0,
        besaranTransport: Number(row[5]) || 0
      })).filter(w => w.namaWilayah);
    }
  }

  // 3. JenisPekerjaan
  const jenisRows = normalizedData['JenisPekerjaan'];
  if (jenisRows && Array.isArray(jenisRows)) {
    if (jenisRows.length <= 1) {
      result.jenisList = [];
    } else {
      const mappedJenis = jenisRows.slice(1).map((row, idx) => {
        const tarifTitik = Number(row[4]) || 0;
        const tarifKabel = Number(row[5]) || 0;
        const parseBoolVal = (v: any) => {
          if (v === true || v === 1) return true;
          if (v === false || v === 0) return false;
          const s = String(v || '').toLowerCase().trim();
          return ['true', 'ya', 'yes', '1', 'y', 'v', '✓'].includes(s);
        };
        const butuhTitikRaw = parseBoolVal(row[7]);
        const butuhKabelRaw = parseBoolVal(row[8]);
        const isMultiRaw = parseBoolVal(row[9]);

        return {
          id: String(row[0] || `jp-${idx + 1}`),
          jenisPekerjaan: String(row[1] || ''),
          subPekerjaan: String(row[2] || ''),
          tarifDasar: Number(row[3]) || 0,
          tarifTitik,
          tarifTarikKabelPerMeter: tarifKabel,
          tarifLemburPerMenit: Number(row[6]) || 0,
          // Sinkronisasi otomatis: Jika tarif 0, maka tidak butuh input
          butuhInputTitik: tarifTitik > 0 && butuhTitikRaw,
          butuhPanjangKabel: tarifKabel > 0 && butuhKabelRaw,
          isMultiTeknisi: isMultiRaw
        };
      }).filter(j => j.jenisPekerjaan || j.subPekerjaan);
      result.jenisList = sortJenisPekerjaan(mappedJenis);
    }
  }

  // 4. DataKaryawan
  const employeeRows = normalizedData['DataKaryawan'];
  if (employeeRows && Array.isArray(employeeRows) && employeeRows.length > 1) {
    const headerRow = employeeRows[0].map(h => String(h || '').toLowerCase().trim());
    const getColIndex = (regex: RegExp, fallback: number) => {
      const idx = headerRow.findIndex(h => regex.test(h));
      return idx >= 0 ? idx : fallback;
    };

    const idCol = getColIndex(/^id$/i, 0);
    const namaCol = getColIndex(/nama/i, 1);
    const userCol = getColIndex(/user|username/i, 2);
    const passCol = getColIndex(/pass|password|sandi/i, 3);
    const roleCol = getColIndex(/role|jabatan|posisi/i, 4);
    const statusCol = getColIndex(/status/i, 5);
    const honorCol = getColIndex(/honor.*server|honor.*pokok|honor.*tetap/i, -1);
    const wilCol = getColIndex(/wilayah/i, 6);
    const bonusCol = getColIndex(/bonus|target/i, 7);
    const kontakCol = getColIndex(/kontak|hp|telepon|wa/i, 8);
    const alamatCol = getColIndex(/alamat/i, 9);
    const rekCol = getColIndex(/rekening|bank/i, 10);
    const serverCol = getColIndex(/server.*id|^server$/i, 11);
    const serverNameCol = getColIndex(/nama.*server|server.*nama/i, 12);

    result.employees = employeeRows.slice(1).map((row, idx) => {
      let roleVal = String(row[roleCol] || 'Teknisi').trim();
      if (/admin/i.test(roleVal)) roleVal = 'Admin';
      else if (/pj|server|penanggung/i.test(roleVal)) roleVal = 'Penanggungjawab Server';
      else roleVal = 'Teknisi';

      const empId = String(row[idCol] || `emp-${idx + 1}`);
      const rawServerId = serverCol >= 0 ? String(row[serverCol] || '').trim() : '';
      const rawServerNama = serverNameCol >= 0 ? String(row[serverNameCol] || '').trim() : '';

      // Parse serverHonors (contoh: "Albinet: 250000; Dindanet: 300000" atau JSON array)
      let parsedServerHonors: EmployeeServerHonor[] = [];
      if (honorCol >= 0 && row[honorCol]) {
        const rawHonorStr = String(row[honorCol]).trim();
        if (rawHonorStr) {
          if (rawHonorStr.startsWith('[') && rawHonorStr.endsWith(']')) {
            try {
              parsedServerHonors = JSON.parse(rawHonorStr);
            } catch (err) {
              // ignore json parse error
            }
          } else {
            const parts = rawHonorStr.split(';').map(p => p.trim()).filter(Boolean);
            parts.forEach(part => {
              if (part.includes(':')) {
                const [sName, sNominal] = part.split(':').map(x => x.trim());
                const cleanNominal = Number(sNominal.replace(/[^0-9]/g, '')) || 0;
                const matchedSrv = (result.servers || []).find(s =>
                  s.namaServer.toLowerCase().trim() === sName.toLowerCase().trim() ||
                  s.id.toLowerCase().trim() === sName.toLowerCase().trim()
                );
                if (matchedSrv) {
                  parsedServerHonors.push({
                    serverId: matchedSrv.id,
                    namaServer: matchedSrv.namaServer,
                    nominal: cleanNominal
                  });
                } else {
                  parsedServerHonors.push({
                    serverId: sName,
                    namaServer: sName,
                    nominal: cleanNominal
                  });
                }
              }
            });
          }
        }
      }

      const totalHonorTetap = parsedServerHonors.reduce((sum, sh) => sum + (Number(sh.nominal) || 0), 0);

      let rawStatus = String(row[statusCol] || 'Tetap').trim();
      if (/magang/i.test(rawStatus)) rawStatus = 'Magang';
      else if (/freelance|mitra/i.test(rawStatus)) rawStatus = 'Freelance';
      else rawStatus = 'Tetap';

      return {
        id: empId,
        namaLengkap: String(row[namaCol] || ''),
        username: String(row[userCol] || '').trim(),
        password: String(row[passCol] || '').trim(),
        role: roleVal as any,
        status: rawStatus as any,
        honorTetapBulanan: totalHonorTetap,
        serverHonors: parsedServerHonors,
        wilayahHandledIds: row[wilCol] ? String(row[wilCol]).split(',').map(s => s.trim()).filter(Boolean) : [],
        bonusTargetBulanan: Number(row[bonusCol]) || 0,
        kontak: String(row[kontakCol] || ''),
        alamat: String(row[alamatCol] || ''),
        rekening: String(row[rekCol] || ''),
        serverId: rawServerId || undefined,
        namaServer: rawServerNama || undefined,
        isOnline: false
      };
    }).filter(e => e.namaLengkap || e.username);
  }

  // 4.5. PengaturanApp (parse first so settings are available for attendance validation)
  const settingRows = normalizedData['PengaturanApp'];
  if (settingRows && Array.isArray(settingRows) && settingRows.length > 1) {
    result.settings = parsePengaturanFromSheetRows(settingRows);
  }

  // 5. DaftarPekerjaan
  const jobRows = normalizedData['DaftarPekerjaan'];
  if (jobRows && Array.isArray(jobRows)) {
    if (jobRows.length <= 1) {
      result.jobs = [];
    } else {
      const knownEmployees = result.employees || [];
      const headerRow = jobRows[0].map(h => String(h || '').toLowerCase().trim());

      const getColIndex = (regex: RegExp, fallback: number) => {
        const idx = headerRow.findIndex(h => regex.test(h));
        return idx >= 0 ? idx : fallback;
      };

      const idCol = getColIndex(/^id$/i, 0);
      const tglCol = getColIndex(/tanggal|tgl|date/i, 1);
      const mainTechCol = getColIndex(/teknisi utama|main tech/i, 2);
      const suppTechCol = getColIndex(/teknisi pendukung|support tech/i, 3);
      const vehCol = getColIndex(/kendaraan|vehicle/i, 4);
      const jenisIdCol = getColIndex(/jenis id/i, 5);
      const jenisNamaCol = getColIndex(/jenis nama|jenis pekerjaan/i, 6);
      const subPekerjaanCol = getColIndex(/sub pekerjaan|sub/i, 7);
      const serverIdCol = getColIndex(/server id/i, 8);
      const namaServerCol = getColIndex(/nama server|server/i, 9);
      const wilayahCol = getColIndex(/wilayah pengerjaan|wilayah|area|lokasi pengerjaan/i, -1);
      const transportCol = getColIndex(/transport wilayah|uang transport|biaya transport|transport/i, -1);
      const titikCol = getColIndex(/titik|point/i, 10);
      const kabelCol = getColIndex(/kabel|cable/i, 11);
      const lemburCol = getColIndex(/^ada lembur$|^lembur$/i, 12);
      const menitLemburCol = getColIndex(/menit lembur/i, 13);
      const statusLemburCol = getColIndex(/status lembur|acc lembur|lembur acc|lembur approved|persetujuan lembur/i, -1);
      const lemburByCol = getColIndex(/lembur disetujui oleh|disetujui oleh|approved by|acc oleh/i, -1);
      const lemburAtCol = getColIndex(/waktu acc|waktu lembur acc|approved at|tanggal acc/i, -1);
      const totalHonorCol = getColIndex(/total honor/i, 14);
      const honorPerTechCol = getColIndex(/honor per/i, 15);
      const fotoCol = getColIndex(/foto|photo|bukti|gambar/i, 16);
      const catatanCol = getColIndex(/catatan|keterangan|notes|uraian/i, 17);

      result.jobs = jobRows.slice(1).map((row, idx) => {
        const mainTechNama = String(row[mainTechCol] || '').trim();
        const supportTechNamasStr = String(row[suppTechCol] || '').trim();
        const supportTechNamas = supportTechNamasStr && supportTechNamasStr !== '-' 
          ? supportTechNamasStr.split(',').map(s => s.trim()).filter(Boolean) 
          : [];
        
        const allNamas = [mainTechNama, ...supportTechNamas].filter(Boolean);

        const techIds = allNamas.map(nama => {
          const found = knownEmployees.find(e => e.namaLengkap.toLowerCase() === nama.toLowerCase());
          return found ? found.id : `emp-${nama.replace(/\s+/g, '').toLowerCase()}`;
        });

        // Parse vehicles detail
        const vehDetailStr = vehCol >= 0 ? String(row[vehCol] || '').trim() : '';
        const vehiclesMap: Record<string, any> = {};
        if (vehDetailStr) {
          vehDetailStr.split(';').forEach(part => {
            const match = part.trim().match(/^(.*?)\s*\((.*?)\)$/);
            if (match) {
              const eName = match[1].trim();
              const vType = match[2].trim();
              const foundEmp = knownEmployees.find(e => e.namaLengkap.toLowerCase() === eName.toLowerCase());
              if (foundEmp) {
                vehiclesMap[foundEmp.id] = vType;
              }
            }
          });
        }

        // Parse wilayah pengerjaan and transport
        const rawWilayahStr = wilayahCol >= 0 ? String(row[wilayahCol] || '').trim() : '';
        const wilayahNamas = (rawWilayahStr && rawWilayahStr !== '-')
          ? rawWilayahStr.split(',').map(s => s.trim()).filter(Boolean)
          : [];
        
        const knownWilayah = result.wilayah || [];
        const wilayahIds = wilayahNamas.map(wName => {
          const found = knownWilayah.find(w => w.namaWilayah.toLowerCase() === wName.toLowerCase());
          return found ? found.id : '';
        }).filter(Boolean);

        const transportVal = transportCol >= 0 ? (Number(row[transportCol]) || 0) : 0;

        const photosStr = String(row[fotoCol] || '').trim();
        const photosList = photosStr 
          ? photosStr.split('|').map(s => s.trim()).filter(s => s && !s.includes('[Foto Base64]')) 
          : [];

        const rawTgl = sanitizeDateString(row[tglCol]);
        const isJobHoliday = isHolidayDate(rawTgl, result.settings).isHoliday;

        const jobIdVal = String(row[idCol] || `job-${idx + 1}`);
        const hasLembur = isJobHoliday || String(row[lemburCol]).toLowerCase() === 'ya' || String(row[lemburCol]).toLowerCase() === 'true';
        const rawStatusLembur = statusLemburCol >= 0 ? String(row[statusLemburCol] || '').trim().toLowerCase() : '';
        
        let approvedByVal = lemburByCol >= 0 && row[lemburByCol] && String(row[lemburByCol]) !== '-'
          ? String(row[lemburByCol]).trim()
          : undefined;
        let approvedAtVal = lemburAtCol >= 0 && row[lemburAtCol] && String(row[lemburAtCol]) !== '-'
          ? String(row[lemburAtCol]).trim()
          : undefined;

        let isLemburApproved = false;
        if (isJobHoliday) {
          // Semua pekerjaan pada hari libur otomatis ACC Lembur
          isLemburApproved = true;
          approvedByVal = approvedByVal || 'Sistem (Otomatis Hari Libur)';
          approvedAtVal = approvedAtVal || (rawTgl ? `${rawTgl}T17:00:00.000Z` : new Date().toISOString());
        } else if (hasLembur) {
          if (/disetujui|acc|approved|ya|true/i.test(rawStatusLembur)) {
            isLemburApproved = true;
          } else if (statusLemburCol < 0 && Boolean(approvedByVal)) {
            isLemburApproved = true;
          } else {
            // Cek localStorage persistent map jika kolom Status Lembur belum ada di Google Sheet atau sel kosong
            try {
              const rawPersistent = typeof window !== 'undefined' ? localStorage.getItem('dpt_aladin_approved_lembur_v1') : null;
              if (rawPersistent) {
                const map = JSON.parse(rawPersistent);
                const saved = map[jobIdVal];
                if (saved && saved.approved && !/menunggu|pending|tolak|batal|belum/i.test(rawStatusLembur)) {
                  isLemburApproved = true;
                  approvedByVal = approvedByVal || saved.approvedBy || 'Admin';
                  approvedAtVal = approvedAtVal || saved.approvedAt;
                }
              }
            } catch {}
          }
        }

        const rawMinLembur = Number(row[menitLemburCol]) || 0;
        const finalMenitLembur = rawMinLembur > 0 ? rawMinLembur : (isJobHoliday ? 60 : 0);

        return {
          id: jobIdVal,
          tanggal: rawTgl,
          teknisiIds: techIds.length > 0 ? techIds : ['emp-1'],
          teknisiNamas: allNamas,
          teknisiVehicles: Object.keys(vehiclesMap).length > 0 ? vehiclesMap : undefined,
          jenisPekerjaanId: String(row[jenisIdCol] || ''),
          jenisPekerjaanNama: String(row[jenisNamaCol] || ''),
          subPekerjaanNama: String(row[subPekerjaanCol] || ''),
          serverId: String(row[serverIdCol] || ''),
          namaServer: (() => {
            const rawServerId = String(row[serverIdCol] || '');
            const rawNama = String(row[namaServerCol] || '').trim();
            const isInvalid = !rawNama || /^(ya|tidak|yes|no|true|false|-|--|undefined|null|server|server\s*ya)$/i.test(rawNama) || !isNaN(Number(rawNama));
            if (!isInvalid && !rawNama.startsWith('srv-')) return rawNama;
            const s = (result.servers || []).find(srv => srv.id === rawServerId || srv.id === rawNama || srv.namaServer.toLowerCase() === rawNama.toLowerCase());
            if (s) return s.namaServer;
            const techEmp = knownEmployees.find(e => techIds.includes(e.id) || (allNamas[0] && e.namaLengkap.toLowerCase().trim() === allNamas[0].toLowerCase().trim()));
            if (techEmp?.namaServer && !/^(ya|tidak|yes|no|true|false|-)$/i.test(techEmp.namaServer)) return techEmp.namaServer;
            return result.servers?.[0]?.namaServer || 'Server Utama';
          })(),
          wilayahId: wilayahIds[0] || '',
          wilayahIds: wilayahIds,
          wilayahNamas: wilayahNamas,
          totalTransportWilayah: transportVal,
          transport: transportVal,
          jumlahTitik: Number(row[titikCol]) || 0,
          panjangKabelMeter: Number(row[kabelCol]) || 0,
          adaLembur: hasLembur,
          menitLembur: finalMenitLembur,
          lemburApproved: isLemburApproved,
          lemburApprovedBy: approvedByVal,
          lemburApprovedAt: approvedAtVal,
          estimasiTotalHonor: Number(row[totalHonorCol]) || 0,
          honorPerTeknisi: Number(row[honorPerTechCol]) || 0,
          buktiFotoUrls: photosList,
          catatan: String(row[catatanCol] || '')
        };
      }).filter(j => j.id);
    }
  }

  // 6. PlanningPekerjaan
  const planningRows = normalizedData['PlanningPekerjaan'];
  if (planningRows && Array.isArray(planningRows)) {
    if (planningRows.length <= 1) {
      result.planningTasks = [];
    } else {
      result.planningTasks = planningRows.slice(1).map((row, idx) => ({
        id: String(row[0] || `plan-${idx + 1}`),
        tanggal: sanitizeDateString(row[1]),
        targetTeknisiIds: String(row[2] || '').split(',').map(s => s.trim()).filter(Boolean),
        targetTeknisiNamas: String(row[3] || '').split(',').map(s => s.trim()).filter(Boolean),
        serverId: String(row[4] || ''),
        namaServer: String(row[5] || ''),
        jenisPekerjaanId: String(row[6] || ''),
        subPekerjaanNama: String(row[7] || ''),
        detailPekerjaan: String(row[8] || ''),
        fotoLokasiUrl: String(row[9] || ''),
        status: (row[10] as any) || 'Pending',
        createdById: String(row[11] || 'admin')
      })).filter(p => p.id);
    }
  }

  // 7. AbsensiHarian / ApprovalAbsensi (Parse and merge from all available attendance sheets)
  const attendanceSources = [
    { name: 'AbsensiHarian', rows: normalizedData['AbsensiHarian'] },
    { name: 'ApprovalAbsensi', rows: normalizedData['ApprovalAbsensi'] }
  ].filter(s => Array.isArray(s.rows) && s.rows.length > 1);

  if (attendanceSources.length === 0) {
    if (normalizedData['AbsensiHarian'] || normalizedData['ApprovalAbsensi']) {
      result.attendanceList = [];
    }
  } else {
    const knownEmployees = result.employees || [];
    let resolvedKeysSet = new Set<string>();
    try {
      if (typeof window !== 'undefined') {
        const storedKeys = JSON.parse(localStorage.getItem('dpt_aladin_resolved_attendance_keys_v1') || '[]');
        if (Array.isArray(storedKeys)) {
          resolvedKeysSet = new Set(storedKeys);
        }
      }
    } catch {}

    const allRawParsed: AttendanceRecord[] = [];

    for (const source of attendanceSources) {
      const attendanceRows = source.rows!;
      // Find actual header row (in case row 0 is a title banner or merged title)
      let headerRowIdx = attendanceRows.findIndex(row => 
        row && Array.isArray(row) && row.some(cell => /tanggal|tgl|date|teknisi|masuk|pulang/i.test(String(cell || '')))
      );
      if (headerRowIdx < 0) headerRowIdx = 0;

      const headerRow = attendanceRows[headerRowIdx].map(h => String(h || '').toLowerCase().trim());
      const getColIndex = (regex: RegExp, fallback: number) => {
        const idx = headerRow.findIndex(h => regex.test(h));
        return idx >= 0 ? idx : fallback;
      };

      const isApprovalSource = source.name === 'ApprovalAbsensi';
      const idCol = getColIndex(/^id$/i, 0);
      const tglCol = getColIndex(/tanggal|tgl|date/i, 1);
      const techIdCol = getColIndex(/teknisi id|id teknisi/i, 2);
      const techNamaCol = getColIndex(/nama teknisi|teknisi nama|nama/i, 3);
      const jamMasukCol = getColIndex(/^(?=.*(masuk|in|hadir|checkin))(?!.*(?:foto|bukti|kamera|image)).*$|^(?:jam|waktu|clock)[\s_-]?(?:masuk|in)$/i, 4);
      const fotoMasukCol = getColIndex(/(?:foto|bukti|kamera|selfie|image).*(?:masuk|proof|hadir|in)|(?:masuk|proof|hadir|in).*(?:foto|bukti|kamera|selfie|image)/i, 5);
      
      // Jam pulang regex: match pulang, keluar, out, checkout, selesai, etc. (excluding photo columns)
      const jamPulangCol = getColIndex(
        /^(?=.*(pulang|keluar|out|checkout|check[\s_-]?out|selesai|akhir))(?!.*(?:foto|bukti|kamera|selfie|image)).*$|^(?:jam|waktu|clock|check)[\s_-]?(?:pulang|keluar|out|checkout|selesai)$/i,
        isApprovalSource ? 5 : 6
      );
      // Foto pulang: in ApprovalAbsensi fallback is -1 (no foto pulang column), in AbsensiHarian fallback is 7
      const fotoPulangCol = getColIndex(
        /(?:foto|bukti|kamera|selfie|image).*(?:pulang|keluar|out)|(?:pulang|keluar|out).*(?:foto|bukti|kamera|selfie|image)/i,
        isApprovalSource ? -1 : 7
      );
      // Server columns: fallback MUST be -1 so we do not erroneously read column 8 (Jarak) or column 9 (Radius: "Ya"/"Tidak") as server!
      const serverIdCol = isApprovalSource ? -1 : getColIndex(/^(?:server[\s_-]?id|id[\s_-]?server)$/i, -1);
      const serverNamaCol = isApprovalSource ? -1 : getColIndex(/^(?:nama[\s_-]?server|server[\s_-]?nama)$/i, -1);
      const distCol = getColIndex(/jarak|distance/i, isApprovalSource ? 8 : 10);
      const radiusCol = getColIndex(/radius/i, isApprovalSource ? 9 : 11);
      const statusCol = getColIndex(/status/i, isApprovalSource ? 11 : 12);
      const needsApprovalCol = getColIndex(/needs approval|perlu approval/i, isApprovalSource ? 12 : -1);
      const ketCol = getColIndex(/keterangan|catatan|notes/i, isApprovalSource ? -1 : 13);
      const potCol = getColIndex(/potongan/i, isApprovalSource ? 14 : 14);

      for (let idx = headerRowIdx + 1; idx < attendanceRows.length; idx++) {
        const row = attendanceRows[idx];
        if (!row || row.length === 0) continue;

        const cleanTgl = sanitizeDateString(row[tglCol]);
        const techNama = String(row[techNamaCol] || '').trim();
        let techId = String(row[techIdCol] || '').trim();

        if (!techId && techNama) {
          const found = knownEmployees.find(e => e.namaLengkap.toLowerCase().trim() === techNama.toLowerCase().trim());
          if (found) techId = found.id;
        }

        const rowId = String(row[idCol] || `att-${source.name}-${idx}`);
        const cleanTechKey = (techNama || techId || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const groupKey = `${cleanTgl}_${cleanTechKey}`;

        // If source is ApprovalAbsensi and record already parsed from AbsensiHarian, skip duplicate row only if it doesn't add checkout data
        if (isApprovalSource && allRawParsed.some(a => a.id === rowId || (a.tanggal === cleanTgl && getNormalizedTechKey(a.teknisiId, a.teknisiNama) === cleanTechKey && a.jamPulang))) {
          continue;
        }

        const rawJamMasuk = row[jamMasukCol];
        const rawJamPulang = row[jamPulangCol];
        const rawFotoPulang = fotoPulangCol >= 0 ? String(row[fotoPulangCol] || '').trim() : '';
        const hasValidFotoPulang = Boolean(rawFotoPulang && rawFotoPulang !== '-' && !rawFotoPulang.startsWith('[Foto Masuk') && rawFotoPulang !== '0' && rawFotoPulang.length > 5);

        const cleanJamMasuk = sanitizeTimeString(rawJamMasuk, '08:00');
        let cleanJamPulang = '';
        if (rawJamPulang !== undefined && rawJamPulang !== null) {
          const rawTrim = String(rawJamPulang).trim();
          if (rawTrim && rawTrim !== '-' && rawTrim !== '--:--' && rawTrim !== 'null' && rawTrim !== 'undefined' && rawTrim !== '--' && !/^(belum|pending)/i.test(rawTrim)) {
            cleanJamPulang = sanitizeTimeString(rawJamPulang, '');
            if (!cleanJamPulang && /^(ya|yes|sudah|sudah\s*pulang|sudah\s*absen|pulang|selesai|hadir|ok|true|✓|v|ada)$/i.test(rawTrim)) {
              cleanJamPulang = '17:00';
            }
          }
        }

        // If time is missing or not parseable but checkout photo proof exists, ensure jam pulang is recorded
        if (!cleanJamPulang && hasValidFotoPulang) {
          cleanJamPulang = '17:00';
        }

        const distVal = Number(row[distCol]) || 0;
        const isWithinRad = String(row[radiusCol]).toLowerCase() === 'ya' || String(row[radiusCol]).toLowerCase() === 'true';

        const statusVal = String(row[statusCol] || '').trim();
        const needsApprovalVal = needsApprovalCol >= 0 ? String(row[needsApprovalCol] || '').trim().toLowerCase() : '';

        const rawTechId = String(row[techIdCol] || '').trim();
        const rawTechNama = String(row[techNamaCol] || '').trim();
        const lowerGroupKey = groupKey.toLowerCase();
        const lowerRowId = rowId.toLowerCase();
        const lowerTechId = rawTechId.toLowerCase();
        const lowerTechNama = rawTechNama.toLowerCase();

        const isSheetApproved = /^(approved|disetujui)$/i.test(statusVal);
        const isSheetRejected = /^(ditolak|rejected)$/i.test(statusVal);
        const isSheetHadir = /^(hadir)$/i.test(statusVal) && needsApprovalVal !== 'ya' && needsApprovalVal !== 'true' && !/pending/i.test(needsApprovalVal);

        const isExplicitlyResolvedByAdmin = 
          resolvedKeysSet.has(lowerGroupKey) ||
          resolvedKeysSet.has(lowerRowId) ||
          (lowerTechId && resolvedKeysSet.has(`${cleanTgl}_${lowerTechId}`)) ||
          (lowerTechNama && resolvedKeysSet.has(`${cleanTgl}_${lowerTechNama}`)) ||
          isSheetApproved ||
          isSheetHadir ||
          isSheetRejected;

        // Evaluate business rules for approval (late check-in, outside radius, early check-out)
        const evalRes = evaluateAttendanceApproval({
          jamMasuk: cleanJamMasuk,
          jamPulang: cleanJamPulang,
          tanggal: cleanTgl,
          isWithinRadius: isWithinRad,
          distanceMeter: distVal,
          settings: result.settings,
          alreadyApproved: isExplicitlyResolvedByAdmin && !isSheetRejected
        });

        const isPending = !isExplicitlyResolvedByAdmin && (
          /pending/i.test(statusVal) || 
          needsApprovalVal === 'ya' || 
          needsApprovalVal === 'true' || 
          statusVal.toLowerCase() === 'terlambat' ||
          evalRes.needsApproval
        );

        let finalNeedsApproval = false;
        let finalStatus: AbsensiStatus = 'Hadir';

        if (isExplicitlyResolvedByAdmin) {
          finalNeedsApproval = false;
          finalStatus = isSheetRejected ? 'Ditolak' : 'Hadir';
        } else if (isPending || evalRes.needsApproval) {
          finalNeedsApproval = true;
          finalStatus = 'Pending Approval';
        } else if (/^(izin|cuti)$/i.test(statusVal)) {
          finalNeedsApproval = false;
          finalStatus = statusVal as AbsensiStatus;
        } else {
          finalNeedsApproval = evalRes.needsApproval;
          finalStatus = evalRes.status;
        }

        // PENTING: Untuk tanggal di masa lalu (seperti 04-10-2026), jika teknisi memiliki absensi dan tidak ditolak,
        // maka jam kerja hari tersebut telah selesai (Sudah Absen Pulang). Jika sel jam pulang kosong, isi jam standar.
        const isPastDate = cleanTgl < getEffectiveTodayISO();
        if (isPastDate && finalStatus !== 'Ditolak' && !cleanJamPulang) {
          cleanJamPulang = sanitizeTimeString(result.settings?.jamPulangDefinisikan, '17:00');
        }

        const finalPotongan = finalNeedsApproval
          ? (Number(row[potCol]) || evalRes.potonganOtomatis || 25000)
          : (finalStatus === 'Hadir' ? 0 : (Number(row[potCol]) || 0));

        let rawServerId = serverIdCol >= 0 ? String(row[serverIdCol] || '').trim() : '';
        let rawServerNama = serverNamaCol >= 0 ? String(row[serverNamaCol] || '').trim() : '';
        
        // Bersihkan nilai serverNama yang tidak valid (seperti "Ya", "Tidak", angka jarak)
        const isInvalidServerName = (s?: string) => {
          if (!s) return true;
          const l = s.toLowerCase().trim();
          return (
            l === 'ya' || 
            l === 'tidak' || 
            l === 'yes' || 
            l === 'no' || 
            l === 'true' || 
            l === 'false' || 
            l === '-' || 
            l === '--' || 
            l === 'undefined' || 
            l === 'null' || 
            l === 'server' || 
            l === 'server ya' ||
            !isNaN(Number(s))
          );
        };
        const isInvalidServerId = (id?: string) => !id || id === 'Ya' || id === 'Tidak' || (!id.startsWith('srv-') && /^\d+$/.test(id));

        if (isInvalidServerId(rawServerId)) {
          rawServerId = '';
        }

        if (isInvalidServerName(rawServerNama) || rawServerNama.startsWith('srv-') || !rawServerId) {
          // Cari server yang cocok dari data server atau teknisi terkait
          const targetLookup = (rawServerNama.startsWith('srv-') ? rawServerNama : '') || rawServerId;
          const matchedServer = (result.servers || []).find(s => s.id === targetLookup || s.id === rawServerId);
          if (matchedServer) {
            rawServerNama = matchedServer.namaServer;
            rawServerId = matchedServer.id;
          } else {
            const emp = knownEmployees.find(e => 
              (techId && e.id === techId) || 
              (techNama && e.namaLengkap.toLowerCase().trim() === techNama.toLowerCase().trim())
            );
            if (emp && emp.namaServer && !isInvalidServerName(emp.namaServer)) {
              rawServerNama = emp.namaServer;
              rawServerId = emp.serverId || rawServerId;
            } else if (emp && emp.serverId) {
              const matchedSrv = (result.servers || []).find(s => s.id === emp.serverId);
              if (matchedSrv) {
                rawServerNama = matchedSrv.namaServer;
                rawServerId = matchedSrv.id;
              } else if (result.servers && result.servers.length > 0) {
                rawServerNama = result.servers[0].namaServer;
                rawServerId = result.servers[0].id;
              } else {
                rawServerNama = '';
              }
            } else if (result.servers && result.servers.length > 0) {
              rawServerNama = result.servers[0].namaServer;
              rawServerId = result.servers[0].id;
            } else {
              rawServerNama = '';
            }
          }
        }

        allRawParsed.push({
          id: rowId,
          tanggal: cleanTgl,
          teknisiId: techId || (knownEmployees[0]?.id || 'emp-1'),
          teknisiNama: techNama || (knownEmployees[0]?.namaLengkap || 'Teknisi'),
          jamMasuk: cleanJamMasuk,
          fotoProofUrl: sanitizePhotoUrl(row[fotoMasukCol]),
          jamPulang: cleanJamPulang || undefined,
          fotoPulangUrl: sanitizePhotoUrl(row[fotoPulangCol]),
          serverId: rawServerId,
          serverNama: rawServerNama,
          distanceMeter: distVal,
          isWithinRadius: isWithinRad,
          status: finalStatus,
          keterangan: String(row[ketCol] || evalRes.reason || ''),
          potonganOtomatis: finalPotongan,
          needsApproval: finalNeedsApproval,
          approvalType: evalRes.approvalType,
          isApproved: (isExplicitlyResolvedByAdmin || finalStatus === 'Hadir') && !finalNeedsApproval && !isSheetRejected
        });
      }
    }

    const filtered = allRawParsed.filter(a => {
      if (!a.id || !a.tanggal) return false;
      if (a.id === 'att-1788758276968') return false;
      if (typeof window !== 'undefined') {
        try {
          const deleted = JSON.parse(localStorage.getItem('dpt_aladin_deleted_attendance_ids_v1') || '[]');
          if (Array.isArray(deleted) && deleted.includes(a.id)) return false;
        } catch {}
      }
      return true;
    });

    // PENTING: Lakukan konsolidasi otomatis agar rekaman terpisah (misal baris masuk & baris pulang) langsung digabung sempurna
    result.attendanceList = consolidateAttendanceRecords(filtered);
  }

  // Parse PotonganManual sheet rows
  if (normalizedData['PotonganManual'] && Array.isArray(normalizedData['PotonganManual'])) {
    const rawRows = normalizedData['PotonganManual'];
    if (rawRows.length > 1) {
      const rows = rawRows.slice(1);
      result.potonganManualList = rows.map((row: any[], idx: number) => {
        return {
          id: String(row[0] || `potongan-${Date.now()}-${idx}`),
          tanggal: sanitizeDateString(String(row[1] || '')),
          karyawanId: String(row[2] || ''),
          karyawanNama: String(row[3] || ''),
          serverId: String(row[4] || ''),
          serverNama: String(row[5] || ''),
          jenisPotongan: String(row[6] || 'Kasbon'),
          nominal: Number(row[7]) || 0,
          keterangan: String(row[8] || ''),
          createdByNama: String(row[9] || 'Admin')
        };
      }).filter((p: any) => p.karyawanId && p.nominal > 0);
    }
  }

  // Parse HonorLunas sheet rows
  if (normalizedData['HonorLunas'] && Array.isArray(normalizedData['HonorLunas'])) {
    const rawRows = normalizedData['HonorLunas'];
    if (rawRows.length > 1) {
      const headerRow = rawRows[0].map(h => String(h || '').toLowerCase().trim());
      const getColIndex = (regex: RegExp, fallback: number) => {
        const idx = headerRow.findIndex(h => regex.test(h));
        return idx >= 0 ? idx : fallback;
      };

      const idCol = getColIndex(/^id$/i, 0);
      const tglLunasCol = getColIndex(/tanggal.*lunas|tgl.*lunas/i, 1);
      const perAwalCol = getColIndex(/periode.*awal|tgl.*mulai/i, 2);
      const perAkhirCol = getColIndex(/periode.*akhir|tgl.*selesai/i, 3);
      const techIdCol = getColIndex(/teknisi.*id|id.*teknisi/i, 4);
      const techNamaCol = getColIndex(/nama.*teknisi|teknisi.*nama/i, 5);
      const statusCol = getColIndex(/status/i, 6);
      const serverIdCol = getColIndex(/server.*id|^server$/i, 7);
      const serverNamaCol = getColIndex(/nama.*server|server.*nama/i, 8);
      const jobCountCol = getColIndex(/total.*pekerjaan|jumlah.*pekerjaan|job.*count/i, 9);
      const honorTetapCol = getColIndex(/honor.*tetap/i, 10);
      const honorWilCol = getColIndex(/honor.*pj|honor.*wilayah/i, 11);
      const honorDasarCol = getColIndex(/honor.*dasar/i, 12);
      const honorTitikCol = getColIndex(/honor.*titik/i, 13);
      const honorKabelCol = getColIndex(/honor.*kabel/i, 14);
      const honorLemburCol = getColIndex(/honor.*lembur/i, 15);
      const honorTransCol = getColIndex(/transport.*kendaraan|honor.*transport/i, 16);
      const bonusCol = getColIndex(/bonus.*target|bonus/i, 17);
      const potAbsenCol = getColIndex(/potongan.*absen|potongan.*terlambat/i, 18);
      const potKasbonCol = getColIndex(/potongan.*kasbon|potongan.*manual/i, 19);
      const totalNettCol = getColIndex(/total.*honor.*nett|total.*honor|total.*lunas/i, 20);
      const jobIdsCol = getColIndex(/job.*ids|id.*pekerjaan/i, 21);
      const olehCol = getColIndex(/dilunaskan.*oleh|petugas|admin/i, 22);
      const waktuCol = getColIndex(/waktu.*pelunasan|tanggal.*acc/i, 23);
      const catCol = getColIndex(/catatan|keterangan/i, 24);

      const rows = rawRows.slice(1);
      result.honorLunasList = rows.map((row: any[], idx: number) => {
        const rawJobIds = String(row[jobIdsCol] || '');
        const parsedJobIds = rawJobIds ? rawJobIds.split(',').map(s => s.trim()).filter(Boolean) : [];
        const techIdVal = String(row[techIdCol] || '');
        const techNamaVal = String(row[techNamaCol] || '');

        return {
          id: String(row[idCol] || `lunas-${Date.now()}-${idx}`),
          tanggalLunas: sanitizeDateString(String(row[tglLunasCol] || '')),
          periodeAwal: sanitizeDateString(String(row[perAwalCol] || '')),
          periodeAkhir: sanitizeDateString(String(row[perAkhirCol] || '')),
          teknisiId: techIdVal,
          teknisiNama: techNamaVal,
          statusKaryawan: String(row[statusCol] || 'Tetap'),
          serverId: String(row[serverIdCol] || ''),
          namaServer: String(row[serverNamaCol] || ''),
          totalPekerjaanCount: Number(row[jobCountCol]) || 0,
          honorTetapServer: Number(row[honorTetapCol]) || 0,
          honorPJWilayah: Number(row[honorWilCol]) || 0,
          honorDasarPekerjaan: Number(row[honorDasarCol]) || 0,
          honorTitik: Number(row[honorTitikCol]) || 0,
          honorPanjangKabel: Number(row[honorKabelCol]) || 0,
          honorLembur: Number(row[honorLemburCol]) || 0,
          honorTransportKendaraan: Number(row[honorTransCol]) || 0,
          bonusTarget: Number(row[bonusCol]) || 0,
          potonganTerlambatAbsen: Number(row[potAbsenCol]) || 0,
          potonganManualKasbon: Number(row[potKasbonCol]) || 0,
          totalHonorNett: Number(row[totalNettCol]) || 0,
          jobIds: parsedJobIds,
          dilunaskanOleh: String(row[olehCol] || 'Admin'),
          waktuPelunasan: String(row[waktuCol] || ''),
          catatan: String(row[catCol] || '')
        };
      }).filter((hl: any) => hl.id && (hl.teknisiId || hl.teknisiNama));
    }
  }

  return result;
}


