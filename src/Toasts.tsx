import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, TOASTS_EVENT, type Toast } from "./api";
import appIcon from "../src-tauri/icons/32x32.png";

/** Tempo na tela sem interação; pausa com o mouse em cima ou durante a resposta. */
const VISIBLE_MS = 8000;
const CLOSE_AFTER_SENT_MS = 900;

type ReplyStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

interface CardState {
  replying: boolean;
  draft: string;
  status: ReplyStatus;
}

const IDLE: CardState = { replying: false, draft: "", status: { kind: "idle" } };

function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

function Avatar({ toast }: { toast: Toast }) {
  if (toast.avatar) {
    return <img src={toast.avatar} alt="" className="size-12 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-strong text-base font-semibold">
      {initials(toast.title) || "?"}
    </div>
  );
}

function Icon({ path, className = "size-4" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SEND_PATH = "M4 12 20 4l-4 16-4-7-8-1Z M12 13l8-9";
const CHECK_PATH = "m5 12.5 4.5 4.5L19 7.5";
const CLOSE_PATH = "M6 6l12 12M18 6 6 18";

interface CardProps {
  toast: Toast;
  state: CardState;
  onChange: (patch: Partial<CardState>) => void;
}

function ToastCard({ toast, state, onChange }: CardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = state.status.kind === "sending" || state.status.kind === "sent";

  useEffect(() => {
    if (state.replying) inputRef.current?.focus();
  }, [state.replying]);

  useEffect(() => {
    if (state.status.kind !== "sent") return;
    const timer = setTimeout(() => api.dismissToast(toast.id), CLOSE_AFTER_SENT_MS);
    return () => clearTimeout(timer);
  }, [state.status.kind, toast.id]);

  const stop = (e: MouseEvent) => e.stopPropagation();

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !state.draft.trim()) return;
    onChange({ status: { kind: "sending" } });
    try {
      await api.sendReply(toast.id, state.draft);
      onChange({ status: { kind: "sent" } });
    } catch (err) {
      onChange({ status: { kind: "error", message: String(err) } });
    }
  };

  return (
    <article
      onClick={() => !state.replying && api.openChat(toast.id)}
      className={[
        "toast-in rounded-xl border border-white/8 bg-[#2b2b2b] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.55)]",
        state.replying ? "" : "cursor-pointer hover:bg-[#303030]",
      ].join(" ")}
    >
      <header className="mb-2 flex items-center gap-2 text-xs text-text-secondary">
        <img src={appIcon} alt="" className="size-4" />
        <span>WhatsApp</span>
        <span aria-hidden>·</span>
        <span>{toast.test ? "teste" : "agora"}</span>
        <button
          type="button"
          aria-label="Dispensar"
          onClick={(e) => {
            stop(e);
            api.dismissToast(toast.id);
          }}
          className="ml-auto grid size-6 place-items-center rounded-md hover:bg-white/10 hover:text-text-primary"
        >
          <Icon path={CLOSE_PATH} className="size-3.5" />
        </button>
      </header>

      <div className="flex gap-3">
        <Avatar toast={toast} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{toast.title}</p>
          <p className="line-clamp-3 text-[13px] leading-snug break-words whitespace-pre-line text-[#d1d7db]">
            {toast.body || "Nova mensagem"}
          </p>
        </div>
      </div>

      {state.replying ? (
        <form onSubmit={send} onClick={stop} className="mt-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={state.draft}
              disabled={busy}
              maxLength={4096}
              placeholder="Digite uma resposta"
              onChange={(e) =>
                onChange({
                  draft: e.target.value,
                  ...(state.status.kind === "error" ? { status: { kind: "idle" } } : {}),
                })
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") onChange({ replying: false });
              }}
              className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-[#202020] px-4 text-[13px] text-text-primary outline-none select-text placeholder:text-text-secondary/70 focus:border-accent disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={busy || !state.draft.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[#111b21] transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {state.status.kind === "sending" ? (
                <span className="size-4 animate-spin rounded-full border-2 border-[#111b21]/30 border-t-[#111b21]" />
              ) : (
                <Icon path={state.status.kind === "sent" ? CHECK_PATH : SEND_PATH} />
              )}
            </button>
          </div>
          {state.status.kind === "error" && (
            <p role="alert" className="mt-1.5 px-1 text-xs text-danger">
              {state.status.message}
            </p>
          )}
          {state.status.kind === "sent" && <p className="mt-1.5 px-1 text-xs text-accent">Mensagem enviada</p>}
        </form>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2" onClick={stop}>
          <button
            type="button"
            onClick={() => onChange({ replying: true })}
            className="h-8 rounded-md bg-white/8 text-[13px] text-text-primary hover:bg-white/12"
          >
            Responder
          </button>
          <button
            type="button"
            onClick={() => api.openChat(toast.id)}
            className="h-8 rounded-md bg-white/8 text-[13px] text-text-primary hover:bg-white/12"
          >
            Abrir conversa
          </button>
        </div>
      )}
    </article>
  );
}

/** Pilha de cartões de notificação no canto da tela. */
export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [hovered, setHovered] = useState(false);
  const shownAt = useRef(new Map<number, number>());
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);

  useEffect(() => {
    api.toastItems().then(setToasts);
    const unlisten = listen<Toast[]>(TOASTS_EVENT, (event) => setToasts(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const ids = new Set(toasts.map((t) => t.id));
    for (const id of shownAt.current.keys()) if (!ids.has(id)) shownAt.current.delete(id);
    for (const toast of toasts) if (!shownAt.current.has(toast.id)) shownAt.current.set(toast.id, now);

    const chats = new Set(toasts.map((t) => t.chat));
    setCards((prev) => Object.fromEntries(Object.entries(prev).filter(([chat]) => chats.has(chat))));
  }, [toasts]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const toast of toasts) {
        const card = cards[toast.chat] ?? IDLE;
        const started = shownAt.current.get(toast.id) ?? now;
        if (hovered || card.replying || card.status.kind !== "idle") {
          shownAt.current.set(toast.id, now);
        } else if (now - started > VISIBLE_MS) {
          api.dismissToast(toast.id);
        }
      }
    }, 500);
    return () => clearInterval(timer);
  }, [toasts, cards, hovered]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0 && height !== lastHeight.current) {
        lastHeight.current = height;
        api.resizeToast(height);
      }
    };
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, []);

  const update = (chat: string, patch: Partial<CardState>) =>
    setCards((prev) => ({ ...prev, [chat]: { ...(prev[chat] ?? IDLE), ...patch } }));

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex flex-col gap-2 p-2"
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.chat}
          toast={toast}
          state={cards[toast.chat] ?? IDLE}
          onChange={(patch) => update(toast.chat, patch)}
        />
      ))}
    </div>
  );
}
