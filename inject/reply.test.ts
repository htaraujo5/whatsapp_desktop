import { describe, expect, it } from "vitest";
import { chatNameCandidates, headerMatches } from "./reply";

describe("conferência da conversa antes de responder", () => {
  it("aceita o cabeçalho com o nome do contato", () => {
    expect(headerMatches("Maria Silva online", "Maria Silva")).toBe(true);
    expect(headerMatches("  maria   SILVA ", "Maria Silva")).toBe(true);
  });

  it("recusa outra conversa", () => {
    expect(headerMatches("João", "Maria Silva")).toBe(false);
    expect(headerMatches("Qualquer", "")).toBe(false);
  });

  it("aceita o nome do grupo em títulos 'Remetente @ Grupo'", () => {
    expect(chatNameCandidates("Ana @ Família")).toEqual(["ana @ família", "família"]);
    expect(headerMatches("Família Ana, Bia, Você", "Ana @ Família")).toBe(true);
  });
});
