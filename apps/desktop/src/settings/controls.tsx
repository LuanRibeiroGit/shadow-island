import type { ReactNode } from "react";
import type { Support } from "@ids/shared";

export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch">
      <span>
        {label}
        {hint && <div className="faint" style={{ fontSize: 12 }}>{hint}</div>}
      </span>
      <input type="checkbox" className="toggle" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="mono" style={{ width: 56, textAlign: "right" }}>{format ? format(value) : value}</span>
      </span>
    </label>
  );
}

export function SupportLine({ name, s }: { name: string; s: Support }) {
  const cls = s.level === "full" ? "ok" : s.level === "limited" ? "warn" : "err";
  const text = s.level === "full" ? "Suportado" : s.level === "limited" ? "Limitado" : "Indisponível";
  return (
    <div className="support">
      <span className={`tag ${cls}`} style={{ minWidth: 86, textAlign: "center" }}>{text}</span>
      <span>
        <strong>{name}</strong>
        {"reason" in s && <span className="dim"> · {s.reason}</span>}
      </span>
    </div>
  );
}
