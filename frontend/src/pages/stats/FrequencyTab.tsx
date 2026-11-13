import * as React from "react";
import { useGame } from "@/hooks/game";
import { useFrequency, usePooledFrequency } from "@/api/hooks";
import type { VariableAny, Variable } from "@/api/types";
import type { WindowState } from "@/lib/window";
import { ChiSummary, QueryState, Section, Warnings, WindowInfo } from "@/components/common";
import { FrequencyChart, HeatmapChart } from "@/components/charts/charts";
import { VarSelect } from "@/components/stats/VarSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/misc";
import { fmtInt, fmtNum, fmtP, fmtPct, VARIABLE_SHORT } from "@/lib/format";

type SortKey = "number" | "count" | "p";

export function FrequencyTab({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<VariableAny>("p1");
  const [sort, setSort] = React.useState<SortKey>("number");
  const single = useFrequency(game, win, (variable === "main_any" ? "p1" : variable) as Variable, variable !== "main_any");
  const pooled = usePooledFrequency(game, win, variable === "main_any");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <VarSelect id="freq-var" value={variable} onChange={setVariable} allowAny />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Ordenar tabla por</span>
          <Segmented<SortKey>
            size="sm"
            value={sort}
            onChange={setSort}
            options={[{ value: "number", label: "Número" }, { value: "count", label: "Frecuencia" }, { value: "p", label: "p (BH)" }]}
          />
        </div>
      </div>

      {variable === "main_any" ? (
        <QueryState query={pooled}>
          {(d) => {
            const rows = [...d.result.rows].sort((a, b) =>
              sort === "number" ? a.number - b.number : sort === "count" ? b.appearances - a.appearances : (a.p_value_bh ?? 1) - (b.p_value_bh ?? 1),
            );
            const positions = Object.keys(d.result.by_position);
            return (
              <div className="space-y-4">
                <WindowInfo window={d.window} version={d.historical_version} rulesConfirmed={d.rules_confirmed} />
                <Section
                  title="Frecuencia en cualquier posición principal"
                  description={`Proporción de sorteos que contienen cada número. Referencia bajo azar: ${fmtPct(d.result.reference.prob, 2)}.`}
                >
                  <FrequencyChart
                    valueLabel="Sorteos que lo contienen"
                    data={d.result.rows.map((r) => ({
                      number: r.number, value: r.relative, ciLow: r.ci95_low, ciHigh: r.ci95_high, reference: r.reference_prob,
                      significant: r.significant_bh_05, count: r.draws_containing,
                    }))}
                  />
                </Section>
                <Section title="Conteos por posición" description="Cuántas veces aparece cada número en cada posición ordenada.">
                  <HeatmapChart
                    xLabels={d.result.numbers}
                    yLabels={positions.map((p) => VARIABLE_SHORT[p as Variable] ?? p)}
                    matrix={positions.map((p) => d.result.by_position[p])}
                    fmt={(v) => fmtInt(v)}
                    valueLabel="Apariciones"
                    xName="Número"
                    height={280}
                  />
                </Section>
                <Warnings items={d.result.warnings} />
                <Section title="Tabla de frecuencias">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Número</TH>
                        <TH className="text-right">Apariciones</TH>
                        <TH className="text-right">Sorteos con él</TH>
                        <TH className="text-right">Frec. relativa</TH>
                        <TH className="text-right">IC 95 %</TH>
                        <TH className="text-right">Referencia</TH>
                        <TH className="text-right">Esperado</TH>
                        <TH className="text-right">p (BH)</TH>
                        <TH>Señal</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((r) => (
                        <TR key={r.number}>
                          <TD className="font-semibold">{r.number}</TD>
                          <TD className="text-right">{fmtInt(r.appearances)}</TD>
                          <TD className="text-right">{fmtInt(r.draws_containing)}</TD>
                          <TD className="text-right">{fmtPct(r.relative)}</TD>
                          <TD className="text-right text-xs text-muted-foreground">{fmtPct(r.ci95_low)} – {fmtPct(r.ci95_high)}</TD>
                          <TD className="text-right">{fmtPct(r.reference_prob)}</TD>
                          <TD className="text-right">{fmtNum(r.expected_count, 1)}</TD>
                          <TD className="text-right font-mono text-xs">{fmtP(r.p_value_bh)}</TD>
                          <TD>{r.significant_bh_05 ? <Badge variant="warning">Significativo (BH)</Badge> : <span className="text-xs text-muted-foreground">Compatible con azar</span>}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Section>
              </div>
            );
          }}
        </QueryState>
      ) : (
        <QueryState query={single} isEmpty={(d) => d.result.n_draws === 0}>
          {(d) => {
            const rows = [...d.result.rows].sort((a, b) =>
              sort === "number" ? a.number - b.number : sort === "count" ? b.count - a.count : (a.p_value_bh ?? 1) - (b.p_value_bh ?? 1),
            );
            return (
              <div className="space-y-4">
                <WindowInfo window={d.window} version={d.historical_version} rulesConfirmed={d.rules_confirmed} />
                <Section
                  title={`Frecuencia · ${d.result.label}`}
                  description={d.result.reference.description ?? (d.result.reference.theoretical ? "Referencia teórica" : "Referencia empírica")}
                >
                  <FrequencyChart
                    data={d.result.rows.map((r) => ({
                      number: r.number, value: r.relative, ciLow: r.ci95_low, ciHigh: r.ci95_high, reference: r.reference_prob,
                      significant: r.significant_bh_05, count: r.count,
                    }))}
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <ChiSummary test={d.result.gof_test} title="Bondad de ajuste χ² (observado vs referencia)" />
                    <div className="rounded-md border bg-muted/30 p-3 text-xs">
                      <p className="font-semibold">Comparaciones múltiples</p>
                      <p className="mt-1 text-muted-foreground">
                        Se prueban {d.result.rows.length} números a la vez; los p-valores se corrigen con Benjamini-Hochberg.{" "}
                        <strong className="text-foreground">{d.result.n_significant_bh}</strong> número(s) significativos a α = 0,05.
                      </p>
                    </div>
                  </div>
                  {d.result.interpretation && <Alert variant="info" className="mt-3" title="Interpretación">{d.result.interpretation}</Alert>}
                </Section>
                <Warnings items={d.result.warnings} />
                <Section title="Tabla de frecuencias">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Número</TH>
                        <TH className="text-right">Conteo</TH>
                        <TH className="text-right">Frec. relativa</TH>
                        <TH className="text-right">IC 95 %</TH>
                        <TH className="text-right">Referencia</TH>
                        <TH className="text-right">Esperado</TH>
                        <TH className="text-right">z</TH>
                        <TH className="text-right">p</TH>
                        <TH className="text-right">p (BH)</TH>
                        <TH>Señal</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((r) => (
                        <TR key={r.number}>
                          <TD className="font-semibold">{r.number}</TD>
                          <TD className="text-right">{fmtInt(r.count)}</TD>
                          <TD className="text-right">{fmtPct(r.relative)}</TD>
                          <TD className="text-right text-xs text-muted-foreground">{fmtPct(r.ci95_low)} – {fmtPct(r.ci95_high)}</TD>
                          <TD className="text-right">{fmtPct(r.reference_prob)}</TD>
                          <TD className="text-right">{fmtNum(r.expected_count, 1)}</TD>
                          <TD className="text-right">{fmtNum(r.z_score, 2)}</TD>
                          <TD className="text-right font-mono text-xs">{fmtP(r.p_value)}</TD>
                          <TD className="text-right font-mono text-xs">{fmtP(r.p_value_bh)}</TD>
                          <TD>{r.significant_bh_05 ? <Badge variant="warning">Significativo (BH)</Badge> : <span className="text-xs text-muted-foreground">Compatible con azar</span>}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Section>
              </div>
            );
          }}
        </QueryState>
      )}
    </div>
  );
}
