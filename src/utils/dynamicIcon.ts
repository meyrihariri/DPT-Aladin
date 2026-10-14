import { AppSettings } from '../types';

/**
 * Dynamically updates document favicon, apple-touch-icon, and Web App Manifest
 * to match the company logo and company name configured in Pengaturan.
 */
export function updateDynamicAppIdentity(settings: AppSettings): void {
  const companyName = settings.namaPerusahaan?.trim() || 'DPT AlaDin';
  const logoUrl = settings.logoUrl?.trim() || '';

  // 1. Update Document Title & Meta Tags
  document.title = 'DPT-AlaDin - Manajemen Pekerjaan & Honor Teknisi';

  const metaAppName = document.querySelector<HTMLMetaElement>("meta[name='application-name']");
  if (metaAppName) metaAppName.content = 'DPT-AlaDin';

  const metaAppleTitle = document.querySelector<HTMLMetaElement>("meta[name='apple-mobile-web-app-title']");
  if (metaAppleTitle) metaAppleTitle.content = 'DPT-AlaDin';

  const activeIconSrc = logoUrl || '/pwa-192x192.png';

  // 2. Update Favicon & Apple Touch Icons
  const iconRels = [
    { rel: 'icon', type: 'image/png' },
    { rel: 'shortcut icon', type: 'image/png' },
    { rel: 'apple-touch-icon', type: '' },
    { rel: 'apple-touch-icon-precomposed', type: '' }
  ];

  iconRels.forEach(({ rel, type }) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      if (type) link.type = type;
      document.head.appendChild(link);
    }
    link.href = activeIconSrc;
  });

  // 3. Keep Web App Manifest pointing to the official /manifest.json (never blob URL)
  let manifestLink = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  if (manifestLink.href !== `${window.location.origin}/manifest.json`) {
    manifestLink.href = '/manifest.json';
  }
}
