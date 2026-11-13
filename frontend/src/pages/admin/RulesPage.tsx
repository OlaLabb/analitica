import * as React from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Scale, Trash2 } from "lucide-react";
import { useGame } from "@/hooks/game";
import { mutations, useInvalidateGame, useRules } from "@/api/hooks";
import { ApiError, errorMessage } from "@/api/client";
import type { GameCode, Rules } from "@/api/types";
import { ErrorState, LoadingBlock, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { ChipToggleGroup, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { WEEKDAYS_SHORT, fmtDate, fmtDateTime } from "@/lib/format";

const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined || Number.isNaN(v) ? null : Number(v)), z.number().int().nullable());

const schema = z
  .object({
    name: z.string().trim().min(1, "Requerido").max(120),
    main_min: optInt,
    main_max: optInt,
    super_min: optInt,
    super_max: optInt,
    main_unique: z.enum(["true", "false", "unknown"]),
    main_order: z.enum(["sorted_asc", "draw_order", "unknown"]),
    weekdays_known: z.boolean(),
    draw_weekdays: z.array(z.number().int().min(0).max(6)),
    notes: z.string().max(4000).optional(),
    prize_categories: z.array(
      z.object({
        label: z.string().trim().min(1, "Requerido").max(40),
        matches: z.coerce.number().int().min(0).max(5),
        super: z.boolean(),
      }),
    ),
    prize_source: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.main_min === null) !== (v.main_max === null)) ctx.addIssue({ code: "custom", path: ["main_max"], message: "Indique mínimo y máximo juntos" });
    if ((v.super_min === null) !== (v.super_max === null)) ctx.addIssue({ code: "custom", path: ["super_max"], message: "Indique mínimo y máximo juntos" });
    if (v.main_min !== null && v.main_max !== null && v.main_min > v.main_max) ctx.addIssue({ code: "custom", path: ["main_max"], message: "Debe ser ≥ mínimo" });
    if (v.super_min !== null && v.super_max !== null && v.super_min > v.super_max) ctx.addIssue({ code: "custom", path: ["super_max"], message: "Debe ser ≥ mínimo" });
    if (v.main_unique === "true" && v.main_min !== null && v.main_max !== null && v.main_max - v.main_min + 1 < 5)
      ctx.addIssue({ code: "custom", path: ["main_max"], message: "El rango no admite 5 números distintos" });
    if (v.weekdays_known && v.draw_weekdays.length === 0) ctx.addIssue({ code: "custom", path: ["draw_weekdays"], message: "Seleccione al menos un día" });
    const seen = new Set<string>();
    v.prize_categories.forEach((c, i) => {
      const k = `${c.matches}-${c.super}`;
      if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["prize_categories", i, "label"], message: "Categoría repetida" });
      seen.add(k);
    });
  });
type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

function defaults(r: Rules | null): Values {
  return {
    name: r?.name ?? "",
    main_min: r?.main_min ?? null,
    main_max: r?.main_max ?? null,
    super_min: r?.super_min ?? null,
    super_max: r?.super_max ?? null,
    main_unique: r?.main_unique === true ? "true" : r?.main_unique === false ? "false" : "unknown",
    main_order: r?.main_order ?? "unknown",
    weekdays_known: !!r?.draw_weekdays?.length,
    draw_weekdays: r?.draw_weekdays ?? [],
    notes: r?.notes ?? "",
    prize_categories: (r?.prize_categories ?? []).map((c) => ({ label: c.label, matches: c.matches, super: c.super })),
    prize_source: r?.prize_source ?? "",
  };
}

