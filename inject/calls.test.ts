import { describe, expect, it } from "vitest";
import { isCallControl } from "./calls";

function html(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.querySelector<HTMLElement>("[data-target]")!;
}

describe("detecção dos botões de chamada", () => {
  it("reconhece os rótulos de chamada", () => {
    expect(isCallControl(html('<button data-target aria-label="Chamada de vídeo"></button>'))).toBe(true);
    expect(isCallControl(html('<button data-target aria-label="Voice call"></button>'))).toBe(true);
  });

  it("reconhece o ícone de chamada só no cabeçalho da conversa", () => {
    const inHeader = '<div id="main"><header><button data-target><span data-icon="video-call"></span></button></header></div>';
    const elsewhere = '<div id="side"><button data-target><span data-icon="video-call"></span></button></div>';
    expect(isCallControl(html(inHeader))).toBe(true);
    expect(isCallControl(html(elsewhere))).toBe(false);
  });

  it("ignora outros botões", () => {
    expect(isCallControl(html('<button data-target aria-label="Pesquisar"></button>'))).toBe(false);
    expect(isCallControl(html('<button data-target aria-label="Anexar"><span data-icon="plus"></span></button>'))).toBe(false);
  });
});
