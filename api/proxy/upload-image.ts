export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const defaultUrl = process.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbyVyW9TxnWgCAQLS-sehGPay574Vnne2Fhn8t-mKqTX3PlvBwpS8kEbLzFF31dSaUj5/exec';

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {}
  }

  const { base64Data, filename, folderName, scriptUrl } = body || {};
  const url = (scriptUrl || defaultUrl).trim();

  if (!url) {
    return res.status(400).json({ success: false, message: 'Google Apps Script URL is required' });
  }
  if (!base64Data) {
    return res.status(400).json({ success: false, message: 'base64Data is required' });
  }

  try {
    let cleanB64 = String(base64Data);
    const b64Idx = cleanB64.indexOf('base64,');
    if (b64Idx !== -1) {
      cleanB64 = cleanB64.substring(b64Idx + 7);
    }
    cleanB64 = cleanB64.split(' ').join('+').replace(/[^A-Za-z0-9+/=]/g, '');

    const targetFilename = filename || `bukti_${Date.now()}.jpg`;
    const payload = {
      action: 'uploadImage',
      base64Data: cleanB64,
      filename: targetFilename,
      folderName: folderName || 'DPT_AlaDin_Bukti_Foto'
    };

    const gasRes = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const text = await gasRes.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (json && (json.status === 'success' || json.fileUrl || json.fileId)) {
      const fileId = json.fileId || '';
      return res.status(200).json({
        success: true,
        fileId: json.fileId,
        fileUrl: json.fileUrl || `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
        driveUrl: json.driveUrl
      });
    }

    return res.status(400).json({ success: false, message: json?.message || 'Upload gagal', details: json });
  } catch (err: any) {
    console.error('[Vercel API /api/proxy/upload-image] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
