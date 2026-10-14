/**
 * Global Modern Dialog & Popup Service
 * Replaces native browser alert() and confirm() with sleek, modern in-app dialogs.
 */

export type DialogType = 'info' | 'warning' | 'error' | 'success';

export interface DialogOptions {
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  isConfirm?: boolean;
}

type DialogListener = (dialog: (DialogOptions & { id: number; resolve: (val: boolean) => void }) | null) => void;

let activeListener: DialogListener | null = null;
let dialogCounter = 0;

export const DialogService = {
  subscribe(listener: DialogListener) {
    activeListener = listener;
    return () => {
      if (activeListener === listener) {
        activeListener = null;
      }
    };
  },

  alert(messageOrOptions: string | DialogOptions | any): Promise<void> {
    let options: DialogOptions;
    if (typeof messageOrOptions === 'string') {
      options = { message: messageOrOptions, type: 'info' };
    } else if (messageOrOptions instanceof Error) {
      options = { message: messageOrOptions.message || String(messageOrOptions), type: 'error' };
    } else if (messageOrOptions && typeof messageOrOptions === 'object') {
      const msg = messageOrOptions.message;
      const strMsg = typeof msg === 'string'
        ? msg
        : (msg instanceof Error ? msg.message : (msg != null ? String(msg) : ''));
      options = {
        ...messageOrOptions,
        message: strMsg,
        type: messageOrOptions.type || 'info'
      };
    } else {
      options = { message: String(messageOrOptions ?? ''), type: 'info' };
    }

    // Set intelligent default title based on type if omitted
    if (!options.title) {
      if (options.type === 'error') options.title = 'Terjadi Kesalahan';
      else if (options.type === 'warning') options.title = 'Perhatian';
      else if (options.type === 'success') options.title = 'Berhasil';
      else options.title = 'Informasi';
    }

    return new Promise<void>((resolve) => {
      if (!activeListener) {
        console.warn('DialogService: No listener mounted, fallback resolution', options.message);
        resolve();
        return;
      }

      dialogCounter += 1;
      activeListener({
        ...options,
        id: dialogCounter,
        isConfirm: false,
        confirmText: options.confirmText || 'Oke, Mengerti',
        resolve: () => resolve()
      });
    });
  },

  confirm(messageOrOptions: string | DialogOptions | any): Promise<boolean> {
    let options: DialogOptions;
    if (typeof messageOrOptions === 'string') {
      options = { message: messageOrOptions, type: 'warning' };
    } else if (messageOrOptions instanceof Error) {
      options = { message: messageOrOptions.message || String(messageOrOptions), type: 'warning' };
    } else if (messageOrOptions && typeof messageOrOptions === 'object') {
      const msg = messageOrOptions.message;
      const strMsg = typeof msg === 'string'
        ? msg
        : (msg instanceof Error ? msg.message : (msg != null ? String(msg) : ''));
      options = {
        ...messageOrOptions,
        message: strMsg,
        type: messageOrOptions.type || 'warning'
      };
    } else {
      options = { message: String(messageOrOptions ?? ''), type: 'warning' };
    }

    if (!options.title) {
      options.title = 'Konfirmasi Tindakan';
    }

    return new Promise<boolean>((resolve) => {
      if (!activeListener) {
        console.warn('DialogService: No listener mounted for confirm', options.message);
        resolve(false);
        return;
      }

      dialogCounter += 1;
      activeListener({
        ...options,
        id: dialogCounter,
        isConfirm: true,
        confirmText: options.confirmText || 'Ya, Lanjutkan',
        cancelText: options.cancelText || 'Batal',
        resolve: (val: boolean) => resolve(val)
      });
    });
  }
};

// Convenient global helper functions
export const showAppAlert = (messageOrOptions: string | DialogOptions) => DialogService.alert(messageOrOptions);
export const showAppConfirm = (messageOrOptions: string | DialogOptions) => DialogService.confirm(messageOrOptions);
