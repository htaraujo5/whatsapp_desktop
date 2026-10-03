import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NativeNotification,
  _resetForTests,
  getNotification,
  installNotificationShim,
  notificationClicked,
} from "./notifications";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("shim de Notification", () => {
  type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  let invoke: ReturnType<typeof vi.fn<Invoke>>;

  beforeEach(() => {
    _resetForTests();
    invoke = vi.fn<Invoke>().mockResolvedValue(undefined);
    window.__TAURI_INTERNALS__ = { invoke };
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it("informa permissão concedida", async () => {
    installNotificationShim();
    expect(window.Notification.permission).toBe("granted");
    await expect(window.Notification.requestPermission()).resolves.toBe("granted");
  });

  it("encaminha título, corpo, tag e avatar ao Rust", async () => {
    const onshow = vi.fn();
    const icon = "data:image/png;base64,AAAA";
    const n = new NativeNotification("Maria", { body: "Oi!", tag: "chat-1", icon });
    n.onshow = onshow;
    await flush();
    await flush();
    expect(invoke).toHaveBeenCalledWith("notify", {
      id: 1,
      title: "Maria",
      body: "Oi!",
      tag: "chat-1",
      silent: false,
      icon,
    });
    expect(onshow).toHaveBeenCalledOnce();
  });

  it("mantém a notificação disponível para resposta depois de fechada", () => {
    const n = new NativeNotification("Ana");
    const onclick = vi.fn();
    n.onclick = onclick;
    n.close();
    expect(getNotification(n.id)).toBe(n);
    n.activate();
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("dispara onclick quando o Rust avisa do clique", async () => {
    const n = new NativeNotification("João");
    const onclick = vi.fn();
    const listener = vi.fn();
    n.onclick = onclick;
    n.addEventListener("click", listener);

    const onclose = vi.fn();
    n.onclose = onclose;

    notificationClicked(n.id);
    expect(onclick).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
    expect(onclose).toHaveBeenCalledOnce();

    notificationClicked(n.id);
    expect(onclick).toHaveBeenCalledTimes(2);
    expect(onclose).toHaveBeenCalledOnce();
  });

  it("sinaliza erro quando o IPC falha", async () => {
    invoke.mockRejectedValueOnce(new Error("negado"));
    const n = new NativeNotification("Falha");
    const onerror = vi.fn();
    n.onerror = onerror;
    await flush();
    await flush();
    expect(onerror).toHaveBeenCalledOnce();
  });
});
