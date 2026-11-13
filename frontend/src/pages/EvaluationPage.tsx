import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ClipboardCheck, FlaskConical, Play } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useAuth } from "@/hooks/auth";
import { useJobTracker } from "@/hooks/jobs";
import { mutations, useBacktest, useBacktestTargets, useBacktests } from "@/api/hooks";
import { errorMessage } from "@/api/client";
import type { Backtest, BacktestSummary, GameCode, NumbersBacktestSummary } from "@/api/types";
import { isNumbersSummary } from "@/api/types";
import { DrawNumbers, EmptyState, ErrorState, KeyValue, LoadingBlock, PageHeader, QueryState, Section } from "@/components/common";
import { ObservedExpectedChart } from "@/components/charts/charts";
import { LEGACY_LABEL } from "@/components/predictions/PredictionParts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Segmented } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VARIABLE_LABELS, VERDICT_LABEL, fmtDate, fmtDateTime, fmtInt, fmtNum, fmtP, fmtPct, strategyLabel } from "@/lib/format";
import type { Variable } from "@/api/types";

export default function EvaluationPage() {
  const { game } = useGame();
  const { isAdmin } = useAuth();
  const list = useBacktests(game);
  const [sp, setSp] = useSearchParams();
  const btParam = sp.get("bt");
  const selected = btParam && list.data?.some((b) => b.id === btParam) ? btParam : list.data?.[0]?.id ?? null;
  const select = (id: string) => setSp((cur) => { const n = new URLSearchParams(cur); n.set("bt", id); return n; }, { replace: true });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardCheck}
        title="Evaluación técnica"
        description="Simulación histórica (walk-forward): cada sorteo se predice solo con los anteriores y se compara cada método con el azar, con pruebas estadísticas corregidas por comparaciones múltiples."
        actions={isAdmin && <NewBacktestDialog game={game} onCreated={select} />}
      />
      {list.isLoading ? (
        <LoadingBlock height={120} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data?.length ? (
        <EmptyState icon={FlaskConical} title="No hay evaluaciones para este juego" description={isAdmin ? "Lance una con “Nueva evaluación”." : "Un administrador debe ejecutarla."} />
      ) : (
        <>
          <BacktestList items={list.data} selected={selected} onSelect={select} />
          {selected && <BacktestDetail id={selected} />}
        </>
      )}
    </div>
  );
}

function btStatus(s: string) {
  if (s === "completed") return <Badge variant="success">Completado</Badge>;
  if (s === "failed") return <Badge variant="destructive">Fallido</Badge>;
  return <Badge variant="warning">{s}</Badge>;
}

function formatBadge(f?: string) {
  return f === "numbers_v1" ? <Badge variant="default">Actual</Badge> : <Badge variant="secondary">Formato anterior</Badge>;
}

