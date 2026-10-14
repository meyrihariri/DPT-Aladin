export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

  const scriptUrl = ((body?.scriptUrl || req.query?.scriptUrl || req.query?.url) as string || defaultUrl).trim();

  if (!scriptUrl) {
    return res.status(400).json({ success: false, message: 'Google Apps Script URL is required' });
  }

  try {
    const gasUrl = `${scriptUrl}?action=getAllData`;
    const response = await fetch(gasUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'Accept': 'application/json' }
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(200).json({ success: true, data: data?.data || data });
  } catch (err: any) {
    console.error('[Vercel API /api/pull/sheets] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
