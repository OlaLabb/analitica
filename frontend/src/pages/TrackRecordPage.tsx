import * as React from "react";
import { CalendarCheck, Scale, Trophy } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useTrackRecord } from "@/api/hooks";
import type { StrategyResult, TrackRecord } from "@/api/types";
import { EmptyState, ErrorState, PageHeader, Section } from "@/components/common";
import { ObservedExpectedChart } from "@/components/charts/charts";
import { Collapsible, MatchComparison, evaluationText } from "@/components/predictions/PredictionParts";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate, fmtDateHuman, fmtInt, fmtNum, fmtP, strategyLabel, VERDICT_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function TrackRecordPage() {
  const { game } = useGame();
  const q = useTrackRecord(game);
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Trophy}
        title="¿Cómo le ha ido?"
        description="Comparamos lo que habría acertado cada método con lo que se acierta por pura suerte, usando sorteos reales."
      />
      {q.isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando marcador">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <TrackRecordView t={q.data} />
      ) : null}
    </div>
  );
}

function TrackRecordView({ t }: { t: TrackRecord }) {
  const sim = t.simulation;
  return (
    <>
      {sim ? (
        <Simulation sim={sim} />
      ) : (
        <EmptyState
          icon={Scale}
          title="Todavía no hay una simulación con el formato actual"
          description="Cuando un administrador ejecute una evaluación histórica, aquí verá cómo le habría ido a cada método."
        />
      )}
      <LiveSection live={t.live} />
    </>
  );
}

type Sim = NonNullable<TrackRecord["simulation"]>;

function orderStrategies(sim: Sim): StrategyResult[] {
  return [...sim.strategies].sort((a, b) => (a.strategy === sim.official_strategy ? -1 : b.strategy === sim.official_strategy ? 1 : 0));
}

