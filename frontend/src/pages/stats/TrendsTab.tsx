import * as React from "react";
import { useGame } from "@/hooks/game";
import { useAvailableYears } from "@/hooks/years";
import { useCompare, useRecentVsPrevious, useRolling, useYearly } from "@/api/hooks";
import type { Compare, Variable, VariableAny } from "@/api/types";
import { DEFAULT_WINDOW, type WindowState } from "@/lib/window";
import { ChiSummary, QueryState, Section, Warnings, WindowInfo } from "@/components/common";
import { GroupedBarsChart, HeatmapChart, LinesChart } from "@/components/charts/charts";
import { NumInput, VarSelect } from "@/components/stats/VarSelect";
import { WindowFilter } from "@/components/stats/WindowFilter";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtInt, fmtP, fmtPct } from "@/lib/format";

export function TrendsTab({ win }: { win: WindowState }) {
  return (
    <div className="space-y-4">
      <RollingPanel win={win} />
      <RecentPanel win={win} />
      <ComparePanel />
      <YearlyPanel win={win} />
    </div>
  );
}

function RollingPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<VariableAny>("sn");
  const [window, setWindow] = React.useState(50);
  const [numbersDraft, setNumbersDraft] = React.useState("1,2,3");
  const [numbers, setNumbers] = React.useState("1,2,3");
  const q = useRolling(game, win, variable, window, numbers);
  const valid = /^\s*\d+(\s*,\s*\d+)*\s*$/.test(numbersDraft) || numbersDraft.trim() === "";
  return (
    <Section title="Frecuencia móvil" description="Frecuencia relativa en una ventana deslizante de N sorteos para los números seleccionados.">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <VarSelect id="roll-var" value={variable} onChange={setVariable} allowAny />
        <NumInput id="roll-win" label="Ventana (sorteos)" value={window} onChange={setWindow} min={2} max={5000} />
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setNumbers(numbersDraft.replace(/\s/g, ""));
          }}
        >
          <div className="flex w-44 flex-col gap-1.5">
            <Label htmlFor="roll-nums">Números (coma)</Label>
            <Input id="roll-nums" value={numbersDraft} onChange={(e) => setNumbersDraft(e.target.value)} placeholder="Vacío = todos" aria-invalid={!valid} />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={!valid}>Mostrar</Button>
        </form>
      </div>
      <QueryState query={q} isEmpty={(d) => d.result.dates.length === 0} empty={<p className="text-sm text-muted-foreground">La ventana tiene menos sorteos que el tamaño de la ventana móvil.</p>}>
        {(d) => (
          <div className="space-y-3">
            <WindowInfo window={d.window} version={d.historical_version} />
            <LinesChart
              x={d.result.dates.map(fmtDate)}
              series={d.result.series.map((s) => ({ name: `Nº ${s.number}`, values: s.values }))}
              reference={d.result.series[0]?.reference_prob}
            />
            {d.result.series.length > 8 && <p className="text-xs text-muted-foreground">Más de 8 series: los colores se repiten; use la leyenda para aislar números.</p>}
            <Warnings items={d.result.warnings} />
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Estabilidad por número ({d.result.stability.length})</summary>
              <Table className="mt-2">
                <THead>
                  <TR>
                    <TH>Número</TH>
                    <TH className="text-right">Desv. típica móvil</TH>
                    <TH className="text-right">Último valor</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.result.stability.map((s) => (
                    <TR key={s.number}>
                      <TD className="font-semibold">{s.number}</TD>
                      <TD className="text-right">{fmtPct(s.rolling_std)}</TD>
                      <TD className="text-right">{fmtPct(s.latest)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </details>
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function CompareResult({ c }: { c: Compare }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {c.label_a}: n = {fmtInt(c.n_a)} · {c.label_b}: n = {fmtInt(c.n_b)}
      </p>
      <GroupedBarsChart
        categories={c.rows.map((r) => r.number)}
        series={[
          { name: c.label_a, values: c.rows.map((r) => r.rel_a) },
          { name: c.label_b, values: c.rows.map((r) => r.rel_b) },
        ]}
      />
      <ChiSummary test={c.homogeneity_test} title="Homogeneidad χ²" verdict={c.verdict} />
      <Warnings items={c.warnings} />
      <details>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Detalle por número</summary>
        <Table className="mt-2">
          <THead>
            <TR>
              <TH>Número</TH>
              <TH className="text-right">{c.label_a}</TH>
              <TH className="text-right">{c.label_b}</TH>
              <TH className="text-right">Diferencia</TH>
              <TH className="text-right">p</TH>
              <TH className="text-right">p (BH)</TH>
              <TH>Señal</TH>
            </TR>
          </THead>
          <TBody>
            {c.rows.map((r) => (
              <TR key={r.number}>
                <TD className="font-semibold">{r.number}</TD>
                <TD className="text-right">{fmtPct(r.rel_a)} <span className="text-xs text-muted-foreground">({r.count_a})</span></TD>
                <TD className="text-right">{fmtPct(r.rel_b)} <span className="text-xs text-muted-foreground">({r.count_b})</span></TD>
                <TD className="text-right">{fmtPct(r.diff)}</TD>
                <TD className="text-right font-mono text-xs">{fmtP(r.p_value)}</TD>
                <TD className="text-right font-mono text-xs">{fmtP(r.p_value_bh)}</TD>
                <TD>{r.significant_bh_05 ? <Badge variant="warning">Significativo</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </details>
    </div>
  );
}

function RecentPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<Variable>("sn");
  const [window, setWindow] = React.useState(100);
  const q = useRecentVsPrevious(game, win, variable, window);
  return (
    <Section title="Recientes frente a anteriores" description="¿La distribución de los últimos N sorteos difiere de la de los anteriores dentro de la ventana?">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <VarSelect<Variable> id="rvp-var" value={variable} onChange={setVariable} />
        <NumInput id="rvp-win" label="Últimos N" value={window} onChange={setWindow} min={2} />
      </div>
      <QueryState query={q}>{(d) => <CompareResult c={d.result} />}</QueryState>
    </Section>
  );
}

function ComparePanel() {
  const { game } = useGame();
  const years = useAvailableYears(game);
  const last = years[years.length - 1];
  const [variable, setVariable] = React.useState<Variable>("sn");
  const [a, setA] = React.useState<WindowState>(DEFAULT_WINDOW);
  const [b, setB] = React.useState<WindowState>(DEFAULT_WINDOW);
  React.useEffect(() => {
    if (last) {
      setA((w) => (w.mode === "all" ? { mode: "years", years: [last - 1] } : w));
      setB((w) => (w.mode === "all" ? { mode: "years", years: [last] } : w));
    }
  }, [last]);
  const q = useCompare(game, a, b, variable);
  return (
    <Section title="Comparar dos periodos (A/B)" description="Prueba de homogeneidad entre dos ventanas arbitrarias del histórico.">
      <div className="mb-3 space-y-3">
        <VarSelect<Variable> id="cmp-var" value={variable} onChange={setVariable} />
        <div className="grid gap-3 lg:grid-cols-2">
          <WindowFilter value={a} onChange={setA} availableYears={years} compact title="Periodo A" />
          <WindowFilter value={b} onChange={setB} availableYears={years} compact title="Periodo B" />
        </div>
      </div>
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-3">
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <p>A: {fmtDate(d.window.first_date)} – {fmtDate(d.window.last_date)} ({fmtInt(d.window.n_draws)} sorteos)</p>
              {d.result.window_b && (
                <p>B: {fmtDate(d.result.window_b.first_date)} – {fmtDate(d.result.window_b.last_date)} ({fmtInt(d.result.window_b.n_draws)} sorteos)</p>
              )}
            </div>
            <Warnings items={[...d.window.warnings, ...(d.result.window_b?.warnings ?? [])]} />
            <CompareResult c={d.result} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function YearlyPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<Variable>("sn");
  const q = useYearly(game, win, variable);
  return (
    <Section title="Evolución anual" description="Frecuencia relativa de cada número por año.">
      <div className="mb-3">
        <VarSelect<Variable> id="yr-var" value={variable} onChange={setVariable} />
      </div>
      <QueryState query={q} isEmpty={(d) => d.result.years.length === 0}>
        {(d) => (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {d.result.years.map((y, i) => (
                <Badge key={y} variant={d.result.n_per_year[i] < 30 ? "warning" : "secondary"}>
                  {y}: n = {d.result.n_per_year[i]}
                </Badge>
              ))}
            </div>
            <HeatmapChart
              xLabels={d.result.numbers}
              yLabels={d.result.years}
              matrix={d.result.relative}
              height={Math.max(220, d.result.years.length * 34 + 90)}
              xName="Número"
              valueLabel="Frecuencia relativa"
              tooltipExtra={(x, y) => `Conteo: ${d.result.counts[y]?.[x] ?? "—"} de ${d.result.n_per_year[y]} sorteos`}
            />
            <ChiSummary test={d.result.homogeneity_test} title="Homogeneidad entre años χ²" />
            <Warnings items={d.result.warnings} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}
