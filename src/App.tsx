import { useEffect, useState } from "react";
import { api, type AppInfo, type Settings } from "./api";
import { SettingsCard, SettingsSection } from "./components/SettingsCard";
import { Toggle } from "./components/Toggle";

const SPELLCHECK_OPTIONS = [
  { code: "pt_BR", label: "Português (Brasil)" },
  { code: "en_US", label: "Inglês (EUA)" },
  { code: "es_ES", label: "Espanhol" },
];

type Status = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [uaDraft, setUaDraft] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    Promise.all([api.getSettings(), api.appInfo()])
      .then(([s, i]) => {
        setSettings(s);
        setInfo(i);
        setUaDraft(s.userAgent);
      })
      .catch((err) => setStatus({ kind: "error", message: String(err) }));
  }, []);

  useEffect(() => {
    if (status.kind !== "saved") return;
    const timer = setTimeout(() => setStatus({ kind: "idle" }), 1800);
    return () => clearTimeout(timer);
  }, [status]);

  if (!settings) {
    return (
      <main className="grid h-full place-items-center text-sm text-text-secondary">
        {status.kind === "error" ? status.message : "Carregando…"}
      </main>
    );
  }

  const update = async (patch: Partial<Settings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await api.saveSettings(next);
      setStatus({ kind: "saved" });
    } catch (err) {
      setSettings(previous);
      setStatus({ kind: "error", message: String(err) });
    }
  };

  const toggleLanguage = (code: string, enabled: boolean) => {
    const languages = enabled
      ? [...settings.spellcheckLanguages, code]
      : settings.spellcheckLanguages.filter((l) => l !== code);
    update({ spellcheckLanguages: languages });
  };

  const commitUserAgent = () => {
    const value = uaDraft.trim();
    if (value !== settings.userAgent) update({ userAgent: value });
  };

  return (
    <main className="h-full overflow-y-auto px-8 py-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-[28px] font-semibold">Configurações</h1>
        <span
          role="status"
          className={[
            "text-xs transition-opacity",
            status.kind === "idle" ? "opacity-0" : "opacity-100",
            status.kind === "error" ? "text-danger" : "text-accent",
          ].join(" ")}
        >
          {status.kind === "error" ? status.message : "Alterações salvas"}
        </span>
      </header>

      <div className="space-y-6">
        <SettingsSection title="Geral">
          <SettingsCard
            title="Fechar para a bandeja"
            description="Ao fechar a janela, o WhatsApp continua rodando na bandeja do sistema."
          >
            <Toggle
              label="Fechar para a bandeja"
              checked={settings.closeToTray}
              onChange={(v) => update({ closeToTray: v })}
            />
          </SettingsCard>
          <SettingsCard title="Iniciar com o sistema" description="Abre o WhatsApp automaticamente ao entrar na sessão.">
            <Toggle
              label="Iniciar com o sistema"
              checked={settings.autostart}
              onChange={(v) => update({ autostart: v })}
            />
          </SettingsCard>
          <SettingsCard title="Iniciar minimizado" description="Começa escondido na bandeja, sem abrir a janela.">
            <Toggle
              label="Iniciar minimizado"
              checked={settings.startMinimized}
              onChange={(v) => update({ startMinimized: v })}
            />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Notificações">
          <SettingsCard title="Notificações na área de trabalho" description="Mostra novas mensagens como notificações do sistema.">
            <Toggle
              label="Notificações na área de trabalho"
              checked={settings.notificationsEnabled}
              onChange={(v) => update({ notificationsEnabled: v })}
            />
          </SettingsCard>
          <SettingsCard
            title="Notificações com resposta"
            description="Cartões do próprio app no canto da tela, com campo para responder. Desligado, usa as notificações do sistema."
          >
            <Toggle
              label="Notificações com resposta"
              checked={settings.inAppNotifications}
              disabled={!settings.notificationsEnabled}
              onChange={(v) => update({ inAppNotifications: v })}
            />
          </SettingsCard>
          <SettingsCard title="Mostrar prévia da mensagem" description="Exibe o texto da mensagem na notificação.">
            <Toggle
              label="Mostrar prévia da mensagem"
              checked={settings.showMessagePreview}
              disabled={!settings.notificationsEnabled}
              onChange={(v) => update({ showMessagePreview: v })}
            />
          </SettingsCard>
          <SettingsCard
            title="Notificar com a janela em foco"
            description="Por padrão, nenhuma notificação aparece enquanto você está usando o WhatsApp."
          >
            <Toggle
              label="Notificar com a janela em foco"
              checked={settings.notifyWhenFocused}
              disabled={!settings.notificationsEnabled}
              onChange={(v) => update({ notifyWhenFocused: v })}
            />
          </SettingsCard>
          <SettingsCard
            title="Testar notificações"
            description="Envia uma notificação de exemplo; a resposta é simulada, sem enviar nada no WhatsApp."
          >
            <button
              type="button"
              onClick={() =>
                api.testNotification().catch((err) => setStatus({ kind: "error", message: String(err) }))
              }
              className="rounded-md border border-line bg-surface-hover px-3 py-1 text-xs hover:bg-[#353535]"
            >
              Enviar teste
            </button>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Corretor ortográfico">
          {SPELLCHECK_OPTIONS.map((option) => (
            <SettingsCard key={option.code} title={option.label}>
              <Toggle
                label={option.label}
                checked={settings.spellcheckLanguages.includes(option.code)}
                onChange={(v) => toggleLanguage(option.code, v)}
              />
            </SettingsCard>
          ))}
        </SettingsSection>

        <SettingsSection title="Avançado">
          <div className="space-y-3 rounded-lg bg-surface-raised px-4 py-3">
            <div>
              <p className="text-sm">User-Agent</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Identificação enviada ao WhatsApp Web. Vazio usa a identidade do próprio WebKit (Safari), suportada
                oficialmente. A página é recarregada ao alterar.
              </p>
            </div>
            <input
              value={uaDraft}
              placeholder="Padrão do WebKit (Safari)"
              onChange={(e) => setUaDraft(e.target.value)}
              onBlur={commitUserAgent}
              onKeyDown={(e) => e.key === "Enter" && commitUserAgent()}
              spellCheck={false}
              className="w-full rounded-lg border border-line border-b-text-secondary bg-window px-3 py-1.5 font-mono text-xs text-text-primary outline-none select-text placeholder:text-text-secondary/60 focus:border-b-2 focus:border-b-accent"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!settings.userAgent && !uaDraft}
                onClick={() => {
                  setUaDraft("");
                  update({ userAgent: "" });
                }}
                className="rounded-md border border-line bg-surface-hover px-3 py-1 text-xs hover:bg-[#353535] disabled:opacity-40"
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Sobre">
          <SettingsCard
            title={info ? `${info.name} ${info.version}` : "WhatsApp Desktop"}
            description="Projeto não oficial, sem vínculo com a Meta ou o WhatsApp. Usa o WhatsApp Web dentro de uma janela nativa."
          >
            {info && <span className="text-xs text-text-secondary">Tauri {info.tauri}</span>}
          </SettingsCard>
        </SettingsSection>
      </div>
    </main>
  );
}
