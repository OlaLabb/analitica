/** Ventana temporal compartida por los endpoints de estadísticas (ver backend/app/api/routes/stats.py). */

export type WindowMode = "all" | "date_range" | "last_n_draws" | "last_n_months" | "last_n_years" | "years";

export interface WindowState {
  mode: WindowMode;
  n?: number;
  start?: string;
  end?: string;
  years?: number[];
  months?: number[];
  weekdays?: number[];
}

export const DEFAULT_WINDOW: WindowState = { mode: "all" };

export const WINDOW_MODE_LABELS: Record<WindowMode, string> = {
  all: "Todo el histórico",
  last_n_draws: "Últimos N sorteos",
  last_n_months: "Últimos N meses",
  last_n_years: "Últimos N años",
  date_range: "Rango de fechas",
  years: "Años específicos",
};

/** Convierte el estado del filtro en parámetros de consulta. Solo incluye lo relevante para el modo. */
export function windowToParams(w: WindowState, prefix = ""): Record<string, string | number> {
  const p: Record<string, string | number> = { [`${prefix}mode`]: w.mode };
  if ((w.mode === "last_n_draws" || w.mode === "last_n_months" || w.mode === "last_n_years") && w.n && w.n > 0)
    p[`${prefix}n`] = w.n;
  if (w.mode === "date_range") {
    if (w.start) p[`${prefix}start`] = w.start;
    if (w.end) p[`${prefix}end`] = w.end;
  }
  if (w.mode === "years" && w.years?.length) p[`${prefix}years`] = [...w.years].sort((a, b) => a - b).join(",");
  if (w.months?.length) p[`${prefix}months`] = [...w.months].sort((a, b) => a - b).join(",");
  if (w.weekdays?.length) p[`${prefix}weekdays`] = [...w.weekdays].sort((a, b) => a - b).join(",");
  return p;
}

/** Indica si el estado está incompleto para el modo seleccionado (evita llamadas que darían 422). */
export function windowIncomplete(w: WindowState): string | null {
  if ((w.mode === "last_n_draws" || w.mode === "last_n_months" || w.mode === "last_n_years") && !(w.n && w.n > 0))
    return "Indique N";
  if (w.mode === "date_range" && !w.start && !w.end) return "Indique al menos una fecha";
  if (w.mode === "years" && !w.years?.length) return "Seleccione al menos un año";
  return null;
}

function ints(s: string | null): number[] | undefined {
  if (!s) return undefined;
  const v = s
    .split(",")
    .map((x) => parseInt(x, 10))
    .filter((x) => Number.isFinite(x));
  return v.length ? v : undefined;
}

const MODES: WindowMode[] = ["all", "date_range", "last_n_draws", "last_n_months", "last_n_years", "years"];

/** Lee la ventana desde la URL (para que los filtros sean compartibles). */
export function windowFromSearch(sp: URLSearchParams, prefix = "w_"): WindowState {
  const mode = sp.get(`${prefix}mode`) as WindowMode | null;
  if (!mode || !MODES.includes(mode)) return DEFAULT_WINDOW;
  const n = sp.get(`${prefix}n`);
  return {
    mode,
    n: n ? parseInt(n, 10) : undefined,
    start: sp.get(`${prefix}start`) ?? undefined,
    end: sp.get(`${prefix}end`) ?? undefined,
    years: ints(sp.get(`${prefix}years`)),
    months: ints(sp.get(`${prefix}months`)),
    weekdays: ints(sp.get(`${prefix}weekdays`)),
  };
}

export function windowToSearch(w: WindowState, sp: URLSearchParams, prefix = "w_"): URLSearchParams {
  const out = new URLSearchParams(sp);
  for (const k of ["mode", "n", "start", "end", "years", "months", "weekdays"]) out.delete(`${prefix}${k}`);
  if (w.mode === "all" && !w.months?.length && !w.weekdays?.length) return out;
  const params = windowToParams(w);
  for (const [k, v] of Object.entries(params)) out.set(`${prefix}${k}`, String(v));
  return out;
}

export function describeWindow(w: WindowState): string {
  const parts: string[] = [];
  switch (w.mode) {
    case "all":
      parts.push("Todo el histórico");
      break;
    case "last_n_draws":
      parts.push(`Últimos ${w.n ?? "?"} sorteos`);
      break;
    case "last_n_months":
      parts.push(`Últimos ${w.n ?? "?"} meses`);
      break;
    case "last_n_years":
      parts.push(`Últimos ${w.n ?? "?"} años`);
      break;
    case "date_range":
      parts.push(`${w.start ?? "…"} → ${w.end ?? "…"}`);
      break;
    case "years":
      parts.push(`Años ${w.years?.join(", ") ?? ""}`);
      break;
  }
  if (w.months?.length) parts.push(`meses ${w.months.join(",")}`);
  if (w.weekdays?.length) parts.push(`días ${w.weekdays.join(",")}`);
  return parts.join(" · ");
}
