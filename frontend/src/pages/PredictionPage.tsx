import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, History, Info, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useAuth } from "@/hooks/auth";
import { useJobTracker } from "@/hooks/jobs";
import { mutations, useOfficialPrediction, usePrediction, usePredictionList, useSummary } from "@/api/hooks";
import { ApiError, errorMessage } from "@/api/client";
import type { GameCode, NumbersPrediction, Prediction, Rules } from "@/api/types";
import { isNumbersPrediction } from "@/api/types";
import { EmptyState, ErrorState, LoadingBlock, Pagination, Section, Warnings } from "@/components/common";
import { OddsTable } from "@/components/predictions/OddsTable";
import { SuggestedBalls } from "@/components/predictions/SuggestedBalls";
import {
  Collapsible, HistoryRowSummary, LegacyPredictionView, NumbersEvaluationCard, StatusBadge, TechnicalDetails,
} from "@/components/predictions/PredictionParts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fmtDateHuman, fmtDateTime } from "@/lib/format";

export default function PredictionPage() {
  const { game } = useGame();
  const { isAdmin } = useAuth();
  const official = useOfficialPrediction(game);
  const summary = useSummary(game);
  const notFound = official.error instanceof ApiError && official.error.status === 404;
  const gameName = summary.data?.game.name ?? game;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{gameName}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Predicción</h1>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            {official.data ? (
              <>Próximo sorteo: <strong className="font-medium text-foreground">{fmtDateHuman(official.data.target_date)}</strong></>
            ) : summary.data?.next_target_date ? (
              <>Próximo sorteo: <strong className="font-medium text-foreground">{fmtDateHuman(summary.data.next_target_date)}</strong></>
            ) : (
              <Skeleton className="h-4 w-48" />
            )}
          </div>
        </div>
        {isAdmin && <RecalculateButton game={game} nextDate={summary.data?.next_target_date ?? null} />}
      </div>

      {official.isLoading ? (
        <HeroSkeleton />
      ) : notFound ? (
        <EmptyState
          icon={Sparkles}
          title="Todavía no hay una predicción publicada"
          description={isAdmin ? "Use “Recalcular predicción” para generar la primera." : "Un administrador debe publicarla. Vuelva a intentarlo más tarde."}
        />
      ) : official.isError ? (
        <ErrorState error={official.error} onRetry={() => official.refetch()} />
      ) : official.data ? (
        isNumbersPrediction(official.data) ? (
          <OfficialView p={official.data} rules={summary.data?.rules ?? null} />
        ) : (
          <LegacyPredictionView p={official.data} />
        )
      ) : null}

      <PredictionHistory game={game} currentId={official.data?.id ?? null} />
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando predicción">
      <Card className="space-y-4 p-6">
        <Skeleton className="h-4 w-56" />
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-14 rounded-full sm:h-16 sm:w-16" />
          ))}
        </div>
        <Skeleton className="h-4 w-3/4" />
      </Card>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function OfficialView({ p, rules }: { p: NumbersPrediction; rules: Rules | null }) {
  const sug = p.combinations?.suggested;
  const odds = p.combinations?.odds;
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="space-y-5 p-5 sm:p-7">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Combinación sugerida para el sorteo del</p>
            <p className="text-lg font-semibold first-letter:uppercase">{fmtDateHuman(p.target_date)}</p>
          </div>
          {sug ? (
            <>
              <SuggestedBalls suggested={sug} main={p.candidates?.main} sn={p.candidates?.sn} />
              <p className="text-xs text-muted-foreground">Toque una balota para ver por qué está ahí y algunos datos de ese número.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Esta predicción no tiene una combinación sugerida.</p>
          )}
        </div>
        {(p.support_metrics.official_model_description || p.support_metrics.disclaimer) && (
          <div className="flex gap-3 border-t bg-muted/40 px-5 py-4 text-sm leading-relaxed sm:px-7">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1.5">
              {p.support_metrics.official_model_description && <p className="font-medium">{p.support_metrics.official_model_description}</p>}
              {p.support_metrics.disclaimer && <p className="text-muted-foreground">{p.support_metrics.disclaimer}</p>}
            </div>
          </div>
        )}
      </Card>

      {p.evaluation && (
        <Section title="Resultado del sorteo" description="El sorteo de esta predicción ya se jugó. Los números acertados están marcados en verde.">
          <NumbersEvaluationCard ev={p.evaluation} />
        </Section>
      )}

      <Warnings items={p.warnings} title="Avisos" />

      <Section
        title="Probabilidades reales"
        description="Se gana acertando cuántos de los 5 números salen, en cualquier orden, con o sin el Súper Número (SB). Son exactamente las mismas para cualquier combinación que juegue."
      >
        {odds ? (
          <OddsTable odds={odds} prizeCategories={rules?.prize_categories} prizeSource={rules?.prize_source} />
        ) : (
          <p className="text-sm text-muted-foreground">No hay probabilidades disponibles para esta predicción.</p>
        )}
        <p className="mt-4 text-sm">
          <Link to="/como-le-ha-ido" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <Trophy className="h-4 w-4" /> ¿Cómo le ha ido a este método frente al azar?
          </Link>
        </p>
      </Section>

      <Collapsible title="Detalles técnicos" testId="technical-details">
        <TechnicalDetails p={p} />
      </Collapsible>
    </div>
  );
}

