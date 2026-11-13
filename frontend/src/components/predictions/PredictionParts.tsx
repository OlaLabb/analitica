import * as React from "react";
import { ChevronDown, History } from "lucide-react";
import type { LegacyPrediction, LiveResults, NumbersEvaluation, Prediction, Suggested, Variable } from "@/api/types";
import { isNumbersPrediction } from "@/api/types";
import { DrawNumbers, HashText, KeyValue } from "@/components/common";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VARIABLES, VARIABLE_LABELS, fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export const LEGACY_LABEL = "Formato anterior (por posición) — reemplazado";

export function StatusBadge({ status }: { status: string }) {
  if (status === "published") return <Badge variant="success">Publicada (vigente)</Badge>;
  if (status === "superseded") return <Badge variant="secondary">Reemplazada</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

/** Sección plegable (cerrada por defecto) basada en <details>, accesible y sin JS extra. */
export function Collapsible({ title, children, defaultOpen, className, testId }: {
  title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string; testId?: string;
}) {
  return (
    <details className={cn("group rounded-lg border bg-card", className)} open={defaultOpen} data-testid={testId}>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/50">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}

function scopeText(p: Prediction): string {
  const ds = p.data_scope;
  const mode = ds.spec?.mode;
  const label =
    mode === "all" ? "Todo el histórico" : mode === "last_n_draws" ? `Últimos ${fmtInt(ds.spec?.n)} sorteos` : mode ?? "—";
  return `${label} · ${fmtInt(ds.n_draws)} sorteos (${fmtDate(ds.first_date)} – ${fmtDate(ds.last_date)})`;
}

/** Metadatos de reproducibilidad. */
export function TechnicalDetails({ p }: { p: Prediction }) {
  return (
    <KeyValue
      className="sm:grid-cols-[auto,1fr]"
      items={[
        ["Generada", fmtDateTime(p.generated_at)],
        ["Histórico usado", `Versión ${p.historical_version.number} · ${fmtInt(p.historical_version.draw_count)} sorteos · último sorteo ${fmtDate(p.historical_version.last_draw_date)}`],
        ["Configuración", `Versión ${p.configuration.version_number} · ${p.configuration.name}`],
        ["Versión del algoritmo", p.algorithm_version],
        ["Método", p.official_model],
        ["Huella de la predicción", <HashText key="h" value={p.prediction_hash} n={16} />],
        ["Datos usados", scopeText(p)],
      ]}
    />
  );
}

/** Texto corto del resultado de una predicción numbers_v1. */
export function evaluationText(ev: Pick<NumbersEvaluation, "matches" | "super_hit" | "category">): string {
  const n = `Acertó ${ev.matches} de 5 número${ev.matches === 1 ? "" : "s"}`;
  const sb = ev.super_hit ? "y el Súper Número" : "sin el Súper Número";
  const prize = ev.category ? ` · Premio: ${ev.category}` : " · Sin premio";
  return `${n} ${sb}${prize}`;
}

/** Comparación sugerida vs. real con los aciertos resaltados. */
export function MatchComparison({ suggested, actual, superHit, size = "sm" }: {
  suggested: Suggested;
  actual: { numbers: number[]; super_number: number };
  superHit: boolean;
  size?: "sm" | "md";
}) {
  const hits = suggested.numbers.filter((n) => actual.numbers.includes(n));
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-[auto,1fr] sm:items-center sm:gap-x-3">
      <span className="text-muted-foreground">Sugerida</span>
      <DrawNumbers numbers={suggested.numbers} sn={suggested.super_number} size={size} highlight={hits} dimOthers snHighlight={superHit} snDim={!superHit} />
      <span className="text-muted-foreground">Resultado real</span>
      <DrawNumbers numbers={actual.numbers} sn={actual.super_number} size={size} highlight={hits} snHighlight={superHit} />
    </div>
  );
}

export function NumbersEvaluationCard({ ev }: { ev: NumbersEvaluation }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm font-semibold">{evaluationText(ev)}</p>
      <MatchComparison suggested={ev.suggested} actual={ev.actual} superHit={ev.super_hit} size="md" />
    </div>
  );
}

function legacyEvaluationText(ev: LiveResults): string {
  const best = ev.combinations?.length ? Math.max(...ev.combinations.map((c) => c.number_matches)) : null;
  return best === null ? "Evaluada con el formato anterior" : `Formato anterior: su mejor combinación coincidió en ${best} número${best === 1 ? "" : "s"}`;
}

/** Vista de solo lectura para predicciones antiguas (por posición). */
export function LegacyPredictionView({ p }: { p: LegacyPrediction }) {
  const items = p.combinations?.items ?? [];
  const cands = p.candidates ?? {};
  return (
    <div className="space-y-4" data-testid="legacy-prediction">
      <Alert variant="warning" title={LEGACY_LABEL}>
        Esta predicción ordenaba los números por posición. Baloto paga por cuántos números se aciertan en cualquier orden más el Súper Número, así
        que este formato fue reemplazado. Se conserva solo como registro.
      </Alert>
      {p.evaluation && <p className="text-sm">{legacyEvaluationText(p.evaluation)}</p>}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Combinaciones que se mostraban</p>
          <ul className="space-y-1.5">
            {items.slice(0, 5).map((c, i) => (
              <li key={i}>
                <DrawNumbers numbers={c.numbers} sn={c.super_number} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {VARIABLES.some((v) => cands[v]?.length) && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Primeros números por posición</p>
          <Table>
            <THead>
              <TR>
                <TH>Posición</TH>
                <TH>Números</TH>
              </TR>
            </THead>
            <TBody>
              {VARIABLES.map((v: Variable) => (
                <TR key={v}>
                  <TD className="text-xs">{VARIABLE_LABELS[v]}</TD>
                  <TD className="font-mono text-xs">{(cands[v] ?? []).slice(0, 5).map((c) => c.number).join(" · ") || "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Resumen de una fila del historial (sirve para ambos formatos). */
export function HistoryRowSummary({ p }: { p: Prediction }) {
  if (!isNumbersPrediction(p)) {
    return (
      <div className="space-y-1">
        <Badge variant="outline" className="gap-1">
          <History className="h-3 w-3" /> {LEGACY_LABEL}
        </Badge>
        {p.evaluation && <p className="text-xs text-muted-foreground">{legacyEvaluationText(p.evaluation)}</p>}
      </div>
    );
  }
  const s = p.combinations?.suggested;
  return (
    <div className="space-y-1.5">
      {s ? <DrawNumbers numbers={s.numbers} sn={s.super_number} /> : <span className="text-xs text-muted-foreground">Sin combinación</span>}
      <p className="text-xs text-muted-foreground" data-testid="history-eval">
        {p.evaluation ? evaluationText(p.evaluation) : "Pendiente: el sorteo aún no se ha registrado"}
      </p>
    </div>
  );
}
