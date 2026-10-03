/**
 * Completa um User-Agent de Chrome/Edge definido pelo usuário: sem isso o
 * WebKit continua se identificando como Apple em `navigator.vendor`. Com o
 * User-Agent padrão (Safari) nada é alterado, para a identidade ficar coerente.
 */
export function installNavigatorSpoof(win: Window = window): void {
  if (!/\bChrome\//.test(win.navigator.userAgent)) return;

  const define = (key: "vendor" | "platform", value: string) => {
    try {
      Object.defineProperty(Object.getPrototypeOf(win.navigator), key, {
        get: () => value,
        configurable: true,
      });
    } catch {
      // Propriedade não configurável neste motor; o UA continua valendo.
    }
  };
  define("vendor", "Google Inc.");
  if (/Windows/.test(win.navigator.userAgent)) define("platform", "Win32");

  const w = win as Window & { chrome?: unknown };
  if (!("chrome" in w)) {
    Object.defineProperty(w, "chrome", { value: { runtime: {} }, configurable: true });
  }
}