const MATCH_OPTIONS = [0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} acierto${n === 1 ? "" : "s"}` }));

export default function RulesPage() {
  const { game } = useGame();
  const q = useRules(game);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Scale}
        title={`Reglas del juego · ${game}`}
        description="Las reglas determinan la referencia teórica de azar. Cada cambio crea una nueva versión; las anteriores se conservan. El backend rechaza reglas que no cumplan los sorteos vigentes."
      />
      {q.isLoading ? (
        <LoadingBlock height={360} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <RulesForm key={`${game}-${q.data?.active?.id ?? "none"}`} game={game} active={q.data?.active ?? null} />
          <Section title="Historial de versiones">
            <Table>
              <THead>
                <TR>
                  <TH>Versión</TH>
                  <TH>Nombre</TH>
                  <TH>Principales</TH>
                  <TH>Súper Número</TH>
                  <TH>Únicos</TH>
                  <TH>Orden</TH>
                  <TH>Días</TH>
                  <TH>Premios</TH>
                  <TH>Estado</TH>
                  <TH>Creada</TH>
                </TR>
              </THead>
              <TBody>
                {q.data?.history.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-semibold">v{r.version_number}{r.id === q.data?.active?.id && <Badge variant="success" className="ml-2">Activa</Badge>}</TD>
                    <TD className="max-w-[220px] truncate text-xs" title={r.notes ?? ""}>{r.name}</TD>
                    <TD className="text-xs">{r.main_min ?? "?"}–{r.main_max ?? "?"}</TD>
                    <TD className="text-xs">{r.super_min ?? "?"}–{r.super_max ?? "?"}</TD>
                    <TD className="text-xs">{r.main_unique === null ? "?" : r.main_unique ? "Sí" : "No"}</TD>
                    <TD className="text-xs">{r.main_order}</TD>
                    <TD className="text-xs">{r.draw_weekdays?.map((d) => WEEKDAYS_SHORT[d]).join(", ") ?? "?"}</TD>
                    <TD className="whitespace-nowrap text-xs" title={r.prize_categories?.map((c) => c.label).join(", ") ?? ""}>{r.prize_categories?.length ? `${r.prize_categories.length} categorías` : "—"}</TD>
                    <TD>{r.fully_confirmed ? <Badge variant="success">Confirmadas</Badge> : <Badge variant="warning">Parciales</Badge>}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Section>
        </>
      )}
    </div>
  );
}

function RulesForm({ game, active }: { game: GameCode; active: Rules | null }) {
  const form = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: defaults(active) });
  const [conflict, setConflict] = React.useState<{ message: string; examples: { draw_date: string; errors: string[] }[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Parsed | null>(null);
  const invalidate = useInvalidateGame();
  const errs = form.formState.errors;
  const weekdaysKnown = form.watch("weekdays_known");
  const prizes = useFieldArray({ control: form.control, name: "prize_categories" });

  const save = async (v: Parsed) => {
    setConflict(null);
    setError(null);
    try {
      const r = await mutations.setRules(game, {
        name: v.name,
        main_min: v.main_min,
        main_max: v.main_max,
        super_min: v.super_min,
        super_max: v.super_max,
        main_unique: v.main_unique === "unknown" ? null : v.main_unique === "true",
        main_order: v.main_order,
        draw_weekdays: v.weekdays_known ? [...v.draw_weekdays].sort() : null,
        notes: v.notes || null,
        prize_categories: v.prize_categories.length ? v.prize_categories : null,
        prize_source: v.prize_source?.trim() || null,
      });
      toast.success(`Reglas v${r.version_number} activadas`);
      invalidate(game);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.examples) {
        setConflict({ message: e.message, examples: e.examples as { draw_date: string; errors: string[] }[] });
      } else setError(errorMessage(e));
    }
  };

  return (
    <Section
      title={active ? `Nueva versión (activa: v${active.version_number})` : "Definir reglas"}
      description={active?.fully_confirmed ? "Las reglas activas están completamente confirmadas." : "Reglas incompletas: la referencia de azar se estima empíricamente."}
    >
      <form onSubmit={form.handleSubmit((v) => setPending(v))} className="space-y-4" noValidate>
        <Field label="Nombre" htmlFor="r-name" error={errs.name?.message}>
          <Input id="r-name" {...form.register("name")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Mínimo principal" htmlFor="r-mmin" error={errs.main_min?.message}>
            <Input id="r-mmin" type="number" {...form.register("main_min")} />
          </Field>
          <Field label="Máximo principal" htmlFor="r-mmax" error={errs.main_max?.message}>
            <Input id="r-mmax" type="number" {...form.register("main_max")} />
          </Field>
          <Field label="Mínimo Súper Número" htmlFor="r-smin" error={errs.super_min?.message}>
            <Input id="r-smin" type="number" {...form.register("super_min")} />
          </Field>
          <Field label="Máximo Súper Número" htmlFor="r-smax" error={errs.super_max?.message}>
            <Input id="r-smax" type="number" {...form.register("super_max")} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="¿Números principales distintos?" htmlFor="r-uniq">
            <Controller
              control={form.control}
              name="main_unique"
              render={({ field }) => (
                <SimpleSelect id="r-uniq" value={field.value} onChange={field.onChange}
                  options={[{ value: "true", label: "Sí, sin repetición" }, { value: "false", label: "No, pueden repetirse" }, { value: "unknown", label: "Desconocido" }]} />
              )}
            />
          </Field>
          <Field label="Orden publicado" htmlFor="r-order">
            <Controller
              control={form.control}
              name="main_order"
              render={({ field }) => (
                <SimpleSelect id="r-order" value={field.value} onChange={field.onChange}
                  options={[{ value: "sorted_asc", label: "Ascendente" }, { value: "draw_order", label: "Orden de extracción" }, { value: "unknown", label: "Desconocido" }]} />
              )}
            />
          </Field>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Controller control={form.control} name="weekdays_known" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
            Días de sorteo conocidos
          </label>
          {weekdaysKnown && (
            <Controller
              control={form.control}
              name="draw_weekdays"
              render={({ field }) => (
                <ChipToggleGroup<number> values={field.value} onChange={field.onChange} options={WEEKDAYS_SHORT.map((l, i) => ({ value: i, label: l }))} ariaLabel="Días de sorteo" />
              )}
            />
          )}
          {errs.draw_weekdays?.message && <p className="text-[11px] text-destructive">{errs.draw_weekdays.message}</p>}
        </div>
        <div className="space-y-2 rounded-lg border p-3" data-testid="prize-editor">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Categorías oficiales de premio</p>
              <p className="text-xs text-muted-foreground">
                Aciertos en cualquier orden, con o sin Súper Número, tal como aparecen en la tabla oficial. Se usan para calcular las probabilidades.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => prizes.append({ label: "", matches: 0, super: true })}>
              <Plus /> Agregar categoría
            </Button>
          </div>
          {prizes.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin categorías: no se mostrarán probabilidades por premio.</p>
          ) : (
            <ul className="space-y-2">
              {prizes.fields.map((f, i) => (
                <li key={f.id} className="flex flex-wrap items-end gap-2">
                  <Field label={i === 0 ? "Etiqueta" : ""} htmlFor={`pc-l-${i}`} error={errs.prize_categories?.[i]?.label?.message} className="w-28">
                    <Input id={`pc-l-${i}`} placeholder="4 + SB" aria-label={`Etiqueta categoría ${i + 1}`} {...form.register(`prize_categories.${i}.label`)} />
                  </Field>
                  <Field label={i === 0 ? "Aciertos" : ""} htmlFor={`pc-m-${i}`} className="w-36">
                    <Controller
                      control={form.control}
                      name={`prize_categories.${i}.matches`}
                      render={({ field }) => (
                        <SimpleSelect id={`pc-m-${i}`} ariaLabel={`Aciertos categoría ${i + 1}`} value={String(field.value)} onChange={(v) => field.onChange(Number(v))} options={MATCH_OPTIONS} />
                      )}
                    />
                  </Field>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <Controller
                      control={form.control}
                      name={`prize_categories.${i}.super`}
                      render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={`Con Súper Número categoría ${i + 1}`} />}
                    />
                    + Súper Número
                  </label>
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => prizes.remove(i)} aria-label={`Quitar categoría ${i + 1}`}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Fuente de la tabla de premios" htmlFor="r-psrc" hint="URL y fecha de consulta, p. ej. https://baloto.com/… (consultada 2026-11-13)">
            <Input id="r-psrc" {...form.register("prize_source")} />
          </Field>
        </div>
        <Field label="Notas / fuente" htmlFor="r-notes">
          <Textarea id="r-notes" rows={3} {...form.register("notes")} />
        </Field>
        {error && <Alert variant="destructive" title={error} />}
        {conflict && (
          <Alert variant="destructive" title={conflict.message}>
            <p className="mb-1">Ejemplos de sorteos vigentes que no cumplen las reglas propuestas:</p>
            <ul className="max-h-48 space-y-0.5 overflow-auto text-xs">
              {conflict.examples.map((x) => (
                <li key={x.draw_date}>
                  <span className="font-mono">{fmtDate(x.draw_date)}</span>: {x.errors.join("; ")}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { form.reset(defaults(active)); setConflict(null); setError(null); }}>Restablecer</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>Guardar nueva versión</Button>
        </div>
      </form>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Activar nuevas reglas"
        description="Se creará una nueva versión de reglas y se recalculará el snapshot estadístico del histórico. Las predicciones existentes no se modifican."
        confirmLabel="Activar"
        onConfirm={() => {
          const v = pending;
          setPending(null);
          if (v) void save(v);
        }}
      />
    </Section>
  );
}

