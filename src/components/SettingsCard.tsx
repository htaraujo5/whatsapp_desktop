import type { ReactNode } from "react";

interface SettingsCardProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Linha de configuração no estilo dos "cards" do app Configurações do Windows 11. */
export function SettingsCard({ title, description, children }: SettingsCardProps) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-6 rounded-lg bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0">
        <p className="text-sm text-text-primary">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-snug text-text-secondary">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="px-1 pb-1 text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}
