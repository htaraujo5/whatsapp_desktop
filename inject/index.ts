import css from "./styles/whatsapp-override.css?inline";
import { invoke } from "./bridge";
import { installCallRedirect } from "./calls";
import { runDiagnostics } from "./diagnostics";
import { installNavigatorSpoof } from "./navigator";
import { installNotificationShim, notificationClicked } from "./notifications";
import { replyToNotification } from "./reply";
import { diagnose } from "./selectors";
import { installShortcuts } from "./shortcuts";
import { installStyles } from "./styles";
import { installTitlebar } from "./titlebar";

export interface WaNativeApi {
  notificationClicked: (id: number) => void;
  reply: (id: number, text: string) => void;
  diagnose: typeof diagnose;
  runDiagnostics: typeof runDiagnostics;
  lastDiagnostics?: Record<string, unknown>;
}

/** Chamado pelo Rust; o resultado volta por `reply_result`. */
function reply(id: number, text: string): void {
  replyToNotification(id, text).then(
    () => invoke("reply_result", { id, error: null }),
    (err: unknown) =>
      invoke("reply_result", {
        id,
        error: err instanceof Error ? err.message : String(err),
      }),
  ).catch(() => undefined);
}

function main(): void {
  if (window.top !== window) return;
  if (location.hostname !== "web.whatsapp.com") return;
  if (window.__waNative) return;

  window.__waNative = { notificationClicked, reply, diagnose, runDiagnostics };
  installNavigatorSpoof();
  installNotificationShim();
  installCallRedirect();
  installStyles(css);
  installTitlebar();
  installShortcuts();
}

main();
