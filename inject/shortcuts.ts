import { invoke } from "./bridge";

export function installShortcuts(win: Window = window): void {
  win.addEventListener(
    "keydown",
    (event) => {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === ",") {
        event.preventDefault();
        event.stopPropagation();
        invoke("open_settings").catch(() => {});
      }
    },
    true,
  );
}