function RecalculateButton({ game, nextDate }: { game: GameCode; nextDate: string | null }) {
  const { track } = useJobTracker();
  const [date, setDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw /> Recalcular predicción
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Recalcular predicción · {game}</AlertDialogTitle>
        <AlertDialogDescription>
          Se genera una nueva predicción con el histórico y la configuración vigentes. Si ya existe una para la misma fecha, la anterior queda
          marcada como reemplazada (se conserva en el historial).
        </AlertDialogDescription>
        <div className="space-y-1.5">
          <Label htmlFor="pub-date">Fecha del sorteo (opcional)</Label>
          <Input id="pub-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">Vacío = próximo sorteo{nextDate ? ` (${fmtDateHuman(nextDate)})` : ""}.</p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await mutations.publish(game, date || null);
                track(r.job_id, `Predicción ${game}`, game);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Recalcular
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PredictionHistory({ game, currentId }: { game: GameCode; currentId: string | null }) {
  const [page, setPage] = React.useState(1);
  const [openId, setOpenId] = React.useState<string | null>(null);
  React.useEffect(() => setPage(1), [game]);
  const q = usePredictionList(game, page, true);
  return (
    <Section
      title="Predicciones anteriores"
      description="Nunca se borran: al recalcular, la anterior queda marcada como reemplazada. Cuando se juega el sorteo se anota cuántos números se acertaron."
    >
      {q.isLoading ? (
        <LoadingBlock height={160} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={History} title="Aún no hay predicciones en el historial" />
      ) : (
        <>
          <ul className="divide-y" data-testid="prediction-history">
            {q.data.items.map((it) => (
              <li key={it.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium first-letter:uppercase">{fmtDateHuman(it.target_date)}</span>
                    <StatusBadge status={it.status} />
                    {it.id === currentId && <span className="text-[11px] text-primary">Es la que se muestra arriba</span>}
                  </div>
                  <HistoryRowSummary p={it} />
                </div>
                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                  <span className="text-[11px] text-muted-foreground">Generada {fmtDateTime(it.generated_at)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(it.id)}>
                    Ver detalle
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={20} total={q.data.total} onPage={setPage} />
        </>
      )}
      <PredictionDialog id={openId} onClose={() => setOpenId(null)} />
    </Section>
  );
}

function PredictionDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = usePrediction(id);
  const p: Prediction | undefined = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="first-letter:uppercase">{p ? `Sorteo del ${fmtDateHuman(p.target_date)}` : "Predicción"}</DialogTitle>
          <DialogDescription>{p ? <StatusBadge status={p.status} /> : "Cargando…"}</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <LoadingBlock height={200} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : p ? (
          isNumbersPrediction(p) ? (
            <div className="space-y-4">
              {p.combinations?.suggested && <SuggestedBalls suggested={p.combinations.suggested} main={p.candidates?.main} sn={p.candidates?.sn} size="lg" />}
              {p.evaluation ? (
                <NumbersEvaluationCard ev={p.evaluation} />
              ) : (
                <p className="text-sm text-muted-foreground">El sorteo de esta predicción aún no se ha registrado.</p>
              )}
              <Collapsible title="Detalles técnicos">
                <TechnicalDetails p={p} />
              </Collapsible>
            </div>
          ) : (
            <div className="space-y-4">
              <LegacyPredictionView p={p} />
              <Collapsible title="Detalles técnicos">
                <TechnicalDetails p={p} />
              </Collapsible>
            </div>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
