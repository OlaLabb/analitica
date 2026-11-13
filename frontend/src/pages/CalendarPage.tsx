import * as React from "react";
import { CalendarDays } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useAvailableYears } from "@/hooks/years";
import { useCalendar, useGrouped, useSummary } from "@/api/hooks";
import type { Dimension, VariableAny } from "@/api/types";
import {
  ChiSummary, DrawNumbers, HonestyNote, PageHeader, QueryState, Section, Warnings, WindowInfo,
} from "@/components/common";
import { WindowFilter, useWindowParam } from "@/components/stats/WindowFilter";
import { NumInput, VarSelect } from "@/components/stats/VarSelect";
import { HeatmapChart, GroupedBarsChart } from "@/components/charts/charts";
import { SimpleSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { WEEKDAYS, fmtDate, fmtInt, fmtPct, todayIso } from "@/lib/format";

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "weekday", label: "Día de la semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
  { value: "quarter", label: "Trimestre" },
  { value: "season", label: "Temporada" },
  { value: "week_of_year", label: "Semana del año" },
  { value: "day_of_month", label: "Día del mes" },
];

export default function CalendarPage() {
  const { game } = useGame();
  const years = useAvailableYears(game);
  const [win, setWin] = useWindowParam();
  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarDays}
        title="Calendario"
        description="Frecuencias agrupadas por dimensiones de calendario y sorteos en fechas cercanas de años anteriores."
      />
      <WindowFilter value={win} onChange={setWin} availableYears={years} />
      <HonestyNote>
        Agrupar por calendario multiplica las comparaciones y reduce la muestra por grupo. Diferencias entre grupos suelen ser ruido; consulte el
        veredicto de homogeneidad y las marcas de muestra pequeña antes de interpretar.
      </HonestyNote>
      <GroupedPanel win={win} />
      <SameDatePanel win={win} />
    </div>
  );
}

