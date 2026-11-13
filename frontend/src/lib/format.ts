/** Formateadores en español (Colombia). Todas las cifras provienen de la API. */
import type { Variable, VariableAny } from "@/api/types";

export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const VARIABLES: Variable[] = ["p1", "p2", "p3", "p4", "p5", "sn"];
export const VARIABLE_LABELS: Record<VariableAny, string> = {
  p1: "Posición 1",
  p2: "Posición 2",
  p3: "Posición 3",
  p4: "Posición 4",
  p5: "Posición 5",
  sn: "Súper Número",
  main_any: "Cualquier posición",
};
export const VARIABLE_SHORT: Record<VariableAny, string> = {
  p1: "P1", p2: "P2", p3: "P3", p4: "P4", p5: "P5", sn: "SN", main_any: "Todas",
};

const nf = (d: number) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return nf(digits).format(v);
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v);
}

/** Proporción (0..1) → porcentaje. */
export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${nf(digits).format(v * 100)} %`;
}

export function fmtP(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v < 0.0001) return "< 0,0001";
  return nf(4).format(v);
}

export function fmtLift(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `×${nf(3).format(v)}`;
}

/** Fecha ISO (YYYY-MM-DD) sin conversión de zona horaria. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function weekdayOfIso(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return (js + 6) % 7; // 0 = lunes
}

export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${WEEKDAYS[weekdayOfIso(iso)]} ${fmtDate(iso)}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function shortHash(h: string | null | undefined, n = 10): string {
  if (!h) return "—";
  return h.length > n ? `${h.slice(0, n)}…` : h;
}

export function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export const UNCERTAINTY_LABEL: Record<string, string> = {
  alta: "Incertidumbre alta",
  media: "Incertidumbre media",
  baja: "Incertidumbre baja",
};

export const VERDICT_LABEL: Record<string, string> = {
  referencia: "Referencia (azar)",
  sin_mejora_significativa: "Sin mejora significativa",
  evidencia_parcial: "Evidencia parcial",
  mejora_significativa: "Mejora significativa",
  igual_que_el_azar: "Igual que el azar",
  mejor_que_el_azar: "Mejor que el azar",
};

/** Nombres humanos de las estrategias / modelos del formato numbers_v1. */
export const STRATEGY_LABEL: Record<string, string> = {
  azar: "Combinación al azar (método oficial)",
  frecuencia_historica: "Números que más han salido",
  frecuencia_reciente: "Números que más han salido últimamente",
};
export const STRATEGY_SHORT: Record<string, string> = {
  azar: "Al azar (oficial)",
  frecuencia_historica: "Más han salido",
  frecuencia_reciente: "Más han salido últimamente",
};
export function strategyLabel(s: string, short = false): string {
  return (short ? STRATEGY_SHORT : STRATEGY_LABEL)[s] ?? s;
}

/** "1 en 15.401.568" (separador de miles es-CO). */
export function fmtOneIn(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v) || v <= 0) return "—";
  return `1 en ${fmtInt(v)}`;
}

/**
 * Probabilidad (0..1) como porcentaje legible: 2 decimales si es ≥ 1 %, y 2 cifras significativas si es menor
 * (p. ej. 6,49e-8 → "0,0000065 %"), para no mostrar "0,00 %" en premios muy improbables.
 */
export function fmtProbPct(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  const pct = p * 100;
  if (pct === 0) return "0 %";
  if (pct >= 1) return `${nf(2).format(pct)} %`;
  return `${new Intl.NumberFormat("es-CO", { maximumSignificantDigits: 2, maximumFractionDigits: 20 }).format(pct)} %`;
}

/** "sábado 14 de noviembre de 2026" sin conversión de zona horaria. */
export function fmtDateHuman(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const wd = WEEKDAYS[weekdayOfIso(iso)].toLowerCase();
  return `${wd} ${Number(m[3])} de ${MONTHS[Number(m[2]) - 1].toLowerCase()} de ${m[1]}`;
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  publish_official: "Publicar predicción oficial",
  backtest: "Backtest",
  rebuild: "Reconstrucción del motor",
};

export const JOB_STATUS_LABEL: Record<string, string> = {
  queued: "En cola",
  running: "En ejecución",
  succeeded: "Completado",
  failed: "Fallido",
};
