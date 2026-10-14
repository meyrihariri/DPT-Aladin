import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JobRecord, PayrollRecap, AppSettings, ServerData, Employee } from '../types';
import { formatRupiah } from '../services/payroll';
import { terbilang } from './numberToWords';

export interface PdfReportOptions {
  jobs: JobRecord[];
  payrollList: PayrollRecap[];
  settings?: AppSettings;
  servers?: ServerData[];
  employees?: Employee[];
  dateRange: {
    startDate: string;
    endDate: string;
    label: string;
  };
  filterServerId?: string;
  filterServerName?: string;
  filterTeknisiName?: string;
}

/**
 * Loads an image from URL and converts to base64 DataURL
 * Returns null if CORS or loading fails
 */
async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
            return;
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Format date string YYYY-MM-DD to Indonesian format DD MMMM YYYY
 */
function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      return `${day} ${months[monthIndex] || parts[1]} ${year}`;
    }
  } catch {
    // fallback
  }
  return dateStr;
}

export async function generateJobHonorPdfReport(options: PdfReportOptions): Promise<void> {
  const {
    jobs,
    payrollList,
    settings,
    dateRange,
    filterServerName = 'Semua Server',
    filterTeknisiName = 'Semua Teknisi'
  } = options;

  // Create A4 Landscape document (297 x 210 mm) for rich tabular report
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. KOP PERUSAHAAN (Official Corporate Letterhead)
  let kopStartY = 12;
  const companyName = settings?.namaPerusahaan || 'DPT AlaDin';
  const companyAddress = settings?.alamatPerusahaan || 'Jl. Raya Merdeka No. 1945 Indonesia Raya';

  // Try loading company logo
  let logoData: string | null = null;
  if (settings?.logoUrl) {
    logoData = await getBase64ImageFromUrl(settings.logoUrl);
  }

  // Draw Logo or Fallback Emblem
  const logoWidth = 22;
  const logoHeight = 22;
  const logoX = margin + 2;
  const logoY = kopStartY;

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch {
      drawFallbackLogo(doc, logoX, logoY, logoWidth, logoHeight, companyName);
    }
  } else {
    drawFallbackLogo(doc, logoX, logoY, logoWidth, logoHeight, companyName);
  }

  // Company Header Texts
  const textStartX = margin + logoWidth + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(128, 0, 32); // Deep Maroon (#800020)
  doc.text(companyName.toUpperCase(), textStartX, kopStartY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85); // Slate 700
  doc.text('JASA INSTALASI INTERNET DAN JARINGAN', textStartX, kopStartY + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(companyAddress, textStartX, kopStartY + 14.5);
  doc.text('Layanan Operasional Lapangan & Pemeliharaan Layanan Internet', textStartX, kopStartY + 18.5);

  // Official Double Line Separator for Letterhead
  const lineY = kopStartY + 24;
  doc.setDrawColor(128, 0, 32); // Deep Maroon
  doc.setLineWidth(0.8);
  doc.line(margin, lineY, pageWidth - margin, lineY);

  doc.setDrawColor(160, 160, 160); // Thin secondary line
  doc.setLineWidth(0.2);
  doc.line(margin, lineY + 1.2, pageWidth - margin, lineY + 1.2);

  // 2. REPORT TITLE & METADATA SECTION
  const titleY = lineY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text('LAPORAN RESMI DATA PEKERJAAN & REKAPITULASI HONOR TEKNISI', pageWidth / 2, titleY, { align: 'center' });

  // Document Number & Timestamp
  const now = new Date();
  const docNumber = `DPT/LP-HONOR/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}/${Math.floor(1000 + Math.random() * 9000)}`;
  const printDateStr = `${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} - ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Nomor Dokumen: ${docNumber}  |  Diterbitkan: ${printDateStr}`, pageWidth / 2, titleY + 4.5, { align: 'center' });

  // 3. FILTER PARAMETERS & EXECUTIVE SUMMARY BOX
  const infoBoxY = titleY + 7;
  const infoBoxHeight = 16;
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, infoBoxY, contentWidth, infoBoxHeight, 2, 2, 'FD');

  // Left Column: Filter info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Periode Tanggal:', margin + 4, infoBoxY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${formatIndonesianDate(dateRange.startDate)} s/d ${formatIndonesianDate(dateRange.endDate)} (${dateRange.label})`, margin + 30, infoBoxY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Filter Server:', margin + 4, infoBoxY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(filterServerName, margin + 30, infoBoxY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Filter Teknisi:', margin + 95, infoBoxY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(filterTeknisiName, margin + 117, infoBoxY + 11.5);

  // Right Column: Summary Metric Badges
  const grandTotalJobs = jobs.length;
  const grandTotalTitik = jobs.reduce((sum, j) => sum + (j.jumlahTitik || 0), 0);
  const grandTotalKabel = jobs.reduce((sum, j) => sum + (j.panjangKabelMeter || 0), 0);
  const grandTotalPayroll = payrollList.reduce((sum, p) => sum + (p.totalHonorNett || 0), 0);

  const statX = pageWidth - margin - 85;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Total Pekerjaan: `, statX, infoBoxY + 5.5);
  doc.setTextColor(128, 0, 32);
  doc.text(`${grandTotalJobs} Jobs  (${grandTotalTitik} Titik, ${grandTotalKabel}m Kabel)`, statX + 26, infoBoxY + 5.5);

  doc.setTextColor(71, 85, 105);
  doc.text(`Total Honor Nett: `, statX, infoBoxY + 11.5);
  doc.setFontSize(9);
  doc.setTextColor(16, 185, 129); // Emerald 600
  doc.text(formatRupiah(grandTotalPayroll), statX + 26, infoBoxY + 11.5);

  // 4. TABEL 1: DATA RINCIAN PEKERJAAN (JOB RECORDS)
  let currentY = infoBoxY + infoBoxHeight + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('A. Rincian Data Pekerjaan Teknisi', margin, currentY);

  const jobTableHeaders = [
    'No',
    'Tanggal',
    'Pekerjaan / Sub',
    'Ket. Pekerjaan',
    'Server & Wilayah',
    'Teknisi Bertugas',
    'Titik',
    'Kabel',
    'Lembur',
    'Kendaraan',
    'Est. Honor'
  ];

  const jobTableRows = jobs.map((job, idx) => {
    // Format vehicles
    let vehiclesStr = '-';
    if (job.teknisiVehicles && Object.keys(job.teknisiVehicles).length > 0) {
      vehiclesStr = Object.entries(job.teknisiVehicles)
        .map(([tId, v]) => {
          const emp = options.employees?.find(e => e.id === tId);
          return `${emp?.namaLengkap.split(' ')[0] || 'Tek'}: ${v}`;
        })
        .join(', ');
    }

    // Format server & wilayah
    const srvObj = options.servers?.find(s => s.id === job.serverId || s.id === job.namaServer || s.namaServer === job.namaServer);
    const resolvedServerName = srvObj ? srvObj.namaServer : (job.namaServer && !job.namaServer.startsWith('srv-') ? job.namaServer : '-');

    const wilStr = job.wilayahNamas && job.wilayahNamas.length > 0
      ? job.wilayahNamas.join(', ')
      : resolvedServerName;

    // Catatan / Keterangan Pekerjaan dari form Input Data Pekerjaan Teknisi / Sheet Daftar Pekerjaan
    const ketPekerjaan = (job.catatan && job.catatan.trim()) ? job.catatan.trim() : '-';

    return [
      String(idx + 1),
      job.tanggal.slice(0, 10),
      `${job.jenisPekerjaanNama || '-'}\n(${job.subPekerjaanNama || '-'})`,
      ketPekerjaan,
      `${resolvedServerName}\n${wilStr}`,
      job.teknisiNamas?.join(', ') || '-',
      `${job.jumlahTitik || 0} ttk`,
      `${job.panjangKabelMeter || 0} m`,
      job.menitLembur ? `${job.menitLembur} mnt\n${job.lemburApproved ? '(ACC)' : '(Pending)'}` : '-',
      vehiclesStr,
      formatRupiah(job.estimasiTotalHonor || 0)
    ];
  });

  if (jobTableRows.length === 0) {
    jobTableRows.push(['-', '-', 'Tidak ada data pekerjaan pada filter periode ini', '-', '-', '-', '-', '-', '-', '-', '-']);
  }

  autoTable(doc, {
    startY: currentY + 2,
    head: [jobTableHeaders],
    body: jobTableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [128, 0, 32], // Deep Maroon
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center',
      valign: 'middle',
      cellPadding: 1.8
    },
    bodyStyles: {
      fontSize: 6.8,
      textColor: [30, 41, 59],
      cellPadding: 1.8,
      valign: 'middle'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 }, // No
      1: { halign: 'center', cellWidth: 18 }, // Tanggal
      2: { cellWidth: 36 }, // Pekerjaan / Sub
      3: { cellWidth: 45 }, // Ket. Pekerjaan
      4: { cellWidth: 32 }, // Server & Wilayah
      5: { cellWidth: 34 }, // Teknisi Bertugas
      6: { halign: 'center', cellWidth: 12 }, // Titik
      7: { halign: 'center', cellWidth: 13 }, // Kabel
      8: { halign: 'center', cellWidth: 16 }, // Lembur
      9: { cellWidth: 28 }, // Kendaraan
      10: { halign: 'right', fontStyle: 'bold', cellWidth: 27 } // Est. Honor
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Draw footer on every page
      drawPageFooter(doc, pageWidth, pageHeight, margin);
    }
  });

  // 5. TABEL 2: REKAPITULASI HONOR TEKNISI
  // Get last autoTable Y position
  const lastTableInfo = (doc as any).lastAutoTable;
  let table2StartY = lastTableInfo ? lastTableInfo.finalY + 8 : currentY + 40;

  // If table2 would overflow page height, add a new page
  if (table2StartY > pageHeight - 55) {
    doc.addPage();
    table2StartY = margin + 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('B. Rekapitulasi Honor & Gaji per Teknisi', margin, table2StartY);

  const recapTableHeaders = [
    'No',
    'Nama Teknisi',
    'Status',
    'Total Jobs',
    'Honor Server & Wilayah',
    'Honor Pekerjaan',
    'Bonus Target',
    'Potongan (Absen & Kasbon)',
    'Total Honor Nett'
  ];

  const recapTableRows = payrollList.map((p, idx) => {
    const totalHonorJobs = p.honorDasarPekerjaan + p.honorTitik + p.honorPanjangKabel + p.honorLembur + p.honorTransportKendaraan;
    const honorServerWil = p.honorTetapServer + p.honorPJWilayah;

    return [
      String(idx + 1),
      p.teknisiNama,
      p.statusKaryawan,
      `${p.totalPekerjaanCount} Jobs`,
      formatRupiah(honorServerWil),
      formatRupiah(totalHonorJobs),
      p.bonusTarget > 0 ? `+${formatRupiah(p.bonusTarget)}` : 'Rp 0',
      p.totalPotongan > 0 ? `-${formatRupiah(p.totalPotongan)}` : 'Rp 0',
      formatRupiah(p.totalHonorNett)
    ];
  });

  // Total summary footer row for table 2
  const totalServerWil = payrollList.reduce((sum, p) => sum + (p.honorTetapServer + p.honorPJWilayah), 0);
  const totalJobsHonor = payrollList.reduce((sum, p) => sum + (p.honorDasarPekerjaan + p.honorTitik + p.honorPanjangKabel + p.honorLembur + p.honorTransportKendaraan), 0);
  const totalBonus = payrollList.reduce((sum, p) => sum + p.bonusTarget, 0);
  const totalPotongan = payrollList.reduce((sum, p) => sum + p.totalPotongan, 0);

  const footerRow = [
    'TOTAL',
    `Akumulasi (${payrollList.length} Teknisi)`,
    '-',
    `${payrollList.reduce((s, p) => s + p.totalPekerjaanCount, 0)} Jobs`,
    formatRupiah(totalServerWil),
    formatRupiah(totalJobsHonor),
    totalBonus > 0 ? `+${formatRupiah(totalBonus)}` : 'Rp 0',
    totalPotongan > 0 ? `-${formatRupiah(totalPotongan)}` : 'Rp 0',
    formatRupiah(grandTotalPayroll)
  ];

  autoTable(doc, {
    startY: table2StartY + 2,
    head: [recapTableHeaders],
    body: recapTableRows,
    foot: [footerRow],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // Slate 800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      cellPadding: 2
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.5,
      valign: 'middle'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [128, 0, 32],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { fontStyle: 'bold', cellWidth: 50 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 38 },
      5: { halign: 'right', cellWidth: 38 },
      6: { halign: 'right', cellWidth: 26 },
      7: { halign: 'right', textColor: [225, 29, 72], cellWidth: 28 }, // Rose 600
      8: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129], cellWidth: 35 } // Emerald 600
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      drawPageFooter(doc, pageWidth, pageHeight, margin);
    }
  });

  // 6. LEMBAR PENGESAHAN / TANDA TANGAN RESMI
  const lastTable2Info = (doc as any).lastAutoTable;
  let signStartY = lastTable2Info ? lastTable2Info.finalY + 8 : pageHeight - 45;

  // Ensure signatures fit on page, else create new page
  if (signStartY > pageHeight - 42) {
    doc.addPage();
    signStartY = margin + 12;
  }

  const signDateStr = `Ditetapkan di: Indonesia, ${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(signDateStr, pageWidth - margin - 75, signStartY);

  const signCol1X = margin + 25;
  const signCol2X = pageWidth - margin - 75;
  const signTitleY = signStartY + 5;

  // Left Sign: Koordinator Lapangan / Admin
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('Dibuat Oleh,', signCol1X, signTitleY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Koordinator Lapangan & Admin', signCol1X, signTitleY + 4);

  // Space for physical signature / stamp
  const signLineY = signTitleY + 22;
  doc.setDrawColor(148, 163, 184); // Slate 400
  doc.setLineWidth(0.4);
  doc.line(signCol1X - 5, signLineY, signCol1X + 45, signLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${settings?.adminUsername || 'Administrator'} )`, signCol1X, signLineY + 4);

  // Right Sign: Mengetahui & Menyetujui Pimpinan / Penanggungjawab Server / Manager Keuangan
  // Jika filter 'Semua Server', tanda tangan adalah Manager Keuangan dengan nama Bendahara
  // Jika filter server spesifik, tanda tangan adalah Pimpinan / Penanggung Jawab server tersebut
  const cleanFilterServerName = (options.filterServerName || '').trim();
  const cleanFilterServerId = (options.filterServerId || '').trim();

  const isAllServers = !cleanFilterServerId || cleanFilterServerId === 'all' || cleanFilterServerName.toLowerCase() === 'semua server';

  let signRoleTitle = 'Pimpinan / Penanggung Jawab Server';
  let signPersonName = 'Bendahara';

  if (isAllServers) {
    signRoleTitle = 'Manager Keuangan';
    const bendaharaEmp = options.employees?.find(e => 
      e.namaLengkap.toLowerCase().includes('bendahara') || 
      e.username?.toLowerCase().includes('bendahara')
    );
    signPersonName = bendaharaEmp?.namaLengkap || 'Bendahara';
  } else {
    // 1. Cari Server yang sesuai berdasarkan filterServerId atau filterServerName
    let targetServer: ServerData | undefined = undefined;

    if (cleanFilterServerId && cleanFilterServerId !== 'all') {
      targetServer = options.servers?.find(s => s.id === cleanFilterServerId);
    }

    if (!targetServer && cleanFilterServerName && cleanFilterServerName.toLowerCase() !== 'semua server') {
      targetServer = options.servers?.find(s => 
        s.namaServer.toLowerCase().trim() === cleanFilterServerName.toLowerCase() ||
        s.id.toLowerCase().trim() === cleanFilterServerName.toLowerCase()
      );
    }

    let pjName = '';
    if (targetServer) {
      if (targetServer.penanggungJawabNama && targetServer.penanggungJawabNama.trim()) {
        pjName = targetServer.penanggungJawabNama.trim();
      } else if (targetServer.penanggungJawabId && options.employees) {
        const emp = options.employees.find(e => 
          e.id === targetServer!.penanggungJawabId || 
          e.namaLengkap.toLowerCase().trim() === targetServer!.penanggungJawabId.toLowerCase().trim()
        );
        if (emp) pjName = emp.namaLengkap;
      }
      signRoleTitle = `Pimpinan / Penanggung Jawab Server ${targetServer.namaServer}`;
    }

    signPersonName = pjName || 'Pimpinan / Penanggung Jawab Server';
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('Mengetahui & Menyetujui,', signCol2X, signTitleY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(signRoleTitle, signCol2X, signTitleY + 4);

  const signLineWidth = Math.max(55, (signPersonName.length * 2.3) + 10);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(signCol2X - 5, signLineY, signCol2X - 5 + signLineWidth, signLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${signPersonName} )`, signCol2X, signLineY + 4);

  // Save the PDF file to user download
  const safeStart = dateRange.startDate.replace(/[^0-9]/g, '');
  const safeEnd = dateRange.endDate.replace(/[^0-9]/g, '');
  const fileName = `Laporan_Resmi_Pekerjaan_Honor_${safeStart}_sd_${safeEnd}.pdf`;
  doc.save(fileName);
}

