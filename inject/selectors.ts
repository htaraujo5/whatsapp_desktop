/**
 * Seletores do DOM do WhatsApp Web usados pelos overrides. Evite classes
 * ofuscadas (ex.: `._209_f`): elas mudam a cada deploy. Prefira ids, `role`,
 * `aria-*` e classes semânticas antigas. Mantenha em sincronia com
 * `styles/whatsapp-override.css`.
 */
export const SELECTORS = {
  app: "#app",
  appWrapper: ".app-wrapper-web",
  sidePanel: "#side",
  chatList: "#pane-side",
  chatListItem: '#pane-side [role="listitem"]',
  chatListRow: '#pane-side [role="row"]',
  chatListSelected: '#pane-side [aria-selected="true"]',
  conversation: "#main",
  conversationHeader: "#main header",
  composer: '#main footer [contenteditable="true"]',
  incomingMessage: ".message-in",
  outgoingMessage: ".message-out",
  dropdownMenu: '[role="application"]',
  dialog: '[role="dialog"]',
} as const;

export type SelectorName = keyof typeof SELECTORS;

/** Conta quantos elementos cada seletor encontra. Use no DevTools: `__waNative.diagnose()`. */
export function diagnose(root: ParentNode = document): Record<SelectorName, number> {
  const result = {} as Record<SelectorName, number>;
  for (const [name, selector] of Object.entries(SELECTORS) as [SelectorName, string][]) {
    result[name] = root.querySelectorAll(selector).length;
  }
  return result;
}
