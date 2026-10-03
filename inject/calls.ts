import { invoke } from "./bridge";

const CALL_LABEL =
  /^(chamada de (voz|vídeo)|ligação de (voz|vídeo)|ligar|videochamada|nova (chamada|ligação)|voice call|video call|start call|new call|call|llamada( de (voz|video|vídeo))?|videollamada)$/i;
const CALL_ICON = /(^|-)(voice-call|video-call|audio-call|call|phone|videocam)(-|$)/;
const TOAST_ID = "wa-native-call-toast";
const TOAST_MS = 5000;

function controlOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('button, [role="button"], [role="menuitem"], li[tabindex]');
}

/** Botões e itens de menu que iniciam chamadas de voz ou vídeo. */
export function isCallControl(el: Element): boolean {
  const label = (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "").trim();
  if (CALL_LABEL.test(label)) return true;
  if (el.closest("#main header")) {
    const icon = el.querySelector("[data-icon]")?.getAttribute("data-icon") ?? "";
    return CALL_ICON.test(icon);
  }
  return el.getAttribute("role") === "menuitem" && CALL_LABEL.test((el.textContent ?? "").trim());
}

function showToast(): void {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.setAttribute("role", "status");
  toast.textContent =
    "Chamadas de voz e vídeo abrem no navegador. Na primeira vez, conecte o WhatsApp Web lá pelo QR code.";
  Object.assign(toast.style, {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    maxWidth: "420px",
    padding: "12px 16px",
    borderRadius: "8px",
    background: "#2b2b2b",
    border: "1px solid #333333",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
    color: "#ffffff",
    font: '13px/1.4 "Segoe UI", Cantarell, Ubuntu, sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

function onClick(event: MouseEvent): void {
  const control = controlOf(event.target);
  if (!control || !isCallControl(control)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showToast();
  invoke("open_in_browser").catch(() => undefined);
}

/** O WebKitGTK do sistema não tem WebRTC; as chamadas seguem para o navegador padrão. */
export function installCallRedirect(doc: Document = document): void {
  doc.addEventListener("click", onClick, true);
}