/**
 * Fallback corporate logo if image URL cannot be loaded (CORS / offline)
 */
function drawFallbackLogo(doc: jsPDF, x: number, y: number, w: number, h: number, companyName: string) {
  // Draw maroon badge with white text
  doc.setFillColor(128, 0, 32); // Deep Maroon
  doc.roundedRect(x, y, w, h, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('ALADIN', x + w / 2, y + h / 2 - 1, { align: 'center' });

  doc.setFontSize(5.5);
  doc.setTextColor(254, 240, 138); // Yellow 200
  doc.text('NETWORK', x + w / 2, y + h / 2 + 3.5, { align: 'center' });
}

/**
 * Draw official footer at the bottom of each page
 */
function drawPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number, margin: number) {
  const footerY = pageHeight - 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184); // Slate 400

  // Left
  doc.text(
    'Dokumen ini dicetak otomatis dan sah melalui Sistem Manajemen Operasional DPT AlaDin',
    margin,
    footerY
  );

  // Right: Page number
  const pageNumber = (doc as any).internal.getNumberOfPages();
  doc.text(`Hal. ${pageNumber}`, pageWidth - margin, footerY, { align: 'right' });
}

export interface IndividualSlipPdfOptions {
  recap: PayrollRecap;
  settings?: AppSettings;
  servers?: ServerData[];
  employees?: Employee[];
  filterServerId?: string;
  filterServerName?: string;
}

