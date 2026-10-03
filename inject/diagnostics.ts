import { NativeNotification } from "./notifications";
import { diagnose } from "./selectors";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

async function testPeerConnection() {
  if (typeof RTCPeerConnection !== "function") return { available: false };

  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  try {
    const candidateTypes = new Set<string>();
    const gathered = new Promise<void>((resolve) => {
      pc.onicecandidate = (event) => {
        if (!event.candidate) return resolve();
        candidateTypes.add(event.candidate.type ?? event.candidate.candidate.split(" ")[7] ?? "?");
      };
    });
    pc.createDataChannel("diagnostico");
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await Promise.race([gathered, sleep(5000)]);
    const sdp = offer.sdp ?? "";
    return {
      available: true,
      offer: true,
      audioCodecs: [...new Set([...sdp.matchAll(/a=rtpmap:\d+ ([\w-]+)\/\d+\/\d/g)].map((m) => m[1]))],
      videoCodecs: [...new Set([...sdp.matchAll(/a=rtpmap:\d+ ([\w-]+)\/90000/g)].map((m) => m[1]))],
      iceGatheringState: pc.iceGatheringState,
      candidateTypes: [...candidateTypes],
    };
  } catch (err) {
    return { available: true, error: errorText(err) };
  } finally {
    pc.close();
  }
}

async function testMedia(constraints: MediaStreamConstraints): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia) return "getUserMedia indisponível";
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const tracks = stream.getTracks().map((t) => `${t.kind}: ${t.label || "sem nome"}`);
    stream.getTracks().forEach((t) => t.stop());
    return `ok (${tracks.join(", ")})`;
  } catch (err) {
    return `erro (${errorText(err)})`;
  }
}

async function listDevices(): Promise<Record<string, number> | string> {
  if (!navigator.mediaDevices?.enumerateDevices) return "enumerateDevices indisponível";
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.kind] = (acc[d.kind] ?? 0) + 1;
    return acc;
  }, {});
}

const COLOR_VALUE = /^\s*(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i;

function walkRules(rules: CSSRuleList, visit: (rule: CSSStyleRule) => void): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) visit(rule);
    else if ("cssRules" in rule) walkRules((rule as CSSGroupingRule).cssRules, visit);
  }
}

function opaqueAncestor(el: Element | null): Element | null {
  for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return node;
  }
  return null;
}

/**
 * Levanta as variáveis de cor do tema do WhatsApp e quais delas pintam cada
 * área da tela (barra lateral, lista, cabeçalhos), para o CSS de override.
 */
async function probeTheme(): Promise<Record<string, unknown>> {
  for (let i = 0; i < 50 && !document.querySelector("#pane-side"); i++) await sleep(500);

  const backgroundsByClass = new Map<string, string[]>();
  const sheets: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      sheets.push(`bloqueada: ${sheet.href}`);
      continue;
    }
    sheets.push(`${sheet.href ?? "inline"} (${rules.length})`);
    walkRules(rules, (rule) => {
      const style = rule.style;
      const background = style.getPropertyValue("background-color") || style.getPropertyValue("background");
      if (background.includes("var(")) {
        for (const cls of rule.selectorText.match(/\.[\w-]+/g) ?? []) {
          const list = backgroundsByClass.get(cls) ?? [];
          list.push(`${rule.selectorText} { background: ${background.trim()} }`);
          backgroundsByClass.set(cls, list);
        }
      }
    });
  }

  const offset = document.getElementById("wa-native-titlebar") ? 32 : 0;
  const points: Record<string, [number, number]> = {
    rail: [8, Math.round(window.innerHeight / 2)],
    railTop: [30, offset + 20],
    sideHeader: [200, offset + 30],
    sideSearch: [200, offset + 95],
    chatList: [200, Math.round(window.innerHeight / 2)],
    mainHeader: [window.innerWidth - 300, offset + 30],
    mainBody: [window.innerWidth - 300, Math.round(window.innerHeight / 2)],
    composer: [window.innerWidth - 300, window.innerHeight - 30],
  };
  const areas: Record<string, unknown> = {};
  for (const [name, [x, y]] of Object.entries(points)) {
    const el = opaqueAncestor(document.elementFromPoint(x, y));
    if (!el) {
      areas[name] = null;
      continue;
    }
    const classes = Array.from(el.classList);
    areas[name] = {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      role: el.getAttribute("role") ?? undefined,
      background: getComputedStyle(el).backgroundColor,
      classes: classes.join(" "),
      rules: classes.flatMap((cls) => backgroundsByClass.get(`.${cls}`) ?? []).slice(0, 6),
    };
  }

  const wdsNames = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walkRules(sheet.cssRules, (rule) => {
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i]!;
          if (name.startsWith("--WDS-")) wdsNames.add(name);
        }
      });
    } catch {
      // Folha de outra origem sem CORS.
    }
  }
  const resolved = getComputedStyle(document.body);
  const wds: Record<string, string> = {};
  for (const name of [...wdsNames].sort()) {
    const value = resolved.getPropertyValue(name).trim();
    if (COLOR_VALUE.test(value)) wds[name] = value;
  }

  return {
    htmlClass: document.documentElement.className,
    bodyClass: document.body?.className,
    sheets,
    areas,
    wds,
  };
}

/** Roda testes de chamadas, mídia, IPC e notificações. Resultado em `__waNative.lastDiagnostics`. */
export async function runDiagnostics(): Promise<Record<string, unknown>> {
  const sender = typeof RTCRtpSender === "function" ? RTCRtpSender.prototype : undefined;
  const report: Record<string, unknown> = {
    theme: await probeTheme(),
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    platform: navigator.platform,
    userAgentData: "userAgentData" in navigator,
    secureContext: window.isSecureContext,
    tauriIpc: Boolean(window.__TAURI_INTERNALS__),
    notificationShim: window.Notification === (NativeNotification as unknown),
    notificationPermission: window.Notification?.permission,
    webrtc: {
      peerConnection: await testPeerConnection(),
      rtcRtpScriptTransform: typeof (window as { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform,
      createEncodedStreams: typeof (sender as { createEncodedStreams?: unknown } | undefined)?.createEncodedStreams,
      getDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia,
    },
    audioContext: typeof AudioContext,
    mediaRecorder: typeof MediaRecorder,
    devicesBeforePermission: await listDevices(),
    microphone: await testMedia({ audio: true }),
    camera: await testMedia({ video: true }),
    devicesAfterPermission: await listDevices(),
    selectors: diagnose(),
  };
  if (window.__waNative) window.__waNative.lastDiagnostics = report;
  return report;
}