function GroupedPanel({ win }: { win: ReturnType<typeof useWindowParam>[0] }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<VariableAny>("main_any");
  const [dimension, setDimension] = React.useState<Dimension>("weekday");
  const [top, setTop] = React.useState(5);
  const q = useGrouped(game, win, variable, dimension, top);
  return (
    <Section title="Frecuencias agrupadas" description="Distribución de números dentro de cada grupo y prueba de homogeneidad entre grupos.">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <VarSelect id="grp-var" value={variable} onChange={setVariable} allowAny />
        <div className="flex w-48 flex-col gap-1.5">
          <Label htmlFor="grp-dim">Dimensión</Label>
          <SimpleSelect<Dimension> id="grp-dim" value={dimension} onChange={setDimension} options={DIMENSIONS} />
        </div>
        <NumInput id="grp-top" label="Top por grupo" value={top} onChange={setTop} min={1} max={50} width="w-24" />
      </div>
      <QueryState query={q} isEmpty={(d) => d.result.groups.length === 0}>
        {(d) => {
          const r = d.result;
          const many = r.groups.length > 8;
          return (
            <div className="space-y-4">
              <WindowInfo window={d.window} version={d.historical_version} rulesConfirmed={d.rules_confirmed} />
              <ChiSummary test={r.homogeneity_test} title="Homogeneidad entre grupos χ²" verdict={r.verdict} />
              {many ? (
                <HeatmapChart
                  xLabels={r.numbers}
                  yLabels={r.groups.map((g) => g.label)}
                  matrix={r.groups.map((g) => g.relative)}
                  height={Math.min(900, Math.max(260, r.groups.length * 18 + 100))}
                  xName="Número"
                  valueLabel="Frecuencia relativa"
                  tooltipExtra={(x, y) => `Conteo: ${r.groups[y]?.counts[x]} · n grupo = ${r.groups[y]?.n_draws}${r.groups[y]?.insufficient_sample ? " · muestra pequeña" : ""}`}
                />
              ) : (
                <GroupedBarsChart categories={r.numbers} series={r.groups.map((g) => ({ name: g.label, values: g.relative }))} />
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {r.groups.map((g) => (
                  <Card key={String(g.key)} className="p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{g.label}</span>
                      <span className="flex items-center gap-1">
                        <Badge variant="secondary">n = {fmtInt(g.n_draws)}</Badge>
                        {g.insufficient_sample && <Badge variant="warning">Muestra pequeña</Badge>}
                      </span>
                    </div>
                    <ul className="space-y-1 text-xs">
                      {g.top.map((t) => (
                        <li key={t.number} className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">{t.number}</span>
                          <span className="text-muted-foreground">
                            {fmtPct(t.relative, 1)} ({t.count}) · IC {fmtPct(t.ci95[0], 1)}–{fmtPct(t.ci95[1], 1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
              <Warnings items={r.warnings} />
            </div>
          );
        }}
      </QueryState>
    </Section>
  );
}

function SameDatePanel({ win }: { win: ReturnType<typeof useWindowParam>[0] }) {
  const { game } = useGame();
  const summary = useSummary(game);
  const [ref, setRef] = React.useState<string>("");
  React.useEffect(() => {
    if (!ref) setRef(summary.data?.next_target_date ?? todayIso());
  }, [summary.data?.next_target_date, ref]);
  const [days, setDays] = React.useState(3);
  const [variable, setVariable] = React.useState<VariableAny>("main_any");
  const [lastYears, setLastYears] = React.useState<string>("all");
  const q = useCalendar(game, win, ref, days, variable, lastYears === "all" ? undefined : parseInt(lastYears, 10));
  return (
    <Section title="Misma fecha en años anteriores" description="Sorteos realizados alrededor de la misma fecha (día y mes) en años previos, ± N días.">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cal-ref">Fecha de referencia</Label>
          <Input id="cal-ref" type="date" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} />
        </div>
        <NumInput id="cal-days" label="± días" value={days} onChange={setDays} min={0} max={60} width="w-24" />
        <VarSelect id="cal-var" value={variable} onChange={setVariable} allowAny />
        <div className="flex w-40 flex-col gap-1.5">
          <Label htmlFor="cal-ly">Años hacia atrás</Label>
          <SimpleSelect
            id="cal-ly"
            value={lastYears}
            onChange={setLastYears}
            options={[{ value: "all", label: "Todos" }, ...[1, 2, 3, 5].map((y) => ({ value: String(y), label: `Últimos ${y}` }))]}
          />
        </div>
      </div>
      <QueryState query={q}>
        {(d) => {
          const r = d.result;
          const rows = [...r.rows].sort((a, b) => b.count_window - a.count_window);
          return (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {fmtInt(r.n_draws)} sorteos alrededor del {fmtDate(r.reference_date)} (± {r.days} días).
              </p>
              <Warnings items={r.warnings} />
              {r.draws.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold">Sorteos encontrados</p>
                    <div className="max-h-96 overflow-auto rounded-md border">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Fecha</TH>
                            <TH>Día</TH>
                            <TH>Resultado</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {r.draws.map((x) => (
                            <TR key={x.draw_date}>
                              <TD className="whitespace-nowrap">{fmtDate(x.draw_date)}</TD>
                              <TD className="text-xs text-muted-foreground">{WEEKDAYS[x.weekday]}</TD>
                              <TD><DrawNumbers numbers={x.numbers} sn={x.sn} /></TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold">Frecuencia en la ventana vs. global</p>
                    <div className="max-h-96 overflow-auto rounded-md border">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Número</TH>
                            <TH className="text-right">Veces</TH>
                            <TH className="text-right">En la ventana</TH>
                            <TH className="text-right">Global</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {rows.map((x) => (
                            <TR key={x.number}>
                              <TD className="font-semibold">{x.number}</TD>
                              <TD className="text-right">{x.count_window}</TD>
                              <TD className="text-right">{fmtPct(x.rel_window, 1)}</TD>
                              <TD className="text-right text-muted-foreground">{fmtPct(x.rel_overall, 1)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </QueryState>
    </Section>
  );
}
