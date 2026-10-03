import { describe, expect, it } from "vitest";
import { columnSegments, segmentsToBackground } from "./titlebar";

const columns = (x: number) => (x < 63 ? "rail" : x < 470 ? "list" : "chat");

describe("barra de título nas cores das colunas", () => {
  it("encontra o início exato de cada coluna", () => {
    expect(columnSegments(1024, columns)).toEqual([
      { color: "rail", start: 0 },
      { color: "list", start: 63 },
      { color: "chat", start: 470 },
    ]);
  });

  it("uma cor só quando não há colunas", () => {
    expect(columnSegments(500, () => "x")).toEqual([{ color: "x", start: 0 }]);
  });

  it("monta o gradiente com a linha divisória entre cores", () => {
    const background = segmentsToBackground(
      [
        { color: "a", start: 0 },
        { color: "b", start: 100 },
      ],
      "line",
    );
    expect(background).toBe(
      "linear-gradient(to right, a 0px, a 100px, line 100px, line 101px, b 101px, b 100%)",
    );
  });
});
