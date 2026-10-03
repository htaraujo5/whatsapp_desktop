import { invoke } from "@tauri-apps/api/core";

export interface Settings {
  closeToTray: boolean;
  startMinimized: boolean;
  autostart: boolean;
  notificationsEnabled: boolean;
  notifyWhenFocused: boolean;
  showMessagePreview: boolean;
  inAppNotifications: boolean;
  userAgent: string;
  spellcheckLanguages: string[];
}

export interface AppInfo {
  name: string;
  version: string;
  tauri: string;
}

export interface Toast {
  id: number;
  /** Conversa: o WhatsApp mantém um cartão por conversa. */
  chat: string;
  title: string;
  body: string;
  avatar: string | null;
  test: boolean;
}

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  appInfo: () => invoke<AppInfo>("app_info"),
  testNotification: () => invoke<void>("test_notification"),
  toastItems: () => invoke<Toast[]>("toast_items"),
  dismissToast: (id: number) => invoke<void>("dismiss_toast", { id }),
  resizeToast: (height: number) => invoke<void>("resize_toast", { height }),
  sendReply: (id: number, text: string) => invoke<void>("send_reply", { id, text }),
  openChat: (id: number) => invoke<void>("open_chat", { id }),
};

export const TOASTS_EVENT = "toasts";
