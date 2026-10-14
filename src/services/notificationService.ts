import { PlanningTask, Employee, AppSettings } from '../types';

export interface NotificationDeliveryResult {
  technicianId: string;
  technicianNama: string;
  phone: string;
  browserPushSent: boolean;
  whatsAppSent: boolean;
  whatsAppDirectUrl: string;
  message: string;
  error?: string;
}

class NotificationServiceManager {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private audioContext: AudioContext | null = null;

  /**
   * Register Service Worker on startup
   */
  public async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      this.swRegistration = registration;
      console.log('✅ Service Worker registered successfully for Background Push:', registration.scope);
      return registration;
    } catch (error) {
      console.warn('⚠️ Service Worker registration skipped or failed:', error);
      return null;
    }
  }

  /**
   * Check browser notification permission status
   */
  public getPermissionStatus(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  /**
   * Request Notification permission from user
   */
  public async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.playChimeSound();
        this.sendSystemNotification('🔔 Notifikasi Tugas Aktif!', {
          body: 'Anda akan menerima pemberitahuan langsung saat ada tugas planning baru meskipun aplikasi sedang ditutup.',
          tag: 'welcome-notification'
        });
      }
      return permission;
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return 'denied';
    }
  }

  /**
   * Play an audible chime tone using Web Audio API (sine wave synthesis)
   */
  public playChimeSound(): void {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const now = this.audioContext.currentTime;
      
      // Tone 1: 587.33 Hz (D5)
      const osc1 = this.audioContext.createOscillator();
      const gain1 = this.audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(this.audioContext.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2: 880 Hz (A5)
      const osc2 = this.audioContext.createOscillator();
      const gain2 = this.audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.4, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(this.audioContext.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.55);

      // Tone 3: 1174.66 Hz (D6)
      const osc3 = this.audioContext.createOscillator();
      const gain3 = this.audioContext.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(1174.66, now + 0.25);
      gain3.gain.setValueAtTime(0, now + 0.25);
      gain3.gain.linearRampToValueAtTime(0.35, now + 0.3);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc3.connect(gain3);
      gain3.connect(this.audioContext.destination);
      osc3.start(now + 0.25);
      osc3.stop(now + 0.8);
    } catch (e) {
      console.warn('Audio chime playback skipped:', e);
    }
  }

  /**
   * Display System Notification (via ServiceWorker or standard Notification)
   */
  public async sendSystemNotification(
    title: string,
    options: {
      body: string;
      tag?: string;
      data?: any;
      icon?: string;
    }
  ): Promise<boolean> {
    if (this.getPermissionStatus() !== 'granted') {
      return false;
    }

    try {
      this.playChimeSound();

      // Prefer Service Worker showNotification for persistent background banners
      if (this.swRegistration && 'showNotification' in this.swRegistration) {
        await this.swRegistration.showNotification(title, {
          body: options.body,
          icon: options.icon || '/api/app-icon.png',
          badge: '/pwa-192x192.png',
          tag: options.tag || `notif-${Date.now()}`,
          vibrate: [200, 100, 200, 100, 200],
          data: options.data || { url: '/' }
        } as any);
        return true;
      }

      // Fallback to browser Notification constructor
      if ('Notification' in window) {
        new Notification(title, {
          body: options.body,
          icon: options.icon || '/api/app-icon.png',
          tag: options.tag || `notif-${Date.now()}`
        });
        return true;
      }
    } catch (err) {
      console.warn('Could not display system notification:', err);
    }

    return false;
  }

  /**
   * Format phone number to clean Indonesian format (628...)
   */
  public formatIndonesianPhoneNumber(phone: string): string {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    } else if (clean.startsWith('620')) {
      clean = '62' + clean.slice(3);
    }
    return clean;
  }

  /**
   * Format clean Markdown text for WhatsApp planning notifications
   */
  public formatWhatsAppPlanningMessage(
    plan: PlanningTask,
    techNama: string,
    companyName: string = 'DPT-AlaDin RT/RW Net',
    appUrl?: string
  ): string {
    const currentAppUrl = appUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    
    return [
      `🚨 *TUGAS PLANNING BARU* 🚨`,
      ``,
      `Halo *${techNama}*, Anda telah ditugaskan pada pekerjaan berikut:`,
      `📅 *Tanggal:* ${plan.tanggal || 'Hari ini'}`,
      `🏢 *Server:* ${plan.namaServer || '-'}`,
      `🛠️ *Jenis Pekerjaan:* ${plan.subPekerjaanNama || 'Pekerjaan Lapangan'}`,
      `📝 *Detail Pekerjaan:* ${plan.detailPekerjaan || '-'}`,
      plan.targetTeknisiNamas && plan.targetTeknisiNamas.length > 1
        ? `👥 *Tim Teknisi:* ${plan.targetTeknisiNamas.join(', ')}`
        : '',
      ``,
      `📱 *Buka Detail & Realisasi Tugas:*`,
      `${currentAppUrl}`,
      ``,
      `_Harap segera konfirmasi dan tindak lanjuti. Pesan otomatis dari ${companyName}._`
    ].filter(Boolean).join('\n');
  }

  /**
   * Create direct WhatsApp Web / App link (1-click send)
   */
  public getDirectWhatsAppUrl(phone: string, message: string): string {
    const cleanPhone = this.formatIndonesianPhoneNumber(phone);
    const encoded = encodeURIComponent(message);
    if (!cleanPhone) {
      return `https://api.whatsapp.com/send?text=${encoded}`;
    }
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
  }

  /**
   * Send WhatsApp message via Server Gateway (Fonnte / Wablas / Custom Webhook)
   */
  public async sendWhatsAppViaGateway(
    phone: string,
    message: string,
    settings: AppSettings
  ): Promise<{ success: boolean; message: string }> {
    const cleanPhone = this.formatIndonesianPhoneNumber(phone);
    if (!cleanPhone) {
      return { success: false, message: 'Nomor telepon teknisi tidak valid atau kosong.' };
    }

    try {
      // 1. Try server-side proxy endpoint first (avoids CORS issues with Fonnte/Wablas)
      const res = await fetch('/api/notify/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          message: message,
          provider: settings.waGatewayProvider || 'fonnte',
          apiToken: settings.waApiToken,
          apiUrl: settings.waApiUrl
        })
      });

      if (res.ok) {
        const json = await res.json();
        return {
          success: json.success,
          message: json.message || (json.success ? 'Pesan WhatsApp berhasil dikirim!' : 'Gagal mengirim pesan WhatsApp')
        };
      }
    } catch (err: any) {
      console.warn('Server proxy WhatsApp dispatch failed, attempting direct fetch fallback:', err);
    }

    // 2. Direct fallback to Fonnte API if token exists
    if (settings.waApiToken && settings.waApiToken.trim()) {
      try {
        const directRes = await fetch(settings.waApiUrl || 'https://api.fonnte.com/send', {
          method: 'POST',
          headers: {
            'Authorization': settings.waApiToken.trim(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            target: cleanPhone,
            message: message,
            countryCode: '62'
          })
        });
        const directJson = await directRes.json();
        if (directJson.status || directJson.status === true) {
          return { success: true, message: 'Pesan WhatsApp berhasil dikirim via Fonnte!' };
        }
      } catch (directErr: any) {
        console.warn('Direct Fonnte fetch error:', directErr);
      }
    }

    return {
      success: false,
      message: 'Gateway WhatsApp belum diatur atau token tidak valid. Gunakan tombol Buka WhatsApp.'
    };
  }

  /**
   * Main Dispatch: Notify all target technicians when a new Planning Task is created
   */
  public async notifyTechniciansForPlanning(
    plan: PlanningTask,
    allEmployees: Employee[],
    settings: AppSettings
  ): Promise<NotificationDeliveryResult[]> {
    const results: NotificationDeliveryResult[] = [];
    const targetIds = plan.targetTeknisiIds || [];
    const appName = settings.namaPerusahaan || 'DPT AlaDin';

    const targetEmps = allEmployees.filter(e => targetIds.includes(e.id));

    // Also broadcast to server push endpoint
    try {
      await fetch('/api/notify/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          targetIds,
          settings: {
            namaPerusahaan: appName,
            waApiToken: settings.waApiToken,
            waGatewayProvider: settings.waGatewayProvider
          }
        })
      }).catch(() => {});
    } catch {
      // ignore
    }

    // Trigger local system notification for current device
    const notifTitle = `🚨 Tugas Planning Baru: ${plan.subPekerjaanNama || 'Pekerjaan Lapangan'}`;
    const notifBody = `Server: ${plan.namaServer} | Teknisi: ${plan.targetTeknisiNamas.join(', ')}\n${plan.detailPekerjaan}`;
    
    if (settings.notifyViaBrowserPush !== false) {
      await this.sendSystemNotification(notifTitle, {
        body: notifBody,
        tag: `plan-${plan.id}`,
        data: { url: '/', planId: plan.id }
      });
    }

    // Process each target technician
    for (const emp of targetEmps) {
      const waMsg = this.formatWhatsAppPlanningMessage(plan, emp.namaLengkap, appName);
      const directUrl = this.getDirectWhatsAppUrl(emp.kontak, waMsg);
      let waSent = false;
      let errMsg: string | undefined;

      // If WhatsApp auto-send is enabled and token/gateway exists
      if (settings.notifyViaWhatsApp !== false && settings.waApiToken && emp.kontak) {
        const sendRes = await this.sendWhatsAppViaGateway(emp.kontak, waMsg, settings);
        waSent = sendRes.success;
        if (!waSent) errMsg = sendRes.message;
      }

      results.push({
        technicianId: emp.id,
        technicianNama: emp.namaLengkap,
        phone: emp.kontak,
        browserPushSent: true,
        whatsAppSent: waSent,
        whatsAppDirectUrl: directUrl,
        message: waMsg,
        error: errMsg
      });
    }

    return results;
  }
}

export const NotificationService = new NotificationServiceManager();
