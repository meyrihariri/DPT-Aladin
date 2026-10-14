export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawPath = Array.isArray(req.query?.path)
    ? req.query.path.join('/')
    : (req.query?.path || (req.url || '').split('?')[0].replace(/^\/api\/?/, ''));

  const cleanPath = String(rawPath).toLowerCase();

  const defaultUrl = process.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbyVyW9TxnWgCAQLS-sehGPay574Vnne2Fhn8t-mKqTX3PlvBwpS8kEbLzFF31dSaUj5/exec';

  // 1. Proxy Sheets (GET)
  if (cleanPath.startsWith('proxy/sheets')) {
    const scriptUrl = (req.query?.url as string) || defaultUrl;
    const action = (req.query?.action as string) || 'getAllData';
    const sheet = req.query?.sheet as string;
    let targetUrl = `${scriptUrl.trim()}?action=${encodeURIComponent(action)}`;
    if (sheet) targetUrl += `&sheet=${encodeURIComponent(sheet)}`;

    try {
      const response = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(response.status || 200).json(data);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 2. Sync Sheets (POST)
  if (cleanPath.startsWith('sync/sheets')) {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
    const { scriptUrl, payload } = body || {};
    const url = (scriptUrl || defaultUrl).trim();
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload || {})
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. Health & Bootstrap
  if (cleanPath === 'health') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  if (cleanPath === 'bootstrap') {
    return res.status(200).json({
      success: true,
      data: {
        settings: {
          namaPerusahaan: 'DPT AlaDin',
          alamatPerusahaan: 'Jl. Utama RT/RW Net No. 88, Jakarta East',
          adminUsername: 'admin',
          adminPassword: 'Admin143',
          googleAppsScriptUrl: defaultUrl,
          isGoogleSheetConnected: true
        }
      }
    });
  }

  // 4. Default JSON response for presence / status
  return res.status(200).json({ success: true });
}
