import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { GitBranch, History as HistoryIcon, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useAuth } from "@/hooks/auth";
import { useJobTracker } from "@/hooks/jobs";
import { mutations, useDrawHistory, useDraws, useInvalidateGame, useRules, useVersions, type DrawFilters } from "@/api/hooks";
import { errorMessage } from "@/api/client";
import type { Draw, GameCode, HistoryChangeOut, Rules } from "@/api/types";
import {
  DrawNumbers, EmptyState, ErrorState, HashText, LoadingBlock, PageHeader, Pagination, QueryState,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { WEEKDAYS, fmtDate, fmtDateTime, fmtInt } from "@/lib/format";

const PAGE_SIZE = 25;

export default function HistoryPage() {
  const { game } = useGame();
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-5">
      <PageHeader
        icon={HistoryIcon}
        title="Histórico de sorteos"
        description="Todos los resultados registrados, del más reciente al más antiguo. Puede buscar por fecha, día o número."
      />
      {!isAdmin ? (
        <DrawsTable game={game} isAdmin={false} />
      ) : (
      <Tabs defaultValue="draws">
        <TabsList>
          <TabsTrigger value="draws">Sorteos</TabsTrigger>
          <TabsTrigger value="versions">Versiones del histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="draws">
          <DrawsTable game={game} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsList game={game} />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}

interface FilterDraft {
  start: string;
  end: string;
  weekday: string;
  number: string;
  order: "desc" | "asc";
}
const EMPTY: FilterDraft = { start: "", end: "", weekday: "all", number: "", order: "desc" };

function DrawsTable({ game, isAdmin }: { game: GameCode; isAdmin: boolean }) {
  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY);
  const [applied, setApplied] = React.useState<FilterDraft>(EMPTY);
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [game, applied]);

  const filters: DrawFilters = {
    start: applied.start || undefined,
    end: applied.end || undefined,
    weekday: applied.weekday !== "all" ? parseInt(applied.weekday, 10) : undefined,
    number: applied.number ? parseInt(applied.number, 10) : undefined,
    order: applied.order,
    page,
    page_size: PAGE_SIZE,
  };
  const q = useDraws(game, filters);
  const rules = useRules(game);
  const [chainFor, setChainFor] = React.useState<Draw | null>(null);
  const [editing, setEditing] = React.useState<{ mode: "add" | "correct"; draw?: Draw } | null>(null);
  const [deleting, setDeleting] = React.useState<Draw | null>(null);
  const highlight = filters.number !== undefined ? [filters.number] : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 pt-4 sm:pt-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(draft);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-start">Desde</Label>
            <Input id="f-start" type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-end">Hasta</Label>
            <Input id="f-end" type="date" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <Label htmlFor="f-wd">Día</Label>
            <SimpleSelect
              id="f-wd"
              value={draft.weekday}
              onChange={(v) => setDraft({ ...draft, weekday: v })}
              options={[{ value: "all", label: "Todos" }, ...WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))]}
            />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="f-num">Contiene número</Label>
            <Input id="f-num" type="number" min={1} value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} placeholder="Ej. 7" />
          </div>
          <div className="flex w-36 flex-col gap-1.5">
            <Label htmlFor="f-ord">Orden</Label>
            <SimpleSelect
              id="f-ord"
              value={draft.order}
              onChange={(v) => setDraft({ ...draft, order: v })}
              options={[{ value: "desc", label: "Más recientes" }, { value: "asc", label: "Más antiguos" }]}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">Filtrar</Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
              }}
            >
              <RotateCcw /> Limpiar
            </Button>
          </div>
          {isAdmin && (
            <Button type="button" size="sm" className="ml-auto" onClick={() => setEditing({ mode: "add" })}>
              <Plus /> Agregar sorteo
            </Button>
          )}
        </form>
        {filters.number !== undefined && (
          <p className="text-xs text-muted-foreground">El filtro por número busca en las cinco posiciones y en el Súper Número.</p>
        )}

        <QueryState query={q} loadingHeight={400}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState title="No hay sorteos con estos filtros" description="Ajuste el rango de fechas, el día o el número." />
            ) : (
              <>
                <div className={q.isFetching ? "opacity-70 transition-opacity" : ""}>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Fecha</TH>
                        <TH className="hidden sm:table-cell">Día</TH>
                        <TH className="hidden text-right md:table-cell">Sorteo</TH>
                        <TH>Números + Súper Número</TH>
                        {isAdmin && <TH className="hidden lg:table-cell">Versión</TH>}
                        {isAdmin && <TH className="text-right">Acciones</TH>}
                      </TR>
                    </THead>
                    <TBody>
                      {d.items.map((r) => (
                        <TR key={r.id}>
                          <TD className="whitespace-nowrap font-medium">
                            {fmtDate(r.draw_date)}
                            <span className="block text-[11px] font-normal text-muted-foreground sm:hidden">{WEEKDAYS[r.weekday]}</span>
                          </TD>
                          <TD className="hidden text-muted-foreground sm:table-cell">{WEEKDAYS[r.weekday]}</TD>
                          <TD className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{r.draw_number ?? "—"}</TD>
                          <TD>
                            <DrawNumbers numbers={r.numbers} sn={r.super_number} highlight={highlight} />
                          </TD>
                          {isAdmin && (
                          <TD className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                            desde v{r.valid_from_version}
                            {r.supersedes_id && <Badge variant="warning" className="ml-1">corregido</Badge>}
                          </TD>
                          )}
                          {isAdmin && (
                          <TD className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setChainFor(r)} aria-label="Ver cadena de correcciones" title="Cadena de correcciones">
                                <GitBranch />
                              </Button>
                              {isAdmin && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ mode: "correct", draw: r })} aria-label="Corregir" title="Corregir">
                                    <Pencil />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleting(r)} aria-label="Retirar" title="Retirar">
                                    <Trash2 />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TD>
                          )}
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={d.total} onPage={setPage} />
              </>
            )
          }
        </QueryState>
      </CardContent>
      <ChainDialog game={game} draw={chainFor} onClose={() => setChainFor(null)} />
      {editing && <DrawFormDialog game={game} rules={rules.data?.active ?? null} state={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDialog game={game} draw={deleting} onClose={() => setDeleting(null)} />}
    </Card>
  );
}

