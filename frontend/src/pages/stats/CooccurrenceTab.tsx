import * as React from "react";
import { useGame } from "@/hooks/game";
import { useGroups, usePairs, usePositionRelations, useRepeats, useTransitions } from "@/api/hooks";
import type { PairItem, Variable } from "@/api/types";
import type { WindowState } from "@/lib/window";
import { ChiSummary, NumberBall, QueryState, Section, Warnings, WindowInfo } from "@/components/common";
import { HeatmapChart, ObservedExpectedChart } from "@/components/charts/charts";
import { NumInput, VarSelect } from "@/components/stats/VarSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtInt, fmtNum, fmtP, fmtPct, VARIABLE_SHORT } from "@/lib/format";

export function CooccurrenceTab({ win }: { win: WindowState }) {
  return (
    <div className="space-y-4">
      <PairsPanel win={win} />
      <div className="grid gap-4 xl:grid-cols-2">
        <GroupsPanel win={win} />
        <RepeatsPanel win={win} />
      </div>
      <TransitionsPanel win={win} />
      <PositionsPanel win={win} />
    </div>
  );
}

function PairTable({ items, title }: { items: PairItem[]; title: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold">{title}</p>
      <Table>
        <THead>
          <TR>
            <TH>Par</TH>
            <TH className="text-right">Veces</TH>
            <TH className="text-right">Esperado</TH>
            <TH className="text-right">p (BH)</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((p) => (
            <TR key={p.pair.join("-")}>
              <TD>
                <span className="inline-flex gap-1">
                  <NumberBall n={p.pair[0]} size="sm" />
                  <NumberBall n={p.pair[1]} size="sm" />
                </span>
                {p.significant_bh_05 && <Badge variant="warning" className="ml-2">BH</Badge>}
              </TD>
              <TD className="text-right">{fmtInt(p.count)}</TD>
              <TD className="text-right">{fmtNum(p.expected, 1)}</TD>
              <TD className="text-right font-mono text-xs">{fmtP(p.p_value_bh)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function PairsPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [top, setTop] = React.useState(15);
  const q = usePairs(game, win, top);
  return (
    <Section
      title="Pares de números"
      description="Cuántas veces aparecen juntos dos números principales en el mismo sorteo."
      actions={<NumInput id="pairs-top" label="Top" value={top} onChange={setTop} min={1} max={200} width="w-20" />}
    >
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-4">
            <WindowInfo window={d.window} version={d.historical_version} />
            <p className="text-xs text-muted-foreground">
              {fmtInt(d.result.n_pairs)} pares posibles · esperado por par bajo azar: <strong className="text-foreground">{fmtNum(d.result.expected_per_pair, 2)}</strong> ·{" "}
              {d.result.n_significant_bh} significativos tras BH.
            </p>
            <HeatmapChart
              xLabels={d.result.matrix.numbers}
              yLabels={d.result.matrix.numbers}
              matrix={d.result.matrix.counts}
              fmt={(v) => fmtInt(v)}
              valueLabel="Veces juntos"
              height={520}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <PairTable items={d.result.most_frequent} title="Más frecuentes" />
              <PairTable items={d.result.least_frequent} title="Menos frecuentes" />
            </div>
            <Warnings items={d.result.warnings} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function GroupsPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [size, setSize] = React.useState(3);
  const [top, setTop] = React.useState(15);
  const q = useGroups(game, win, size, top);
  return (
    <Section
      title="Grupos frecuentes"
      description="Combinaciones de k números que han salido juntas más veces."
      actions={
        <>
          <NumInput id="grp-size" label="Tamaño k" value={size} onChange={setSize} min={2} max={5} width="w-20" />
          <NumInput id="grp-top" label="Top" value={top} onChange={setTop} min={1} max={200} width="w-20" />
        </>
      }
    >
      <QueryState query={q} isEmpty={(d) => d.result.groups.length === 0}>
        {(d) => (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {fmtInt(d.result.n_distinct_groups_observed)} grupos distintos observados en {fmtInt(d.result.n_draws)} sorteos. Con tantos grupos
              posibles, repeticiones de pocos casos son esperables por azar.
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Grupo</TH>
                  <TH className="text-right">Veces</TH>
                </TR>
              </THead>
              <TBody>
                {d.result.groups.map((g) => (
                  <TR key={g.numbers.join("-")}>
                    <TD>
                      <span className="inline-flex flex-wrap gap-1">
                        {g.numbers.map((n) => (
                          <NumberBall key={n} n={n} size="sm" />
                        ))}
                      </span>
                    </TD>
                    <TD className="text-right">{fmtInt(g.count)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Warnings items={d.result.warnings} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function RepeatsPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [lag, setLag] = React.useState(10);
  const q = useRepeats(game, win, lag);
  return (
    <Section
      title="Repeticiones entre sorteos"
      description="Números compartidos con el sorteo de hace k sorteos, frente a lo esperado."
      actions={<NumInput id="rep-lag" label="Desfase máx." value={lag} onChange={setLag} min={1} max={100} width="w-24" />}
    >
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-3">
            {d.result.lag1_distribution && (
              <ObservedExpectedChart
                categories={d.result.lag1_distribution.shared.map((x) => `${x}`)}
                observed={d.result.lag1_distribution.observed}
                expected={d.result.lag1_distribution.expected}
                xName="Números compartidos con el sorteo anterior"
                height={220}
              />
            )}
            <Table>
              <THead>
                <TR>
                  <TH>Desfase</TH>
                  <TH className="text-right">n</TH>
                  <TH className="text-right">Compartidos (media)</TH>
                  <TH className="text-right">Esperado</TH>
                  <TH className="text-right">Repite SN</TH>
                </TR>
              </THead>
              <TBody>
                {d.result.lags.map((l) => (
                  <TR key={l.lag}>
                    <TD>{l.lag}</TD>
                    <TD className="text-right">{fmtInt(l.n)}</TD>
                    <TD className="text-right">{fmtNum(l.mean_shared, 3)}</TD>
                    <TD className="text-right">{fmtNum(l.expected_mean_shared, 3)}</TD>
                    <TD className="text-right">{fmtPct(l.sn_repeat_rate, 1)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="text-[11px] text-muted-foreground">Tasa esperada de repetición del Súper Número bajo azar: {fmtPct(d.result.sn_expected_repeat_rate, 2)}.</p>
            <Warnings items={d.result.warnings} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function TransitionsPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<Variable>("sn");
  const q = useTransitions(game, win, variable);
  return (
    <Section title="Transiciones" description="Valor del sorteo siguiente (columnas) dado el valor del sorteo actual (filas).">
      <div className="mb-3">
        <VarSelect<Variable> id="tr-var" value={variable} onChange={setVariable} />
      </div>
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{fmtInt(d.result.n_transitions)} transiciones observadas.</p>
            <HeatmapChart
              xLabels={d.result.numbers}
              yLabels={d.result.numbers}
              matrix={d.result.matrix}
              fmt={(v) => fmtInt(v)}
              valueLabel="Transiciones"
              xName="Siguiente"
              yName="Actual"
              height={Math.min(620, Math.max(320, d.result.numbers.length * 13 + 100))}
            />
            <ChiSummary test={d.result.independence_test} title="Independencia χ²" />
            <Warnings items={d.result.warnings} />
          </div>
        )}
      </QueryState>
    </Section>
  );
}

function PositionsPanel({ win }: { win: WindowState }) {
  const { game } = useGame();
  const q = usePositionRelations(game, win);
  return (
    <Section title="Correlación entre posiciones" description="Correlación de Spearman entre variables, con p-valores corregidos por Holm.">
      <QueryState query={q}>
        {(d) => {
          const labels = d.result.variables.map((v) => VARIABLE_SHORT[v as Variable] ?? v);
          return (
            <div className="space-y-3">
              <Warnings items={d.result.warnings} title="Nota" />
              <HeatmapChart
                xLabels={labels}
                yLabels={labels}
                matrix={d.result.spearman}
                fmt={(v) => fmtNum(v, 3)}
                diverging
                min={-1}
                max={1}
                valueLabel="ρ de Spearman"
                height={340}
                tooltipExtra={(x, y) => {
                  const p = d.result.p_values_holm[y]?.[x] ?? d.result.p_values_holm[x]?.[y];
                  return `p (Holm): ${fmtP(p)}`;
                }}
              />
            </div>
          );
        }}
      </QueryState>
    </Section>
  );
}
