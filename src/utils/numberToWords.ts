/**
 * Konversi angka rupiah ke teks terbilang bahasa Indonesia
 * Contoh: 2500000 -> "Dua Juta Lima Ratus Ribu Rupiah"
 */
export function terbilang(nominal: number): string {
  const num = Math.floor(Math.abs(nominal || 0));
  if (num === 0) return 'Nol Rupiah';

  const satuan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];

  function toWords(val: number): string {
    if (val < 12) {
      return satuan[val];
    } else if (val < 20) {
      return toWords(val - 10) + ' Belas';
    } else if (val < 100) {
      const sisa = val % 10;
      return toWords(Math.floor(val / 10)) + ' Puluh' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else if (val < 200) {
      const sisa = val - 100;
      return 'Seratus' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else if (val < 1000) {
      const sisa = val % 100;
      return toWords(Math.floor(val / 100)) + ' Ratus' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else if (val < 2000) {
      const sisa = val - 1000;
      return 'Seribu' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else if (val < 1000000) {
      const sisa = val % 1000;
      return toWords(Math.floor(val / 1000)) + ' Ribu' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else if (val < 1000000000) {
      const sisa = val % 1000000;
      return toWords(Math.floor(val / 1000000)) + ' Juta' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else if (val < 1000000000000) {
      const sisa = val % 1000000000;
      return toWords(Math.floor(val / 1000000000)) + ' Miliar' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    } else {
      const sisa = val % 1000000000000;
      return toWords(Math.floor(val / 1000000000000)) + ' Triliun' + (sisa !== 0 ? ' ' + toWords(sisa) : '');
    }
  }

  const result = toWords(num).replace(/\s+/g, ' ').trim();
  return result ? `${result} Rupiah` : 'Nol Rupiah';
}