function ChainDialog({ game, draw, onClose }: { game: GameCode; draw: Draw | null; onClose: () => void }) {
  const q = useDrawHistory(game, draw?.id ?? null);
  return (
    <Dialog open={!!draw} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cadena de versiones del sorteo {draw && fmtDate(draw.draw_date)}</DialogTitle>
          <DialogDescription>De la versión más reciente a la original. Los registros reemplazados se conservan.</DialogDescription>
        </DialogHeader>
        <QueryState query={q} loadingHeight={120}>
          {(chain) => (
            <ol className="space-y-2">
              {chain.map((c, i) => (
                <li key={c.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={c.valid_to_version === null ? "success" : "secondary"}>
                        {c.valid_to_version === null ? "Vigente" : `Reemplazado en v${c.valid_to_version}`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ID {c.id} · válido desde v{c.valid_from_version}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{fmtDate(c.draw_date)}</span>
                  </div>
                  <div className="mt-2">
                    <DrawNumbers numbers={c.numbers} sn={c.super_number} />
                  </div>
                  {c.change_reason && <p className="mt-1.5 text-xs text-muted-foreground">Motivo: {c.change_reason}</p>}
                  {i === chain.length - 1 && chain.length === 1 && <p className="mt-1 text-xs text-muted-foreground">Sin correcciones registradas.</p>}
                </li>
              ))}
            </ol>
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

function makeDrawSchema(rules: Rules | null, needsReason: boolean) {
  const mainMin = rules?.main_min ?? 1;
  const mainMax = rules?.main_max ?? 99;
  const snMin = rules?.super_min ?? 1;
  const snMax = rules?.super_max ?? 99;
  const num = (lo: number, hi: number) =>
    z.coerce.number({ invalid_type_error: "Número" }).int("Entero").min(lo, `≥ ${lo}`).max(hi, `≤ ${hi}`);
  return z
    .object({
      draw_date: z.string().min(1, "Requerida"),
      n1: num(mainMin, mainMax),
      n2: num(mainMin, mainMax),
      n3: num(mainMin, mainMax),
      n4: num(mainMin, mainMax),
      n5: num(mainMin, mainMax),
      super_number: num(snMin, snMax),
      draw_number: z.string().optional(),
      reason: needsReason ? z.string().trim().min(5, "Mínimo 5 caracteres").max(500) : z.string().optional(),
    })
    .superRefine((v, ctx) => {
      const arr = [v.n1, v.n2, v.n3, v.n4, v.n5];
      if (rules?.main_unique && new Set(arr).size < 5) ctx.addIssue({ code: "custom", path: ["n5"], message: "Los números no pueden repetirse" });
    });
}

function DrawFormDialog({ game, rules, state, onClose }: { game: GameCode; rules: Rules | null; state: { mode: "add" | "correct"; draw?: Draw }; onClose: () => void }) {
  const correcting = state.mode === "correct";
  const schema = React.useMemo(() => makeDrawSchema(rules, correcting), [rules, correcting]);
  type Values = z.infer<typeof schema>;
  const d = state.draw;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: d
      ? { draw_date: d.draw_date, n1: d.numbers[0], n2: d.numbers[1], n3: d.numbers[2], n4: d.numbers[3], n5: d.numbers[4], super_number: d.super_number, draw_number: d.draw_number?.toString() ?? "", reason: "" }
      : { draw_date: "", draw_number: "", reason: "" },
  });
  const invalidate = useInvalidateGame();
  const { track } = useJobTracker();
  const [error, setError] = React.useState<string | null>(null);

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    const numbers = [v.n1, v.n2, v.n3, v.n4, v.n5];
    if (rules?.main_order === "sorted_asc") numbers.sort((a, b) => a - b);
    const body = { draw_date: v.draw_date, numbers, super_number: v.super_number, draw_number: v.draw_number ? parseInt(v.draw_number, 10) : null };
    try {
      const out: HistoryChangeOut = correcting && d
        ? await mutations.correctDraw(game, d.id, { ...body, reason: v.reason ?? "" })
        : await mutations.addDraw(game, body);
      toast.success(correcting ? "Sorteo corregido" : "Sorteo agregado", { description: `Nueva versión del histórico: v${out.version.version_number}` });
      if (out.publish_job_id) track(out.publish_job_id, `Publicación ${game}`, game);
      invalidate(game);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const errs = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{correcting ? `Corregir sorteo ${d ? fmtDate(d.draw_date) : ""}` : `Agregar sorteo · ${game}`}</DialogTitle>
          <DialogDescription>
            {correcting
              ? "La corrección crea una nueva versión del histórico y conserva el registro original. El motivo es obligatorio."
              : "El nuevo sorteo crea una nueva versión del histórico."}{" "}
            {rules ? `Rango principal ${rules.main_min ?? "?"}–${rules.main_max ?? "?"}, Súper Número ${rules.super_min ?? "?"}–${rules.super_max ?? "?"}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert variant="destructive" title="El backend rechazó la operación">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha del sorteo" htmlFor="d-date" error={errs.draw_date?.message}>
              <Input id="d-date" type="date" {...form.register("draw_date")} />
            </Field>
            <Field label="Número de sorteo (opcional)" htmlFor="d-num">
              <Input id="d-num" type="number" {...form.register("draw_number")} />
            </Field>
          </div>
          <div>
            <Label>Números principales</Label>
            <div className="mt-1.5 grid grid-cols-5 gap-2">
              {(["n1", "n2", "n3", "n4", "n5"] as const).map((k, i) => (
                <Input key={k} aria-label={`Número ${i + 1}`} type="number" className="text-center tabular-nums" {...form.register(k)} />
              ))}
            </div>
            {(["n1", "n2", "n3", "n4", "n5"] as const).map((k) => errs[k]?.message).filter(Boolean)[0] && (
              <p className="mt-1 text-[11px] text-destructive">{(["n1", "n2", "n3", "n4", "n5"] as const).map((k) => errs[k]?.message).filter(Boolean)[0]}</p>
            )}
            {rules?.main_order === "sorted_asc" && <p className="mt-1 text-[11px] text-muted-foreground">Se ordenarán de forma ascendente al guardar.</p>}
          </div>
          <Field label="Súper Número" htmlFor="d-sn" error={errs.super_number?.message} className="w-32">
            <Input id="d-sn" type="number" className="tabular-nums" {...form.register("super_number")} />
          </Field>
          {correcting && (
            <Field label="Motivo de la corrección" htmlFor="d-reason" error={errs.reason?.message}>
              <Textarea id="d-reason" rows={2} {...form.register("reason")} placeholder="Ej. Error de digitación verificado con el acta oficial" />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{correcting ? "Guardar corrección" : "Agregar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ game, draw, onClose }: { game: GameCode; draw: Draw; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const invalidate = useInvalidateGame();
  const { track } = useJobTracker();
  const ok = reason.trim().length >= 5;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retirar sorteo {fmtDate(draw.draw_date)}</DialogTitle>
          <DialogDescription>
            El sorteo deja de estar vigente en una nueva versión del histórico; el registro se conserva para auditoría. Esta operación recalcula
            estadísticas y puede publicar una nueva predicción.
          </DialogDescription>
        </DialogHeader>
        <DrawNumbers numbers={draw.numbers} sn={draw.super_number} />
        {error && <Alert variant="destructive" title={error} />}
        <Field label="Motivo (obligatorio)" htmlFor="del-reason" error={reason && !ok ? "Mínimo 5 caracteres" : undefined}>
          <Textarea id="del-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!ok}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const out = await mutations.deleteDraw(game, draw.id, reason.trim());
                toast.success("Sorteo retirado", { description: `Nueva versión v${out.version.version_number}` });
                if (out.publish_job_id) track(out.publish_job_id, `Publicación ${game}`, game);
                invalidate(game);
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Retirar sorteo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionsList({ game }: { game: GameCode }) {
  const q = useVersions(game);
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="Sin versiones" description="Importe un histórico para crear la primera versión." />;
  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <THead>
            <TR>
              <TH>Versión</TH>
              <TH>Tipo</TH>
              <TH>Descripción</TH>
              <TH className="text-right">Sorteos</TH>
              <TH>Cobertura</TH>
              <TH>Hash de contenido</TH>
              <TH>Creada</TH>
            </TR>
          </THead>
          <TBody>
            {q.data.map((v) => (
              <TR key={v.id}>
                <TD className="font-semibold">v{v.version_number}</TD>
                <TD>
                  <Badge variant="secondary">{v.change_type}</Badge>
                  {v.is_append_only && <Badge variant="outline" className="ml-1">solo anexos</Badge>}
                </TD>
                <TD className="max-w-xs truncate text-xs" title={v.description ?? ""}>{v.description ?? "—"}</TD>
                <TD className="text-right tabular-nums">{fmtInt(v.draw_count)}</TD>
                <TD className="whitespace-nowrap text-xs">{fmtDate(v.first_draw_date)} – {fmtDate(v.last_draw_date)}</TD>
                <TD><HashText value={v.content_hash} /></TD>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(v.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
