export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals) {
    return Promise.reject(new Error("IPC do Tauri indisponível"));
  }
  return internals.invoke(cmd, args) as Promise<T>;
}
