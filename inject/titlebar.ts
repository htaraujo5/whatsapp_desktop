import { invoke } from "./bridge";
import appIcon from "../src-tauri/icons/32x32.png";

const BAR_ID = "wa-native-titlebar";
const FRAME_ID = "wa-native-frame";
const FRAMELESS_CLASS = "wa-native-frameless";
const MAXIMIZED_CLASS = "wa-native-maximized";
const COLOR_REFRESH_MS = 1500;
const FALLBACK_COLOR = "rgb(32, 32, 32)";
const TITLEBAR_HEIGHT = 32;
const SAMPLE_STEP = 8;

const ICONS = {
  minimize: '<path d="M2 6h8" />',
  maximize: '<rect x="2" y="2" width="8" height="8" rx="1" />',
  restore: '<rect x="2" y="4" width="6" height="6" rx="1" /><path d="M4 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8" />',
  close: '<path d="m2.5 2.5 7 7m0-7-7 7" />',
};

type Action = "minimize" | "maximize" | "close";

const window_ = (command: string) => invoke(`plugin:window|${command}`, { label: "main" });

function svg(paths: string): string {
  return `<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${paths}</svg>`;
}

function build(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.innerHTML = `
    <div class="wa-tb-title"><img src="${appIcon}" alt="" /><span>WhatsApp</span></div>
    <div class="wa-tb-controls">
      <button type="button" data-action="minimize" aria-label="Minimizar">${svg(ICONS.minimize)}</button>
      <button type="button" data-action="maximize" aria-label="Maximizar">${svg(ICONS.maximize)}</button>
      <button type="button" data-action="close" aria-label="Fechar" class="wa-tb-close">${svg(ICONS.close)}</button>
    </div>`;

  bar.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    event.preventDefault();
    window_(event.detail === 2 ? "toggle_maximize" : "start_dragging").catch(() => undefined);
  });

  bar.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLElement>("button")?.dataset.action as
      | Action
      | undefined;
    if (!action) return;
    const command = { minimize: "minimize", maximize: "toggle_maximize", close: "close" }[action];
    window_(command).catch(() => undefined);
  });
  return bar;
}

async function syncMaximized(bar: HTMLElement): Promise<void> {
  const maximized = (await window_("is_maximized").catch(() => false)) === true;
  document.documentElement.classList.toggle(MAXIMIZED_CLASS, maximized);
  const button = bar.querySelector<HTMLElement>('[data-action="maximize"]');
  if (button) {
    button.innerHTML = svg(maximized ? ICONS.restore : ICONS.maximize);
    button.setAttribute("aria-label", maximized ? "Restaurar" : "Maximizar");
  }
}

function isOpaque(color: string): boolean {
  return color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color);
}

/** Cor de fundo efetiva logo abaixo da barra, na coluna `x`. */
function colorBelow(x: number): string {
  const probe = document.elementFromPoint(x, TITLEBAR_HEIGHT + 2);
  for (let el: Element | null = probe; el && el !== document.documentElement; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (isOpaque(color)) return color;
  }
  return FALLBACK_COLOR;
}

interface Segment {
  color: string;
  start: number;
}

/** Faixas de cor das colunas (barra lateral, lista, conversa), com bordas exatas. */
export function columnSegments(width: number, sample: (x: number) => string, step = SAMPLE_STEP): Segment[] {
  const segments: Segment[] = [{ color: sample(0), start: 0 }];
  let previousX = 0;
  for (let x = step; x < width + step; x += step) {
    const at = Math.min(x, width - 1);
    const color = sample(at);
    const last = segments[segments.length - 1]!;
    if (color !== last.color) {
      let low = previousX;
      let high = at;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sample(mid) === last.color) low = mid;
        else high = mid;
      }
      segments.push({ color, start: high });
    }
    previousX = at;
    if (at === width - 1) break;
  }
  return segments;
}

/** Gradiente com paradas duras e uma linha divisória entre colunas, como no app do Windows. */
export function segmentsToBackground(segments: Segment[], divider: string): string {
  const stops = segments.flatMap((segment, i) => {
    const end = segments[i + 1]?.start;
    const from = i === 0 ? `${segment.color} 0px` : `${divider} ${segment.start}px, ${divider} ${segment.start + 1}px, ${segment.color} ${segment.start + 1}px`;
    return end === undefined ? [from, `${segment.color} 100%`] : [from, `${segment.color} ${end}px`];
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function isLight(color: string): boolean {
  const [r = 0, g = 0, b = 0] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

function syncColors(): void {
  const segments = columnSegments(window.innerWidth, colorBelow);
  const divider =
    getComputedStyle(document.body).getPropertyValue("--WDS-lines-divider").trim() || "rgba(255, 255, 255, 0.1)";
  const root = document.documentElement.style;
  root.setProperty("--wa-titlebar-bg", segmentsToBackground(segments, divider));
  root.setProperty("--wa-titlebar-fg", isLight(segments[0]!.color) ? "#1b1b1b" : "#e9edef");
}

/**
 * Barra de título desenhada dentro da página, na cor da barra lateral do
 * WhatsApp, no lugar da barra do sistema (a janela é criada sem decorações).
 */
export function installTitlebar(): void {
  if (!window.__TAURI_INTERNALS__) return;

  const mount = () => {
    if (!document.body) return;
    document.documentElement.classList.add(FRAMELESS_CLASS);
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = build();
      document.body.append(bar);
      syncMaximized(bar);
    }
    if (!document.getElementById(FRAME_ID)) {
      const frame = document.createElement("div");
      frame.id = FRAME_ID;
      document.body.append(frame);
    }
    syncColors();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
  setInterval(mount, COLOR_REFRESH_MS);
  window.addEventListener("resize", () => {
    const bar = document.getElementById(BAR_ID);
    if (bar) syncMaximized(bar);
    syncColors();
  });
  // Abrir/fechar conversas e painéis muda as colunas.
  document.addEventListener("click", () => setTimeout(syncColors, 150), true);
}
