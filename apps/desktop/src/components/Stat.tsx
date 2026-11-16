import type { DataQuality } from "@ids/shared";
import { useT } from "../i18n";

export function QualityBadge({ quality }: { quality: DataQuality }) {
  const t = useT();
  const title: Record<DataQuality, string> = {
    real: "Informado pelo Claude Code",
    calculated: "Calculado localmente a partir de dados reais",
    estimated: "Estimativa com os preços de referência que você configurou",
    unavailable: "Sem dados suficientes",
  };
  return (
    <span className={`q-badge q-${quality}`} title={title[quality]}>
      {t(`quality.${quality}`)}
    </span>
  );
}

export function Stat({ label, value, quality, hint, testId }: { label: string; value: string | null; quality: DataQuality; hint?: string; testId?: string }) {
  const t = useT();
  return (
    <div className="stat card px-frame" data-testid={testId}>
      <div className="label">
        <span>{label}</span>
        <QualityBadge quality={value === null ? "unavailable" : quality} />
      </div>
      <div className={`value${value === null ? " na" : ""}`}>{value ?? t("common.unavailable")}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
