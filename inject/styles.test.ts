import { describe, expect, it } from "vitest";
import { STYLE_ID, installStyles } from "./styles";
import { diagnose } from "./selectors";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("installStyles", () => {
  it("mantém o override como último estilo do head", async () => {
    const observer = installStyles("body { color: red }");
    expect(document.head.lastElementChild?.id).toBe(STYLE_ID);

    const late = document.createElement("style");
    document.head.appendChild(late);
    await nextTick();

    expect(document.head.lastElementChild?.id).toBe(STYLE_ID);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    observer.disconnect();
  });
});

describe("diagnose", () => {
  it("conta elementos por seletor", () => {
    document.body.innerHTML = `
      <div id="app"><div id="side"><div id="pane-side">
        <div role="listitem" aria-selected="true"></div><div role="listitem"></div>
      </div></div></div>`;
    const result = diagnose();
    expect(result.app).toBe(1);
    expect(result.chatListItem).toBe(2);
    expect(result.chatListSelected).toBe(1);
    expect(result.conversation).toBe(0);
  });
});
