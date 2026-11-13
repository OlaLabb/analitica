import * as React from "react";
import { useGame } from "@/hooks/game";
import { useRecurrence } from "@/api/hooks";
import type { VariableAny } from "@/api/types";
import type { WindowState } from "@/lib/window";
import { ChiSummary, QueryState, Section, Warnings, WindowInfo } from "@/components/common";
import { ObservedExpectedChart } from "@/components/charts/charts";
import { VarSelect } from "@/components/stats/VarSelect";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/misc";
import { fmtDate, fmtInt, fmtNum, fmtP } from "@/lib/format";

type SortKey = "number" | "since" | "tail";

export function RecurrenceTab({ win }: { win: WindowState }) {
  const { game } = useGame();
  const [variable, setVariable] = React.useState<VariableAny>("main_any");
  const [sort, setSort] = React.useState<SortKey>("number");
  const q = useRecurrence(game, win, variable);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <VarSelect id="rec-var" value={variable} onChange={setVariable} allowAny />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Ordenar por</span>
          <Segmented<SortKey>
            size="sm"
            value={sort}
            onChange={setSort}
            options={[{ value: "number", label: "Número" }, { value: "since", label: "Sorteos sin salir" }, { value: "tail", label: "Prob. de cola" }]}
          />
        </div>
      </div>
      <Alert variant="warning" title="La ausencia no implica mayor probabilidad">
        En sorteos independientes, que un número lleve muchos sorteos sin aparecer no aumenta su probabilidad de salir en el próximo
        (falacia del jugador). Esta vista solo describe intervalos entre apariciones.
      </Alert>
      <QueryState query={q}>
        {(d) => {
          const rows = [...d.result.rows].sort((a, b) =>
            sort === "number" ? a.number - b.number : sort === "since" ? (b.draws_since_last ?? -1) - (a.draws_since_last ?? -1) : (a.absence_tail_prob ?? 1) - (b.absence_tail_prob ?? 1),
          );
          return (
            <div className="space-y-4">
              <WindowInfo window={d.window} version={d.historical_version} rulesConfirmed={d.rules_confirmed} />
              {d.result.gap_histogram && (
                <Section title="Distribución de intervalos (gaps)" description="Intervalos observados entre apariciones frente a la distribución geométrica esperada bajo independencia.">
                  <ObservedExpectedChart
                    categories={d.result.gap_histogram.bins}
                    observed={d.result.gap_histogram.observed}
                    expected={d.result.gap_histogram.expected_geometric}
                    observedLabel="Intervalos observados"
                    expectedLabel="Esperado (geométrica)"
                    xName="Sorteos entre apariciones"
                  />
                  <div className="mt-3">
                    <ChiSummary test={d.result.geometric_fit_test} title="Ajuste a la geométrica χ²" />
                  </div>
                </Section>
              )}
              {d.result.interpretation && <Alert variant="info" title="Interpretación">{d.result.interpretation}</Alert>}
              <Warnings items={d.result.warnings} />
              <Section title={`Tabla de recurrencia · ${d.result.label}`}>
                <Table>
                  <THead>
                    <TR>
                      <TH>Número</TH>
                      <TH className="text-right">Apariciones</TH>
                      <TH>Última vez</TH>
                      <TH className="text-right">Sorteos sin salir</TH>
                      <TH className="text-right">Gap medio</TH>
                      <TH className="text-right">Mediana</TH>
                      <TH className="text-right">Mín–Máx</TH>
                      <TH className="text-right">CV</TH>
                      <TH className="text-right">Gap esperado</TH>
                      <TH className="text-right">Prob. de cola</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((r) => (
                      <TR key={r.number}>
                        <TD className="font-semibold">{r.number}</TD>
                        <TD className="text-right">{fmtInt(r.appearances)}</TD>
                        <TD className="whitespace-nowrap text-xs">{r.never_seen ? "Nunca" : fmtDate(r.last_seen_date)}</TD>
                        <TD className="text-right">{fmtInt(r.draws_since_last)}</TD>
                        <TD className="text-right">{fmtNum(r.gap_mean, 1)}</TD>
                        <TD className="text-right">{fmtNum(r.gap_median, 0)}</TD>
                        <TD className="text-right text-xs">{r.gap_min ?? "—"}–{r.gap_max ?? "—"}</TD>
                        <TD className="text-right">{fmtNum(r.gap_cv, 2)}</TD>
                        <TD className="text-right">{fmtNum(r.expected_gap, 1)}</TD>
                        <TD className="text-right font-mono text-xs">{fmtP(r.absence_tail_prob)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  "Prob. de cola": probabilidad bajo azar de una ausencia al menos tan larga como la actual. Valores pequeños describen una racha
                  inusual, no una mayor probabilidad futura; con {rows.length} números, algunas rachas inusuales son esperables.
                </p>
              </Section>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
