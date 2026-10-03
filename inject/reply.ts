import { getNotification } from "./notifications";

const OPEN_CHAT_TIMEOUT_MS = 8000;
const SEND_TIMEOUT_MS = 4000;

const COMPOSER = '#main footer [contenteditable="true"]';
const SEND_BUTTON_LABELS = /^(enviar|send|enviar mensagem|send message)$/i;
const SEND_ICON = /(^|-)send(-|$)/;

export class ReplyError extends Error {}

function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/**
 * Nomes aceitos no cabeçalho da conversa. Em grupos o WhatsApp pode usar
 * "Remetente @ Grupo" como título da notificação.
 */
export function chatNameCandidates(title: string): string[] {
  const names = [title];
  const group = title.split(/\s+@\s+/);
  if (group.length === 2) names.push(group[1]);
  return names.map(normalize).filter((name) => name.length > 0);
}

export function headerMatches(headerText: string, title: string): boolean {
  const header = normalize(headerText);
  return chatNameCandidates(title).some((name) => header.includes(name));
}

function waitFor<T>(probe: () => T | null, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const value = probe();
      if (value) return resolve(value);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

function findSendButton(): HTMLElement | null {
  const footer = document.querySelector("#main footer");
  if (!footer) return null;
  for (const el of footer.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
    if (SEND_BUTTON_LABELS.test(label.trim())) return el;
    const icon = el.querySelector("[data-icon]")?.getAttribute("data-icon") ?? "";
    if (SEND_ICON.test(icon)) return el;
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function placeCaretAtEnd(composer: HTMLElement): void {
  composer.focus();
  const selection = window.getSelection();
  if (!selection) return;
  selection.selectAllChildren(composer);
  selection.collapseToEnd();
}

function paste(composer: HTMLElement, text: string): void {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  composer.dispatchEvent(
    new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
  );
}

function typeWithInputEvents(composer: HTMLElement, text: string): void {
  const init = { inputType: "insertText", data: text, bubbles: true, cancelable: true };
  composer.dispatchEvent(new InputEvent("beforeinput", init));
  composer.dispatchEvent(new InputEvent("input", init));
}

/**
 * O editor do WhatsApp (Lexical) só aceita texto com uma seleção ativa, que ele
 * sincroniza no `selectionchange` (assíncrono); com a janela escondida alguns
 * caminhos falham, então cada estratégia é tentada e conferida.
 */
async function insertText(composer: HTMLElement, text: string): Promise<string | null> {
  const probe = text.slice(0, 20);
  const strategies: [string, () => void][] = [
    ["paste", () => paste(composer, text)],
    ["execCommand", () => document.execCommand("insertText", false, text)],
    ["input", () => typeWithInputEvents(composer, text)],
  ];
  for (const [name, run] of strategies) {
    placeCaretAtEnd(composer);
    await sleep(80);
    run();
    await sleep(150);
    if ((composer.textContent ?? "").includes(probe)) return name;
  }
  return null;
}

function pressEnter(composer: HTMLElement): void {
  const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
  composer.dispatchEvent(new KeyboardEvent("keydown", init));
  composer.dispatchEvent(new KeyboardEvent("keyup", init));
}

/**
 * Responde a uma notificação sem mostrar a janela: abre a conversa pelo
 * `onclick` do próprio WhatsApp, confere o cabeçalho e envia o texto.
 */
export async function replyToNotification(id: number, text: string): Promise<void> {
  const message = text.trim();
  if (!message) throw new ReplyError("A mensagem está vazia.");

  const notification = getNotification(id);
  if (!notification || !notification.title) {
    throw new ReplyError("Esta notificação expirou. Abra a conversa para responder.");
  }

  notification.activate();

  const composer = await waitFor(() => {
    const header = document.querySelector("#main header");
    if (!header || !headerMatches(header.textContent ?? "", notification.title)) return null;
    return document.querySelector<HTMLElement>(COMPOSER);
  }, OPEN_CHAT_TIMEOUT_MS);
  if (!composer) {
    throw new ReplyError("Não foi possível abrir a conversa de " + notification.title + ".");
  }

  const strategy = await insertText(composer, message);
  if (!strategy) {
    throw new ReplyError("Não foi possível escrever na conversa.");
  }
  console.info(`[wa-native] resposta escrita via ${strategy}`);

  await sleep(100);
  const button = findSendButton();
  if (button) button.click();
  else pressEnter(composer);

  const sent = await waitFor(
    () => !(composer.textContent ?? "").includes(message.slice(0, 20)) || null,
    SEND_TIMEOUT_MS,
  );
  if (!sent) {
    throw new ReplyError("A mensagem ficou no campo de texto da conversa.");
  }
}
