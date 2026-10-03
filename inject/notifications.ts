import { invoke } from "./bridge";

type Listener = ((this: Notification, ev: Event) => unknown) | null;

/** Notificações recentes, mesmo as já fechadas: a resposta rápida ainda precisa delas. */
const recent = new Map<number, NativeNotification>();
const MAX_RECENT = 50;
const ICON_TIMEOUT_MS = 1500;
const MAX_ICON_BYTES = 512 * 1024;
let nextId = 1;

function remember(notification: NativeNotification): void {
  recent.set(notification.id, notification);
  while (recent.size > MAX_RECENT) {
    const oldest = recent.keys().next().value as number;
    recent.delete(oldest);
  }
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Converte o avatar do contato em `data:` para o Rust gravar e usar na notificação. */
async function iconAsDataUrl(icon: string): Promise<string | null> {
  if (!icon) return null;
  if (icon.startsWith("data:image/")) return icon;
  if (!/^(blob:|https:)/.test(icon)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_TIMEOUT_MS);
  try {
    const response = await fetch(icon, { credentials: "omit", signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_ICON_BYTES) return null;
    return await readAsDataUrl(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Substituto de `window.Notification`: o WhatsApp continua usando a API web
 * normalmente e as notificações saem pelo servidor de notificações do Linux.
 */
export class NativeNotification extends EventTarget {
  static get permission(): NotificationPermission {
    return "granted";
  }

  static requestPermission(
    callback?: (permission: NotificationPermission) => void,
  ): Promise<NotificationPermission> {
    callback?.("granted");
    return Promise.resolve("granted");
  }

  static readonly maxActions = 0;

  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly icon: string;
  readonly data: unknown;
  readonly silent: boolean | null;
  readonly dir: NotificationDirection;
  readonly lang: string;

  onclick: Listener = null;
  onclose: Listener = null;
  onerror: Listener = null;
  onshow: Listener = null;

  private closed = false;

  constructor(title: string, options: NotificationOptions = {}) {
    super();
    this.id = nextId++;
    this.title = String(title ?? "");
    this.body = options.body ?? "";
    this.tag = options.tag ?? "";
    this.icon = options.icon ?? "";
    this.data = options.data ?? null;
    this.silent = options.silent ?? null;
    this.dir = options.dir ?? "auto";
    this.lang = options.lang ?? "";

    remember(this);
    iconAsDataUrl(this.icon)
      .then((icon) =>
        invoke("notify", {
          id: this.id,
          title: this.title,
          body: this.body,
          tag: this.tag,
          silent: this.silent === true,
          icon,
        }),
      )
      .then(() => this.fire("show"))
      .catch(() => {
        this.closed = true;
        this.fire("error");
      });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.fire("close");
  }

  /**
   * Disparado pelo Rust quando o usuário clica na notificação nativa. Vale
   * também para notificações já fechadas pelo WhatsApp que continuam na
   * central de notificações do sistema.
   */
  click(): void {
    this.activate();
    this.close();
  }

  /** Executa o `onclick` do WhatsApp (abre a conversa), mesmo após o fechamento. */
  activate(): void {
    this.fire("click");
  }

  private fire(type: "click" | "close" | "error" | "show"): void {
    const event = new Event(type, { cancelable: type === "click" });
    const handler = this[`on${type}`];
    if (typeof handler === "function") {
      handler.call(this as unknown as Notification, event);
    }
    this.dispatchEvent(event);
  }
}

export function getNotification(id: number): NativeNotification | undefined {
  return recent.get(id);
}

export function notificationClicked(id: number): void {
  recent.get(id)?.click();
}

export function installNotificationShim(win: Window = window): void {
  Object.defineProperty(win, "Notification", {
    value: NativeNotification,
    writable: true,
    configurable: true,
  });

  // Algumas versões do WhatsApp mostram notificações pelo service worker.
  const registration = (win as Window & typeof globalThis).ServiceWorkerRegistration;
  if (registration?.prototype) {
    registration.prototype.showNotification = function (
      title: string,
      options?: NotificationOptions,
    ) {
      new NativeNotification(title, options);
      return Promise.resolve();
    };
  }
}

export function _resetForTests(): void {
  recent.clear();
  nextId = 1;
}