function BacktestList({ items, selected, onSelect }: { items: Backtest[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <Section title="Evaluaciones ejecutadas">
      <Table>
        <THead>
          <TR>
            <TH>Inicio</TH>
            <TH>Estado</TH>
            <TH>Formato</TH>
            <TH className="text-right">Sorteos</TH>
            <TH>Histórico / config.</TH>
            <TH>Conclusión</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {items.map((b) => (
            <TR key={b.id} data-state={b.id === selected ? "selected" : undefined} className="cursor-pointer" onClick={() => onSelect(b.id)}>
              <TD className="whitespace-nowrap text-xs">{fmtDateTime(b.started_at)}</TD>
              <TD>{btStatus(b.status)}</TD>
              <TD>{formatBadge(b.format)}</TD>
              <TD className="text-right">{fmtInt(b.draws)}</TD>
              <TD className="text-xs">v{b.historical_version} / v{b.configuration_version}</TD>
              <TD className="max-w-md truncate text-xs text-muted-foreground" title={b.conclusion ?? b.error ?? ""}>{b.conclusion ?? b.error ?? "—"}</TD>
              <TD className="text-right">
                <Button size="sm" variant={b.id === selected ? "secondary" : "ghost"}>{b.id === selected ? "Seleccionada" : "Ver"}</Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Section>
  );
}

function BacktestDetail({ id }: { id: string }) {
  const q = useBacktest(id);
  return (
    <QueryState query={q} loadingHeight={400}>
      {(b) =>
        b.status !== "completed" || !b.summary ? (
          <Alert variant={b.status === "failed" ? "destructive" : "info"} title={b.status === "failed" ? "La evaluación falló" : "Evaluación en curso"}>
            {b.error ?? "Los resultados aparecerán cuando termine el trabajo."}
          </Alert>
        ) : isNumbersSummary(b.summary) ? (
          <NumbersSummaryView b={b} s={b.summary} />
        ) : (
          <LegacySummaryView b={b} s={b.summary} />
        )
      }
    </QueryState>
  );
}

function verdictBadge(v: string) {
  const variant = v === "mejor_que_el_azar" ? "success" : v === "referencia" ? "outline" : "secondary";
  return <Badge variant={variant}>{VERDICT_LABEL[v] ?? v}</Badge>;
}

function NumbersSummaryView({ b, s }: { b: Backtest; s: NumbersBacktestSummary }) {
  const [sel, setSel] = React.useState<string>(s.official_strategy);
  const cur = s.strategies.find((x) => x.strategy === sel) ?? s.strategies[0];
  return (
    <div className="space-y-4">
      <Alert variant="info" title={s.conclusion}>
        <span className="text-foreground">{s.headline}</span>
      </Alert>
      <Section title="Parámetros">
        <KeyValue
          items={[
            ["Sorteos evaluados", fmtInt(s.draws)],
            ["Periodo", `${fmtDate(s.first_date)} – ${fmtDate(s.last_date)}`],
            ["Entrenamiento mínimo", `${fmtInt(s.min_train)} sorteos`],
            ["Semilla", String(s.seed)],
            ["Histórico / configuración", `v${s.historical_version ?? b.historical_version} / v${s.configuration_version ?? b.configuration_version}`],
            ["Método oficial", strategyLabel(s.official_strategy)],
            ["Duración", b.finished_at ? `${fmtDateTime(b.started_at)} → ${fmtDateTime(b.finished_at)}` : "—"],
          ]}
        />
      </Section>
      <Section
        title="Resultados por método"
        description="Aciertos (números en cualquier orden) y Súper Número frente a lo esperado por azar. p = prueba frente al azar; Holm = corregido por comparaciones múltiples."
      >
        <Table>
          <THead>
            <TR>
              <TH>Método</TH>
              <TH className="text-right">Aciertos prom.</TH>
              <TH className="text-right">Azar</TH>
              <TH className="text-right">p</TH>
              <TH className="text-right">p Holm</TH>
              <TH className="text-right">SB</TH>
              <TH className="text-right">SB azar</TH>
              <TH className="text-right">p SB</TH>
              <TH className="text-right">p Holm SB</TH>
              <TH className="text-right">Con premio</TH>
              <TH className="text-right">Azar</TH>
              <TH>Veredicto</TH>
            </TR>
          </THead>
          <TBody>
            {s.strategies.map((r) => (
              <TR key={r.strategy}>
                <TD className="text-xs">
                  <span className="font-medium">{strategyLabel(r.strategy)}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{r.strategy}</span>
                </TD>
                <TD className="text-right font-mono text-xs">{fmtNum(r.average_matches, 4)}</TD>
                <TD className="text-right font-mono text-xs text-muted-foreground">{fmtNum(r.expected_average_by_chance, 4)}</TD>
                <TD className="text-right font-mono text-xs">{fmtP(r.p_value_matches)}</TD>
                <TD className="text-right font-mono text-xs">{fmtP(r.p_holm_matches)}</TD>
                <TD className="text-right font-mono text-xs">{fmtInt(r.super_hits)}</TD>
                <TD className="text-right font-mono text-xs text-muted-foreground">{fmtNum(r.super_hits_expected_by_chance, 2)}</TD>
                <TD className="text-right font-mono text-xs">{fmtP(r.p_value_super)}</TD>
                <TD className="text-right font-mono text-xs">{fmtP(r.p_holm_super)}</TD>
                <TD className="text-right font-mono text-xs">{fmtInt(r.draws_with_prize)}</TD>
                <TD className="text-right font-mono text-xs text-muted-foreground">{fmtNum(r.draws_with_prize_expected, 2)}</TD>
                <TD>{verdictBadge(r.verdict)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
      {cur && (
        <Section
          title="Distribución de aciertos"
          actions={
            <Segmented size="sm" value={cur.strategy} onChange={setSel} ariaLabel="Método"
              options={s.strategies.map((x) => ({ value: x.strategy, label: strategyLabel(x.strategy, true) }))} />
          }
        >
          <ObservedExpectedChart
            categories={cur.matches_distribution.map((_, i) => String(i))}
            observed={cur.matches_distribution}
            expected={cur.matches_distribution_expected}
            xName="Números acertados"
            fmt={(v) => fmtNum(v, Number.isInteger(v) ? 0 : 2)}
          />
          <Table className="mt-3">
            <THead>
              <TR>
                <TH>Categoría</TH>
                <TH className="text-right">Veces</TH>
                <TH className="text-right">Esperado por azar</TH>
              </TR>
            </THead>
            <TBody>
              {cur.prize_categories.map((c) => (
                <TR key={c.label}>
                  <TD className="font-medium">{c.label}</TD>
                  <TD className="text-right tabular-nums">{fmtInt(c.times)}</TD>
                  <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(c.expected_by_chance, 2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
      <TargetsTable id={b.id} strategies={s.strategies.map((x) => x.strategy)} initial={s.official_strategy} />
    </div>
  );
}

function TargetsTable({ id, strategies, initial }: { id: string; strategies: string[]; initial: string }) {
  const [model, setModel] = React.useState(initial);
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [model, id]);
  const q = useBacktestTargets(id, model, page);
  const rows = q.data ?? [];
  return (
    <Section
      title="Detalle por sorteo"
      description="Combinación que habría jugado el método y resultado real."
      actions={<Segmented size="sm" value={model} onChange={setModel} ariaLabel="Método" options={strategies.map((x) => ({ value: x, label: strategyLabel(x, true) }))} />}
    >
      <QueryState query={q} loadingHeight={200} isEmpty={(d) => d.length === 0 && page === 1} empty={<EmptyState title="Sin detalle almacenado" />}>
        {() => (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Jugada</TH>
                  <TH>Resultado</TH>
                  <TH className="text-right">Aciertos</TH>
                  <TH>Premio</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const hits = (r.results.numbers ?? []).filter((n) => r.results.actual?.includes(n));
                  return (
                    <TR key={r.target_date}>
                      <TD className="whitespace-nowrap text-xs">{fmtDate(r.target_date)}</TD>
                      <TD><DrawNumbers numbers={r.results.numbers ?? []} sn={r.results.super_number} highlight={hits} snHighlight={r.results.super_hit} /></TD>
                      <TD><DrawNumbers numbers={r.results.actual ?? []} sn={r.results.actual_super} /></TD>
                      <TD className="text-right tabular-nums">{r.results.matches ?? "—"}{r.results.super_hit ? " + SB" : ""}</TD>
                      <TD className="text-xs">{r.results.category ?? "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <div className="flex justify-end gap-2 pt-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span className="self-center text-xs tabular-nums text-muted-foreground">Página {page}</span>
              <Button size="sm" variant="outline" disabled={rows.length < 25} onClick={() => setPage(page + 1)}>Siguiente</Button>
            </div>
          </>
        )}
      </QueryState>
    </Section>
  );
}

/** Vista mínima para evaluaciones del formato anterior (por posición). */
function LegacySummaryView({ b, s }: { b: Backtest; s: BacktestSummary }) {
  const k = String(s.top_ks?.includes(5) ? 5 : s.top_ks?.[s.top_ks.length - 1] ?? "");
  return (
    <div className="space-y-4">
      <Alert variant="warning" title={LEGACY_LABEL}>
        <span className="text-foreground">{s.conclusion}</span>
      </Alert>
      <Section title="Parámetros">
        <KeyValue
          items={[
            ["Sorteos objetivo", fmtInt(s.n_targets)],
            ["Periodo evaluado", `${fmtDate(s.first_target_date)} – ${fmtDate(s.last_target_date)}`],
            ["Entrenamiento mínimo", `${fmtInt(s.min_train)} sorteos`],
            ["Semilla", String(s.seed)],
            ["Histórico / configuración", `v${s.historical_version ?? b.historical_version} / v${s.configuration_version ?? b.configuration_version}`],
          ]}
        />
      </Section>
      {!!s.rows?.length && (
        <Section title={`Resultados por modelo y posición (top-${k})`}>
          <Table>
            <THead>
              <TR>
                <TH>Modelo</TH>
                <TH>Posición</TH>
                <TH className="text-right">Tasa top-{k}</TH>
                <TH className="text-right">Esperada</TH>
                <TH className="text-right">p Holm</TH>
                <TH>Veredicto</TH>
              </TR>
            </THead>
            <TBody>
              {s.rows.map((r) => {
                const t = r.top_k?.[k];
                return (
                  <TR key={`${r.model}-${r.variable}`}>
                    <TD className="font-mono text-xs">{r.model}</TD>
                    <TD className="text-xs">{VARIABLE_LABELS[r.variable as Variable] ?? r.variable}</TD>
                    <TD className="text-right font-mono text-xs">{fmtPct(t?.rate)}</TD>
                    <TD className="text-right font-mono text-xs text-muted-foreground">{fmtPct(t?.expected_rate_under_null)}</TD>
                    <TD className="text-right font-mono text-xs">{fmtP(t?.p_holm ?? t?.p_value)}</TD>
                    <TD><Badge variant="secondary">{VERDICT_LABEL[r.verdict] ?? r.verdict}</Badge></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Section>
      )}
    </div>
  );
}

const btSchema = z.object({
  min_train: z.coerce.number().int().min(10, "Mínimo 10"),
  seed: z.coerce.number().int(),
});

function NewBacktestDialog({ game, onCreated }: { game: GameCode; onCreated: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const { track } = useJobTracker();
  const form = useForm<z.input<typeof btSchema>, unknown, z.output<typeof btSchema>>({
    resolver: zodResolver(btSchema),
    defaultValues: { min_train: 100, seed: 20240101 },
  });
  const [error, setError] = React.useState<string | null>(null);
  const submit = form.handleSubmit(async (v) => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setError(null);
    try {
      const r = await mutations.createBacktest(game, { min_train: v.min_train, seed: v.seed });
      track(r.job_id, `Evaluación ${game}`, game);
      toast.success("Evaluación lanzada");
      onCreated(r.backtest_id);
      setOpen(false);
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    }
  });
  const errs = form.formState.errors;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Play /> Nueva evaluación
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); setConfirm(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva evaluación · {game}</DialogTitle>
            <DialogDescription>Se ejecuta en segundo plano con la configuración activa. Los resultados quedan registrados.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3" noValidate>
            {error && <Alert variant="destructive" title={error} />}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entrenamiento mínimo (sorteos)" htmlFor="bt-min" error={errs.min_train?.message}>
                <Input id="bt-min" type="number" {...form.register("min_train")} />
              </Field>
              <Field label="Semilla" htmlFor="bt-seed" error={errs.seed?.message}>
                <Input id="bt-seed" type="number" {...form.register("seed")} />
              </Field>
            </div>
            {confirm && (
              <Alert variant="warning" title="¿Confirmar ejecución?">
                Pulse “Confirmar y lanzar” para crear la evaluación. Se registrará en la auditoría.
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>{confirm ? "Confirmar y lanzar" : "Continuar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

