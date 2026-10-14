export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawId = req.query?.id as string;
  const rawUrl = req.query?.url as string;
  let fileId = rawId ? rawId.trim() : '';

  if (!fileId && rawUrl) {
    const match = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/) ||
                  rawUrl.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{20,})/) ||
                  rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
                  rawUrl.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    if (match && match[1]) {
      fileId = match[1];
    } else if (/^[a-zA-Z0-9_-]{25,45}$/.test(rawUrl.trim())) {
      fileId = rawUrl.trim();
    }
  }

  const candidateUrls: string[] = [];
  if (fileId) {
    candidateUrls.push(
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=view`,
      `https://drive.google.com/uc?export=view&id=${fileId}`
    );
  } else if (rawUrl && rawUrl.startsWith('http')) {
    candidateUrls.push(rawUrl);
  } else {
    return res.status(400).send('Parameter id or url required');
  }

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        },
        redirect: 'follow'
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (!contentType.includes('text/html')) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          return res.status(200).send(buffer);
        }
      }
    } catch {}
  }

  return res.status(404).send('Image could not be retrieved');
}
