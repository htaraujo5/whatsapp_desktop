interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Interruptor no estilo do Windows 11. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-10 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked
          ? "border-accent bg-accent hover:bg-accent-hover"
          : "border-text-secondary bg-transparent hover:bg-surface-hover",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block rounded-full transition-all duration-150",
          checked ? "h-3 w-3 translate-x-[22px] bg-window" : "h-2.5 w-2.5 translate-x-[4px] bg-text-secondary",
        ].join(" ")}
      />
    </button>
  );
}
