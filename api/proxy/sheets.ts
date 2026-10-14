export default async function handler(req: any, res: any) {
  // Set CORS headers so frontend can call this endpoint safely
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const defaultUrl = process.env.VITE_GOOGLE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbyVyW9TxnWgCAQLS-sehGPay574Vnne2Fhn8t-mKqTX3PlvBwpS8kEbLzFF31dSaUj5/exec';

  const scriptUrl = (req.query?.url as string) || defaultUrl;
  const action = (req.query?.action as string) || 'getAllData';
  const sheet = req.query?.sheet as string;

  if (!scriptUrl || !scriptUrl.trim()) {
    return res.status(400).json({ success: false, message: 'Google Apps Script URL is required' });
  }

  let targetUrl = `${scriptUrl.trim()}?action=${encodeURIComponent(action)}`;
  if (sheet) {
    targetUrl += `&sheet=${encodeURIComponent(sheet)}`;
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Accept': 'application/json'
      }
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(response.status || 200).json(data);
  } catch (err: any) {
    console.error('[Vercel API /api/proxy/sheets] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal proxy error' });
  }
}