function Simulation({ sim }: { sim: Sim }) {
  const strategies = orderStrategies(sim);
  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Simulación con {fmtInt(sim.draws)} sorteos reales · {fmtDate(sim.first_date)} – {fmtDate(sim.last_date)}
        </p>
        <p className="text-lg leading-relaxed sm:text-xl" data-testid="headline">{sim.headline}</p>
        <p className="text-base font-semibold leading-relaxed sm:text-lg" data-testid="conclusion">{sim.conclusion}</p>
        <p className="text-xs text-muted-foreground">
          Cada sorteo se “predijo” usando solo los sorteos anteriores a él, como si se hubiera jugado ese día.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {strategies.map((s) => (
          <StrategyCard key={s.strategy} s={s} official={s.strategy === sim.official_strategy} hidePlain={s.plain === sim.headline} />
        ))}
      </div>

      <MatchesSection strategies={strategies} official={sim.official_strategy} />
      <PrizesSection strategies={strategies} />

      <Collapsible title="Ver detalle estadístico" testId="stat-details">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Valores p de las pruebas que comparan cada método con el azar (Holm corrige por hacer varias comparaciones). Un valor p alto significa
            que la diferencia es la que se espera por pura suerte.
          </p>
          <Table>
            <THead>
              <TR>
                <TH>Método</TH>
                <TH className="text-right">p (aciertos)</TH>
                <TH className="text-right">p Holm (aciertos)</TH>
                <TH className="text-right">p (Súper Número)</TH>
                <TH className="text-right">p Holm (Súper Número)</TH>
              </TR>
            </THead>
            <TBody>
              {strategies.map((s) => (
                <TR key={s.strategy}>
                  <TD className="text-xs">{strategyLabel(s.strategy)}</TD>
                  <TD className="text-right font-mono text-xs">{fmtP(s.p_value_matches)}</TD>
                  <TD className="text-right font-mono text-xs">{s.p_holm_matches === undefined ? "—" : fmtP(s.p_holm_matches)}</TD>
                  <TD className="text-right font-mono text-xs">{fmtP(s.p_value_super)}</TD>
                  <TD className="text-right font-mono text-xs">{s.p_holm_super === undefined ? "—" : fmtP(s.p_holm_super)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Collapsible>
    </div>
  );
}

function verdictBadge(v: string) {
  if (v === "referencia") return <Badge variant="default">Es el azar</Badge>;
  if (v === "mejor_que_el_azar") return <Badge variant="success">Mejor que el azar</Badge>;
  if (v === "igual_que_el_azar") return <Badge variant="secondary">Igual que el azar</Badge>;
  return <Badge variant="outline">{VERDICT_LABEL[v] ?? v}</Badge>;
}

/** Dos barras horizontales: lo que pasó vs. lo esperado por azar. */
export function CompareBars({ label, observed, expected, fmt }: { label: string; observed: number; expected: number; fmt: (v: number) => string }) {
  const max = Math.max(observed, expected, 1e-9);
  const w = (v: number) => `${Math.max(2, (v / max) * 100)}%`;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-[4.5rem,1fr,auto] items-center gap-2 text-xs">
        <span>Resultado</span>
        <div className="h-2.5 rounded-full bg-muted">
          <div className="h-2.5 rounded-full bg-primary" style={{ width: w(observed) }} />
        </div>
        <span className="w-12 text-right font-semibold tabular-nums">{fmt(observed)}</span>
        <span className="text-muted-foreground">Por azar</span>
        <div className="h-2.5 rounded-full bg-muted">
          <div className="h-2.5 rounded-full bg-muted-foreground/40" style={{ width: w(expected) }} />
        </div>
        <span className="w-12 text-right tabular-nums text-muted-foreground">{fmt(expected)}</span>
      </div>
    </div>
  );
}

function StrategyCard({ s, official, hidePlain }: { s: StrategyResult; official: boolean; hidePlain?: boolean }) {
  return (
    <Card className={cn("flex flex-col gap-4 p-5", official && "border-primary/50 ring-1 ring-primary/30")} data-testid="strategy-card">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">{verdictBadge(s.verdict)}</div>
        <h3 className="text-base font-semibold leading-snug">{strategyLabel(s.strategy)}</h3>
      </div>
      <CompareBars label="Números acertados en promedio por sorteo" observed={s.average_matches} expected={s.expected_average_by_chance} fmt={(v) => fmtNum(v, 2)} />
      <CompareBars label="Veces que acertó el Súper Número" observed={s.super_hits} expected={s.super_hits_expected_by_chance} fmt={(v) => fmtNum(v, Number.isInteger(v) ? 0 : 1)} />
      <CompareBars label="Sorteos con algún premio" observed={s.draws_with_prize} expected={s.draws_with_prize_expected} fmt={(v) => fmtNum(v, Number.isInteger(v) ? 0 : 1)} />
      {s.plain && !hidePlain && <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{s.plain}</p>}
    </Card>
  );
}

function MatchesSection({ strategies, official }: { strategies: StrategyResult[]; official: string }) {
  const [sel, setSel] = React.useState<string>(official);
  const s = strategies.find((x) => x.strategy === sel) ?? strategies[0];
  if (!s) return null;
  return (
    <Section
      title="¿Cuántos números acertó en cada sorteo?"
      description="Barras: número de sorteos en que acertó 0, 1, 2… números. Línea punteada: lo que se espera por pura suerte."
      actions={
        <Segmented
          size="sm"
          value={s.strategy}
          onChange={setSel}
          ariaLabel="Método"
          options={strategies.map((x) => ({ value: x.strategy, label: strategyLabel(x.strategy, true) }))}
        />
      }
    >
      <ObservedExpectedChart
        categories={s.matches_distribution.map((_, i) => `${i} acierto${i === 1 ? "" : "s"}`)}
        observed={s.matches_distribution}
        expected={s.matches_distribution_expected}
        observedLabel="Sorteos (resultado)"
        expectedLabel="Esperado por azar"
        fmt={(v) => fmtNum(v, Number.isInteger(v) ? 0 : 1)}
        height={260}
      />
    </Section>
  );
}

function PrizesSection({ strategies }: { strategies: StrategyResult[] }) {
  const labels = strategies[0]?.prize_categories.map((c) => c.label) ?? [];
  if (!labels.length) return null;
  return (
    <Section title="Premios obtenidos" description="Cuántas veces cayó cada categoría de premio, frente a lo esperado por azar en la misma cantidad de sorteos.">
      <Table>
        <THead>
          <TR>
            <TH>Premio</TH>
            {strategies.map((s) => (
              <TH key={s.strategy} className="whitespace-normal text-right">{strategyLabel(s.strategy, true)}</TH>
            ))}
            <TH className="whitespace-normal text-right">Esperado por azar</TH>
          </TR>
        </THead>
        <TBody>
          {labels.map((l) => {
            const exp = strategies[0].prize_categories.find((c) => c.label === l)?.expected_by_chance;
            return (
              <TR key={l}>
                <TD className="font-semibold">{l}</TD>
                {strategies.map((s) => (
                  <TD key={s.strategy} className="text-right tabular-nums">{fmtInt(s.prize_categories.find((c) => c.label === l)?.times)}</TD>
                ))}
                <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(exp, 2)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Section>
  );
}

function LiveSection({ live }: { live: TrackRecord["live"] }) {
  return (
    <Section
      title="Sorteos reales desde que se publican predicciones"
      description="La combinación sugerida comparada con el resultado real de cada sorteo."
    >
      {live.draws === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Aún no hay sorteos reales para comparar"
          description="Desde que se publicó la predicción actual no se ha registrado ningún sorteo nuevo. Cada vez que se registre uno, aquí aparecerá la combinación sugerida junto al resultado real y cuántos números coincidieron."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Sorteos comparados" value={fmtInt(live.draws)} />
            <MiniStat
              label="Números acertados en promedio"
              value={fmtNum(live.average_matches, 2)}
              sub={live.expected_average_by_chance !== null ? `Por azar: ${fmtNum(live.expected_average_by_chance, 2)}` : undefined}
            />
            <MiniStat label="Súper Número acertado" value={fmtInt(live.super_hits)} sub={`Con algún premio: ${fmtInt(live.with_prize)}`} />
          </div>
          <ul className="divide-y" data-testid="live-items">
            {live.items.map((it) => (
              <li key={it.prediction_id + it.target_date} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium first-letter:uppercase">{fmtDateHuman(it.target_date)}</span>
                  {it.category ? <Badge variant="success">Premio {it.category}</Badge> : <Badge variant="secondary">Sin premio</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{evaluationText(it)}</p>
                <MatchComparison suggested={it.suggested} actual={it.actual} superHit={it.super_hit} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
