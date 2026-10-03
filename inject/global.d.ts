import type { WaNativeApi } from "./index";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    __waNative?: WaNativeApi;
  }
}

export {};
