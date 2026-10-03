export const STYLE_ID = "wa-native-override";

/**
 * Insere o CSS e o mantém como último `<style>` do `<head>`, para vencer na
 * cascata mesmo quando o WhatsApp adiciona folhas de estilo depois.
 */
export function installStyles(css: string, doc: Document = document): MutationObserver {
  const ensure = () => {
    const parent = doc.head ?? doc.documentElement;
    if (!parent) return;

    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css;
    }
    if (style.parentNode !== parent || parent.lastElementChild !== style) {
      parent.appendChild(style);
    }
  };

  const observer = new MutationObserver(ensure);
  ensure();
  if (doc.documentElement) observer.observe(doc.documentElement, { childList: true });
  if (doc.head) observer.observe(doc.head, { childList: true });

  doc.addEventListener(
    "DOMContentLoaded",
    () => {
      ensure();
      if (doc.head) observer.observe(doc.head, { childList: true });
    },
    { once: true },
  );
  return observer;
}
