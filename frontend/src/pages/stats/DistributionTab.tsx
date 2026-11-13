import * as React from "react";
import { useGame } from "@/hooks/game";
import { useDistribution, useSums } from "@/api/hooks";
import type { Variable } from "@/api/types";
import type { WindowState } from "@/lib/window";
import { ChiSummary, KeyValue, QueryState, Section, Warnings, WindowInfo } from "@/components/common";
import { GroupedBarsChart, ObservedExpectedChart } from "@/components/charts/charts";
import { VarSelect } from "@/components/stats/VarSelect";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";

export function DistributionTab({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<Variable>("p1");
  const q = useDistribution(game, win, variable);
  const sums = useSums(game, win);
  return (
    <div className="space-y-4">
      <VarSelect<Variable> id="dist-var" value={variable} onChange={setVariable} />
      <QueryState query={q}>
        {(d) => {
          const r = d.result;
          return (
            <div className="space-y-4">
              <WindowInfo window={d.window} version={d.historical_version} rulesConfirmed={d.rules_confirmed} />
              <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
                <Section title={`Histograma · ${r.label}`} description="Conteos observados frente a los esperados bajo la referencia de azar.">
                  {r.histogram ? (
                    <ObservedExpectedChart categories={r.histogram.numbers} observed={r.histogram.counts} expected={r.histogram.expected} xName="Número" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin histograma para esta ventana.</p>
                  )}
                  <div className="mt-3">
                    <ChiSummary test={r.gof_test} title="Bondad de ajuste χ²" />
                  </div>
                </Section>
                <Section title="Resumen descriptivo">
                  <KeyValue
                    items={[
                      ["n", fmtInt(r.n)],
                      ["Media (observada / referencia)", `${fmtNum(r.mean, 2)} / ${fmtNum(r.reference_mean, 2)}`],
                      ["Desv. típica (obs. / ref.)", `${fmtNum(r.std, 2)} / ${fmtNum(r.reference_std, 2)}`],
                      ["Varianza", fmtNum(r.variance, 2)],
                      ["Mín – Máx", `${r.min ?? "—"} – ${r.max ?? "—"}`],
                      ["Cuartiles", r.quartiles ? r.quartiles.map((x) => fmtNum(x, 1)).join(" · ") : "—"],
                      ["Asimetría", fmtNum(r.skewness, 3)],
                      ["Curtosis", fmtNum(r.kurtosis, 3)],
                      ["Entropía normalizada", fmtNum(r.concentration?.entropy_normalized, 3)],
                      ["Gini", fmtNum(r.concentration?.gini, 3)],
                      ["Peso del 10 % más frecuente", fmtPct(r.concentration?.top10pct_share, 1)],
                      ["Referencia", r.reference_theoretical ? "Teórica" : "Empírica"],
                    ]}
                  />
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    En posiciones ordenadas la distribución no es uniforme por construcción (P1 tiende a valores bajos, P5 a altos); compárela con la
                    referencia, no con una línea plana.
                  </p>
                </Section>
              </div>
              <Warnings items={r.warnings} />
            </div>
          );
        }}
      </QueryState>

      <QueryState query={sums}>
        {(d) => {
          const s = d.result;
          const labels = s.histogram ? s.histogram.counts.map((_, i) => `${fmtNum(s.histogram!.edges[i], 0)}–${fmtNum(s.histogram!.edges[i + 1], 0)}`) : [];
          return (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section
                title="Suma de los cinco números"
                description={`Media observada ${fmtNum(s.mean, 1)} (desv. ${fmtNum(s.std, 1)}) · referencia ${fmtNum(s.reference?.mean, 1)} (desv. ${fmtNum(s.reference?.std, 1)}).`}
              >
                {s.histogram ? (
                  <GroupedBarsChart categories={labels} series={[{ name: "Sorteos", values: s.histogram.counts }]} fmt={(v) => fmtInt(v)} />
                ) : (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                )}
              </Section>
              <Section title="Paridad" description="Cantidad de números pares por sorteo: observado frente a esperado (hipergeométrica).">
                {s.parity ? (
                  <ObservedExpectedChart
                    categories={s.parity.even_count.map((x) => `${x} pares`)}
                    observed={s.parity.observed}
                    expected={s.parity.expected}
                    fmt={(v) => fmtNum(v, 0)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                )}
              </Section>
              <Warnings items={s.warnings} className="lg:col-span-2" />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
