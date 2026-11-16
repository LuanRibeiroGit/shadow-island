import { useEffect, useState } from "react";
import type { Project } from "@ids/shared";
import { backend } from "../bridge/backend";

export const PERIOD_OPTIONS = [
  { value: 1, label: "Últimas 24 h" },
  { value: 7, label: "Últimos 7 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 0, label: "Todo o período" },
];

export const periodFrom = (days: number): number | undefined => (days > 0 ? Date.now() - days * 86_400_000 : undefined);

export function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)?.value ?? value)}>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function useProjects(): Project[] {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    void backend().then((b) => b.listProjects()).then(setProjects).catch(() => setProjects([]));
  }, []);
  return projects;
}

export function ProjectSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const projects = useProjects();
  return <Select label="Projeto" value={value} onChange={onChange} options={[{ value: 0, label: "Todos" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />;
}
