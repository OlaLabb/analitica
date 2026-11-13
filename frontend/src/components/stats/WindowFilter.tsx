import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { ChipToggleGroup } from "@/components/ui/misc";
import { MONTHS, WEEKDAYS_SHORT } from "@/lib/format";
import {
  DEFAULT_WINDOW, WINDOW_MODE_LABELS, describeWindow, windowFromSearch, windowIncomplete, windowToSearch,
  type WindowMode, type WindowState,
} from "@/lib/window";
import { cn } from "@/lib/utils";

/** Ventana persistida en la URL (prefijo configurable) para que los filtros sean compartibles. */
export function useWindowParam(prefix = "w_"): [WindowState, (w: WindowState) => void] {
  const [sp, setSp] = useSearchParams();
  const value = React.useMemo(() => windowFromSearch(sp, prefix), [sp, prefix]);
  const set = React.useCallback(
    (w: WindowState) => setSp((cur) => windowToSearch(w, cur, prefix), { replace: true }),
    [setSp, prefix],
  );
  return [value, set];
}

export interface WindowFilterProps {
  value: WindowState;
  onChange: (w: WindowState) => void;
  /** Años disponibles en el histórico (para el modo "años específicos"). */
  availableYears?: number[];
  className?: string;
  compact?: boolean;
  title?: string;
}

/**
 * Filtro de ventana temporal compartido. Edita un borrador local y solo lo aplica al pulsar "Aplicar"
 * (evita disparar consultas mientras se escribe).
 */
export function WindowFilter({ value, onChange, availableYears = [], className, compact, title = "Ventana de análisis" }: WindowFilterProps) {
  const [draft, setDraft] = React.useState<WindowState>(value);
  const [more, setMore] = React.useState<boolean>(!!(value.months?.length || value.weekdays?.length));
  React.useEffect(() => setDraft(value), [value]);

  const incomplete = windowIncomplete(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const needsN = draft.mode === "last_n_draws" || draft.mode === "last_n_months" || draft.mode === "last_n_years";
  const id = React.useId();

  return (
    <form
      className={cn("rounded-lg border bg-card p-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (!incomplete) onChange(draft);
      }}
      aria-label={title}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[180px] flex-col gap-1.5">
          <Label htmlFor={`${id}-mode`} className="flex items-center gap-1">
            <Filter className="h-3 w-3" /> {title}
          </Label>
          <SimpleSelect<WindowMode>
            id={`${id}-mode`}
            ariaLabel="Modo de ventana"
            value={draft.mode}
            onChange={(mode) => setDraft({ ...draft, mode, n: needsN ? draft.n : mode === "last_n_draws" ? 200 : mode === "last_n_months" ? 12 : mode === "last_n_years" ? 2 : undefined })}
            options={(Object.keys(WINDOW_MODE_LABELS) as WindowMode[]).map((m) => ({ value: m, label: WINDOW_MODE_LABELS[m] }))}
          />
        </div>
        {needsN && (
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor={`${id}-n`}>N</Label>
            <Input
              id={`${id}-n`}
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.n ?? ""}
              onChange={(e) => setDraft({ ...draft, n: e.target.value ? parseInt(e.target.value, 10) : undefined })}
            />
          </div>
        )}
        {draft.mode === "date_range" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-start`}>Desde</Label>
              <Input id={`${id}-start`} type="date" value={draft.start ?? ""} onChange={(e) => setDraft({ ...draft, start: e.target.value || undefined })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-end`}>Hasta</Label>
              <Input id={`${id}-end`} type="date" value={draft.end ?? ""} onChange={(e) => setDraft({ ...draft, end: e.target.value || undefined })} />
            </div>
          </>
        )}
        {draft.mode === "years" && (
          <div className="flex flex-col gap-1.5">
            <Label>Años</Label>
            {availableYears.length ? (
              <ChipToggleGroup<number>
                ariaLabel="Años"
                values={draft.years ?? []}
                onChange={(years) => setDraft({ ...draft, years })}
                options={availableYears.map((y) => ({ value: y, label: String(y) }))}
              />
            ) : (
              <Input
                placeholder="2023,2024"
                value={draft.years?.join(",") ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, years: e.target.value.split(",").map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x)) })
                }
              />
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!compact && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              <SlidersHorizontal /> {more ? "Menos filtros" : "Más filtros"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(DEFAULT_WINDOW);
              onChange(DEFAULT_WINDOW);
            }}
            disabled={value.mode === "all" && !value.months?.length && !value.weekdays?.length && !dirty}
          >
            <RotateCcw /> Restablecer
          </Button>
          <Button type="submit" size="sm" disabled={!!incomplete || !dirty} title={incomplete ?? undefined}>
            Aplicar
          </Button>
        </div>
      </div>
      {more && !compact && (
        <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Solo días de la semana</Label>
            <ChipToggleGroup<number>
              ariaLabel="Días de la semana"
              values={draft.weekdays ?? []}
              onChange={(weekdays) => setDraft({ ...draft, weekdays })}
              options={WEEKDAYS_SHORT.map((l, i) => ({ value: i, label: l }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Solo meses</Label>
            <ChipToggleGroup<number>
              ariaLabel="Meses"
              values={draft.months ?? []}
              onChange={(months) => setDraft({ ...draft, months })}
              options={MONTHS.map((l, i) => ({ value: i + 1, label: l.slice(0, 3) }))}
            />
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {incomplete ? <span className="text-warning">{incomplete}</span> : <>Aplicado: {describeWindow(value)}</>}
        {" · "}Cambiar la ventana no modifica el histórico ni las predicciones oficiales.
      </p>
    </form>
  );
}

/** Años cubiertos por el histórico (derivados de las fechas reales del resumen). */
export function yearsBetween(first?: string | null, last?: string | null): number[] {
  if (!first || !last) return [];
  const a = parseInt(first.slice(0, 4), 10);
  const b = parseInt(last.slice(0, 4), 10);
  const out: number[] = [];
  for (let y = a; y <= b; y++) out.push(y);
  return out;
}