/**
 * Generate official printable PDF pay slip for an individual technician
 */
export async function generateIndividualSlipPdf(options: IndividualSlipPdfOptions): Promise<void> {
  const { recap, settings, servers, employees, filterServerId, filterServerName } = options;

  // Create A4 Portrait document (210 x 297 mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // 1. KOP SURAT RESMI PERUSAHAAN
  const kopY = 10;
  const companyName = settings?.namaPerusahaan || 'DPT AlaDin';
  const companyAddress = settings?.alamatPerusahaan || 'Jl. Raya Merdeka No. 1945 Indonesia Raya';

  let logoData: string | null = null;
  if (settings?.logoUrl) {
    logoData = await getBase64ImageFromUrl(settings.logoUrl);
  }

  const logoWidth = 16;
  const logoHeight = 16;
  const logoX = margin;
  const logoY = kopY;

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch {
      drawFallbackLogo(doc, logoX, logoY, logoWidth, logoHeight, companyName);
    }
  } else {
    drawFallbackLogo(doc, logoX, logoY, logoWidth, logoHeight, companyName);
  }

  const textStartX = margin + logoWidth + 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(128, 0, 32); // Deep Maroon (#800020)
  doc.text(companyName, textStartX, kopY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('JASA INSTALASI INTERNET DAN JARINGAN', textStartX, kopY + 8.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(companyAddress, textStartX, kopY + 11.8);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Layanan Operasional Lapangan & Pemeliharaan Layanan Internet', textStartX, kopY + 15.2);

  // KOTAK KANAN KOP: DOKUMEN RESMI
  const boxWidth = 26;
  const boxHeight = 6.2;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = kopY + 1.5;

  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1, 1, 'FD');

  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85); // slate-700
  doc.text('DOKUMEN RESMI', boxX + boxWidth / 2, boxY + 4.1, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Sistem Penggajian DPT', pageWidth - margin, boxY + boxHeight + 4, { align: 'right' });

  // Garis Kop Ganda
  const lineY = kopY + 18.5;
  doc.setDrawColor(128, 0, 32);
  doc.setLineWidth(0.8);
  doc.line(margin, lineY, pageWidth - margin, lineY);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, lineY + 0.8, pageWidth - margin, lineY + 0.8);

  // 2. JUDUL DOKUMEN SLIP GAJI
  const titleY = lineY + 6.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('SLIP GAJI & HONORARIUM TEKNISI', pageWidth / 2, titleY, { align: 'center' });

  const cleanPeriod = recap.periode || new Date().toISOString().slice(0, 7);
  const docNo = `DPT/SLIP/${cleanPeriod.replace('-', '')}/${recap.teknisiId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || '001'}`;

  // Format periode: "2026-09" -> "September 2026", atau tampilkan range jika sudah berformat range
  let formattedPeriode = cleanPeriod;
  try {
    const parts = cleanPeriod.split('-');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      formattedPeriode = new Date(year, monthIndex, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
  } catch {
    formattedPeriode = cleanPeriod;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`No. Dokumen: ${docNo}   •   Periode: ${formattedPeriode}`, pageWidth / 2, titleY + 4, { align: 'center' });

  // 3. TABEL IDENTITAS KARYAWAN (4 KOLOM DENGAN DESAIN KARTU SLATE)
  const isAllServers = !filterServerId || filterServerId === 'all' || filterServerName?.toLowerCase() === 'semua server';
  const serverScopeLabel = isAllServers ? 'Semua Server' : (filterServerName || 'Server Terkait');

  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const cardStartY = titleY + 6.5;
  autoTable(doc, {
    startY: cardStartY,
    head: [],
    body: [
      [
        `NAMA TEKNISI\n${recap.teknisiNama}`,
        `NIK / ID TEKNISI\n${recap.teknisiId}`,
        `STATUS KEPEGAWAIAN\n${recap.statusKaryawan || 'Tetap'}`,
        `SERVER PENUGASAN\n${serverScopeLabel}`
      ],
      [
        `TOTAL TUGAS SELESAI\n${recap.totalPekerjaanCount || 0} Pekerjaan`,
        `TOTAL LEMBUR ACC\n${recap.totalMenitLembur || 0} Menit`,
        `TANGGAL CETAK\n${printDateStr}`,
        `STATUS PEMBAYARAN\nSIAP TRANSFER / TUNAI`
      ]
    ],
    theme: 'grid',
    styles: {
      fillColor: [248, 250, 252],
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      cellPadding: 1.8,
      fontSize: 7.5,
      textColor: [30, 41, 59],
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 44 },
      2: { cellWidth: 44 },
      3: { cellWidth: 48 }
    },
    didParseCell: (data) => {
      // Baris pertama / kedua styling
      if (data.row.index === 0 && data.column.index === 0) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin }
  });

  const afterInfoY = (doc as any).lastAutoTable.finalY + 3;

  // 4. TABEL UTAMA: PENERIMAAN & POTONGAN (2 KOLOM RESMI PERSIS PREVIEW & GAMBAR 1)
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

  // Selalu tampilkan baris potongan standar (Potongan Terlambat & Kasbon Manual dengan Rp 0 jika nihil) seperti Gambar 1
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

  const maxRows = Math.max(earningsList.length, deductionsList.length, 6);
  const tableRows = [];
  for (let i = 0; i < maxRows; i++) {
    const earn = earningsList[i];
    const ded = deductionsList[i];

    const earnLabel = earn
      ? (earn.note ? `${earn.label}\n(${earn.note})` : earn.label)
      : '';
    const earnVal = earn ? formatRupiah(earn.amount) : '';

    const dedLabel = ded
      ? (ded.note ? `${ded.label}\n(${ded.note})` : ded.label)
      : '';
    const dedVal = ded
      ? (ded.amount > 0 ? `-${formatRupiah(ded.amount)}` : 'Rp 0')
      : '';

    tableRows.push([
      earnLabel,
      earnVal,
      dedLabel,
      dedVal
    ]);
  }

  // Row for Subtotals
  tableRows.push([
    { content: 'Total Penerimaan Kotor (Gross)', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
    { content: formatRupiah(recap.totalHonorGross || 0), styles: { fontStyle: 'bold', halign: 'right', fillColor: [248, 250, 252] } },
    { content: 'Total Potongan', styles: { fontStyle: 'bold', textColor: [225, 29, 72], fillColor: [255, 241, 242] } },
    { content: recap.totalPotongan > 0 ? `-${formatRupiah(recap.totalPotongan)}` : 'Rp 0', styles: { fontStyle: 'bold', halign: 'right', textColor: [225, 29, 72], fillColor: [255, 241, 242] } },
  ]);

  autoTable(doc, {
    startY: afterInfoY,
    head: [
      [
        { content: 'A. PENERIMAAN / HAK (EARNINGS)', colSpan: 2, styles: { halign: 'left', fillColor: [128, 0, 32], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'B. POTONGAN (DEDUCTIONS)', colSpan: 2, styles: { halign: 'left', fillColor: [136, 19, 55], textColor: [255, 255, 255], fontStyle: 'bold' } }
      ],
      [
        { content: 'Komponen Penerimaan', styles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' } },
        { content: 'Jumlah (Rp)', styles: { halign: 'right', fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' } },
        { content: 'Komponen Potongan', styles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' } },
        { content: 'Jumlah (Rp)', styles: { halign: 'right', fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' } }
      ]
    ],
    body: tableRows as any,
    theme: 'grid',
    styles: {
      fontSize: 7.2,
      cellPadding: 1.6,
      textColor: [30, 41, 59],
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.25
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 33, halign: 'right' },
      2: { cellWidth: 60 },
      3: { cellWidth: 33, halign: 'right' }
    },
    margin: { left: margin, right: margin }
  });

  const afterTableY = (doc as any).lastAutoTable.finalY + 3;

  // 5. KOTAK TOTAL GAJI NETT DITERIMA (TAKE HOME PAY)
  autoTable(doc, {
    startY: afterTableY,
    head: [],
    body: [
      [
        {
          content: 'TOTAL GAJI / TAKE HOME PAY NETT DITERIMA :',
          styles: { fontStyle: 'bold', fontSize: 8.5, textColor: [6, 78, 59], halign: 'left', cellPadding: 2.5 }
        },
        {
          content: formatRupiah(recap.totalHonorNett || 0),
          styles: { fontStyle: 'bold', fontSize: 12, textColor: [4, 120, 87], halign: 'right', cellPadding: 2.5 }
        }
      ],
      [
        {
          content: `Terbilang: ${terbilang(recap.totalHonorNett || 0)}`,
          colSpan: 2,
          styles: { fontStyle: 'italic', fontSize: 7.2, textColor: [4, 120, 87], halign: 'left', cellPadding: 1.8 }
        }
      ]
    ],
    theme: 'grid',
    styles: {
      fillColor: [236, 253, 245], // Light Emerald 50
      lineColor: [16, 185, 129],  // Emerald 500
      lineWidth: 0.6
    },
    columnStyles: {
      0: { cellWidth: 126 },
      1: { cellWidth: 60 }
    },
    margin: { left: margin, right: margin }
  });

  let afterNettY = (doc as any).lastAutoTable.finalY + 3;

  // 6. DISTRIBUSI BEBAN PEMBAYARAN HONOR ANTAR-SERVER (JIKA ADA SERVER PENGERJAAN)
  if (recap.serverBreakdowns && recap.serverBreakdowns.length > 0) {
    const distStartY = afterNettY + 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(`* Distribusi Beban Pembayaran Honor Antar-Server (${recap.serverBreakdowns.length} Server):`, margin, distStartY);

    const distRows: any[] = [];
    for (let i = 0; i < recap.serverBreakdowns.length; i += 2) {
      const s1 = recap.serverBreakdowns[i];
      const s2 = recap.serverBreakdowns[i + 1];
      distRows.push([
        s1 ? `Server ${s1.serverNama} (${s1.jobCount} Jobs)` : '',
        s1 ? formatRupiah(s1.totalGross) : '',
        s2 ? `Server ${s2.serverNama} (${s2.jobCount} Jobs)` : '',
        s2 ? formatRupiah(s2.totalGross) : ''
      ]);
    }

    autoTable(doc, {
      startY: distStartY + 1.5,
      head: [],
      body: distRows,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 1.6,
        fillColor: [248, 250, 252],
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        textColor: [30, 41, 59]
      },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 33, fontStyle: 'bold', halign: 'right' },
        2: { cellWidth: 60, fontStyle: 'bold' },
        3: { cellWidth: 33, fontStyle: 'bold', halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    afterNettY = (doc as any).lastAutoTable.finalY + 5;
  }

  // 7. TANDA TANGAN RESMI
  let signRoleTitle = 'Pimpinan / Penanggung Jawab Server';
  let signPersonName = 'Bendahara';

  if (isAllServers) {
    signRoleTitle = 'Manager Keuangan';
    const bendaharaEmp = employees?.find(e => 
      e.namaLengkap.toLowerCase().includes('bendahara') || 
      e.username?.toLowerCase().includes('bendahara')
    );
    signPersonName = bendaharaEmp?.namaLengkap || 'Bendahara';
  } else {
    let targetServer: ServerData | undefined = undefined;
    if (filterServerId && filterServerId !== 'all') {
      targetServer = servers?.find(s => s.id === filterServerId);
    }
    if (!targetServer && filterServerName && filterServerName.toLowerCase() !== 'semua server') {
      targetServer = servers?.find(s => 
        s.namaServer.toLowerCase().trim() === filterServerName.toLowerCase().trim() ||
        s.id.toLowerCase().trim() === filterServerName.toLowerCase().trim()
      );
    }
    let pjName = '';
    if (targetServer) {
      if (targetServer.penanggungJawabNama && targetServer.penanggungJawabNama.trim()) {
        pjName = targetServer.penanggungJawabNama.trim();
      } else if (targetServer.penanggungJawabId && employees) {
        const emp = employees.find(e => 
          e.id === targetServer!.penanggungJawabId || 
          e.namaLengkap.toLowerCase().trim() === targetServer!.penanggungJawabId.toLowerCase().trim()
        );
        if (emp) pjName = emp.namaLengkap;
      }
      signRoleTitle = `Pimpinan / Penanggung Jawab Server ${targetServer.namaServer}`;
    }
    signPersonName = pjName || 'Pimpinan / Penanggung Jawab Server';
  }

  const usableWidth = pageWidth - margin * 2;
  const signCol1X = margin + (usableWidth * 0.25); // Sempurna di tengah kolom kiri (58.5 mm)
  const signCol2X = margin + (usableWidth * 0.75); // Sempurna di tengah kolom kanan (151.5 mm)
  const signStartY = afterNettY + 2;

  // Sign Kiri: Penerima
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 41, 59);
  doc.text('Penerima / Karyawan,', signCol1X, signStartY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Teknisi Bersangkutan', signCol1X, signStartY + 3.5, { align: 'center' });

  const signLineY = signStartY + 18;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.3);
  doc.line(signCol1X - 25, signLineY, signCol1X + 25, signLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${recap.teknisiNama} )`, signCol1X, signLineY + 3.8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text('Tanda tangan & Nama Terang', signCol1X, signLineY + 7, { align: 'center' });

  // Sign Kanan: Mengetahui & Menyetujui
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 41, 59);
  doc.text('Mengetahui & Menyetujui,', signCol2X, signStartY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(signRoleTitle, signCol2X, signStartY + 3.5, { align: 'center' });

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.3);
  doc.line(signCol2X - 25, signLineY, signCol2X + 25, signLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${signPersonName} )`, signCol2X, signLineY + 3.8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text('Penanggung Jawab / Otorisasi', signCol2X, signLineY + 7, { align: 'center' });

  // 8. FOOTER NOTE RESMI
  const footerNoteY = pageHeight - 9;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(margin, footerNoteY - 2, pageWidth - margin, footerNoteY - 2);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Catatan: Slip gaji ini adalah dokumen sah yang diterbitkan secara komputerisasi oleh sistem DPT AlaDin dan tidak memerlukan cap basah jika telah ditandatangani.',
    pageWidth / 2,
    footerNoteY + 1.5,
    { align: 'center' }
  );

  // Download PDF
  const safeName = recap.teknisiNama.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Slip_Gaji_${safeName}_${cleanPeriod}.pdf`;
  doc.save(fileName);
}
