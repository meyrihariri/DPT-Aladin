// PWA Manager: Handles BeforeInstallPrompt, AppInstalled, Standalone Detection, and Global Install Triggers
// Supports both Desktop PC (Chrome / Windows / Mac / Linux / Edge) and Mobile (Android / iOS)

type PWAInstallListener = () => void;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private listeners: Set<PWAInstallListener> = new Set();
  private isInstalledState: boolean = false;
  private isModalOpenState: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.checkInstalledStatus();

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        this.deferredPrompt = e as BeforeInstallPromptEvent;
        this.notifyListeners();
      });

      window.addEventListener('appinstalled', () => {
        this.isInstalledState = true;
        this.deferredPrompt = null;
        try {
          localStorage.setItem('pwa_installed', 'true');
        } catch {}
        this.notifyListeners();
      });

      // Check related installed apps if supported
      if ('getInstalledRelatedApps' in navigator) {
        (navigator as any).getInstalledRelatedApps?.().then((apps: any[]) => {
          if (apps && apps.length > 0) {
            this.isInstalledState = true;
            try {
              localStorage.setItem('pwa_installed', 'true');
            } catch {}
            this.notifyListeners();
          }
        }).catch(() => {});
      }
    }
  }

  private checkInstalledStatus(): boolean {
    if (typeof window === 'undefined') return false;
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    this.isInstalledState = isStandaloneMode;
    return isStandaloneMode;
  }

  public isInstalled(): boolean {
    return this.isInstalledState || this.checkInstalledStatus();
  }

  public isInstallPromptAvailable(): boolean {
    return !!this.deferredPrompt;
  }

  public isDesktop(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
    return !isMobile;
  }

  public isWindows(): boolean {
    if (typeof window === 'undefined') return false;
    return /win/i.test(navigator.userAgent || navigator.platform);
  }

  public isIOS(): boolean {
    if (typeof window === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  public isModalOpen(): boolean {
    return this.isModalOpenState;
  }

  public openModal(): void {
    this.isModalOpenState = true;
    this.notifyListeners();
  }

  public closeModal(): void {
    this.isModalOpenState = false;
    this.notifyListeners();
  }

  public async triggerInstall(): Promise<boolean> {
    if (this.deferredPrompt) {
      try {
        await this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          this.isInstalledState = true;
          try {
            localStorage.setItem('pwa_installed', 'true');
          } catch {}
          this.deferredPrompt = null;
          this.notifyListeners();
          return true;
        }
      } catch (err) {
        console.warn('[PWA] Prompt failed:', err);
      }
      this.deferredPrompt = null;
      this.notifyListeners();
      return false;
    }
    // If no direct prompt, open guide modal
    this.openModal();
    return false;
  }

  public markAsInstalled(): void {
    this.isInstalledState = true;
    try {
      localStorage.setItem('pwa_installed', 'true');
    } catch {}
    this.closeModal();
    this.notifyListeners();
  }

  public subscribe(listener: PWAInstallListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch {}
    });
  }
}

export const pwaManager = new PWAManager();
