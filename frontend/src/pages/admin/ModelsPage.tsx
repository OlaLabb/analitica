import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Cog, Eye, Plus } from "lucide-react";
import { useGame } from "@/hooks/game";
import { mutations, useConfigurations, useModelsInfo } from "@/api/hooks";
import { errorMessage } from "@/api/client";
import type { GameCode, ModelConfiguration } from "@/api/types";
import { EmptyState, ErrorState, HashText, JsonView, LoadingBlock, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/misc";
import { SimpleSelect } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime, strategyLabel } from "@/lib/format";

export default function ModelsPage() {
  const { game } = useGame();
  const info = useModelsInfo();
  const cfgs = useConfigurations(game);
  const [viewing, setViewing] = React.useState<ModelConfiguration | null>(null);
  const [creatingFrom, setCreatingFrom] = React.useState<ModelConfiguration | null | undefined>(undefined);
  const qc = useQueryClient();
  const active = cfgs.data?.find((c) => c.is_active) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Cog}
        title={`Configuración de modelos · ${game}`}
        description="Versiones de parámetros del método de predicción. Activar una configuración afecta las próximas predicciones y evaluaciones; no altera predicciones ya publicadas. Las configuraciones del formato anterior se conservan solo como registro."
        actions={<Button size="sm" onClick={() => setCreatingFrom(active)} disabled={!cfgs.data}><Plus /> Nueva configuración</Button>}
      />
      <Section title="Métodos disponibles" description={info.data ? `Versión del algoritmo: ${info.data.algorithm_version}` : undefined}>
        {info.isLoading ? (
          <LoadingBlock height={120} />
        ) : info.isError ? (
          <ErrorState error={info.error} onRetry={() => info.refetch()} />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 md:grid-cols-3">
            {Object.entries({ azar: "Combinación elegida al azar respetando las reglas. Es el método oficial por defecto.", ...(info.data?.available_model_types ?? {}) }).map(([k, d]) => (
              <div key={k} className="rounded-md border p-2.5">
                <dt className="text-sm font-semibold">{strategyLabel(k)} <span className="font-mono text-[10px] font-normal text-muted-foreground">{k}</span></dt>
                <dd className="text-xs text-muted-foreground">{d}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>
      <Section title="Versiones de configuración">
        {cfgs.isLoading ? (
          <LoadingBlock height={140} />
        ) : cfgs.isError ? (
          <ErrorState error={cfgs.error} onRetry={() => cfgs.refetch()} />
        ) : !cfgs.data?.length ? (
          <EmptyState title="Sin configuraciones" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Versión</TH>
                <TH>Nombre</TH>
                <TH>Método oficial</TH>
                <TH>Hash</TH>
                <TH>Estado</TH>
                <TH>Notas</TH>
                <TH>Creada</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {cfgs.data.map((c) => (
                <TR key={c.id}>
                  <TD className="font-semibold">v{c.version_number}</TD>
                  <TD>{c.name}</TD>
                  <TD className="text-xs">
                    {isNumbersConfig(c.params) ? strategyLabel(String(c.params.official_model ?? "azar"), true) : <Badge variant="secondary">Formato anterior</Badge>}
                  </TD>
                  <TD><HashText value={c.config_hash} /></TD>
                  <TD>{c.is_active ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TD>
                  <TD className="max-w-[200px] truncate text-xs text-muted-foreground">{c.notes ?? "—"}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(c.created_at)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(c)}><Eye /> Ver JSON</Button>
                      <Button size="sm" variant="ghost" onClick={() => setCreatingFrom(c)}>Duplicar</Button>
                      {!c.is_active && isNumbersConfig(c.params) && (
                        <ConfirmDialog
                          trigger={<Button size="sm" variant="outline">Activar</Button>}
                          title={`Activar configuración v${c.version_number}`}
                          description="Las próximas publicaciones oficiales y backtests usarán estos parámetros. Las predicciones ya publicadas no cambian."
                          confirmLabel="Activar"
                          onConfirm={async () => {
                            try {
                              await mutations.activateConfig(game, c.id);
                              toast.success(`Configuración v${c.version_number} activada`);
                              qc.invalidateQueries({ queryKey: ["configurations", game] });
                            } catch (e) {
                              toast.error(errorMessage(e));
                            }
                          }}
                        />
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Configuración v{viewing?.version_number} · {viewing?.name}</DialogTitle>
            <DialogDescription>Parámetros completos tal como los almacena el backend.</DialogDescription>
          </DialogHeader>
          {viewing && <JsonView value={viewing.params} className="max-h-[60vh]" />}
        </DialogContent>
      </Dialog>
      {creatingFrom !== undefined && <CreateConfigDialog game={game} base={creatingFrom} onClose={() => setCreatingFrom(undefined)} />}
    </div>
  );
}

const DEFAULT_SCOPE = { mode: "all", n: null, start: null, end: null, years: null, months: null, weekdays: null, anchor: "last_draw" };

/** Valores por defecto de NumbersConfig (backend/app/engine/numbers.py). */
export const NUMBERS_DEFAULTS = {
  official_model: "azar" as const,
  recent_window: 100,
  prior_strength: 43,
  top_main: 10,
  top_super: 5,
  backtest_min_train: 100,
};

export const OFFICIAL_MODEL_OPTIONS = [
  { value: "azar", label: "Combinación al azar (recomendado)" },
  { value: "frecuencia_historica", label: "Números que más han salido" },
  { value: "frecuencia_reciente", label: "Números que más han salido últimamente" },
] as const;

const cfgSchema = z.object({
  name: z.string().trim().min(1, "Requerido").max(120),
  notes: z.string().max(2000).optional(),
  official_model: z.enum(["azar", "frecuencia_historica", "frecuencia_reciente"]),
  recent_window: z.coerce.number().int("Entero").min(5, "Mínimo 5").max(5000, "Máximo 5000"),
  prior_strength: z.coerce.number().min(0, "Debe ser ≥ 0"),
  top_main: z.coerce.number().int("Entero").min(5, "Mínimo 5").max(43, "Máximo 43"),
  top_super: z.coerce.number().int("Entero").min(1, "Mínimo 1").max(16, "Máximo 16"),
  backtest_min_train: z.coerce.number().int("Entero").min(10, "Mínimo 10"),
  data_scope: z.string().refine((v) => {
    try {
      const o = JSON.parse(v);
      return !!o && typeof o === "object" && !Array.isArray(o);
    } catch {
      return false;
    }
  }, "Debe ser un objeto JSON válido"),
});
type CfgIn = z.input<typeof cfgSchema>;
type CfgOut = z.output<typeof cfgSchema>;

export function isNumbersConfig(params: Record<string, unknown> | null | undefined): boolean {
  return params?.format === "numbers_v1";
}

function cfgDefaults(base: ModelConfiguration | null): CfgIn {
  const p = base && isNumbersConfig(base.params) ? (base.params as Record<string, unknown>) : {};
  const num = (k: keyof typeof NUMBERS_DEFAULTS) => (typeof p[k] === "number" ? (p[k] as number) : (NUMBERS_DEFAULTS[k] as number));
  const om = p.official_model;
  return {
    name: base ? `${base.name} (copia)` : "",
    notes: "",
    official_model: om === "frecuencia_historica" || om === "frecuencia_reciente" ? om : "azar",
    recent_window: num("recent_window"),
    prior_strength: num("prior_strength"),
    top_main: num("top_main"),
    top_super: num("top_super"),
    backtest_min_train: num("backtest_min_train"),
    data_scope: JSON.stringify(p.data_scope ?? DEFAULT_SCOPE, null, 2),
  };
}

export function toNumbersParams(v: CfgOut): Record<string, unknown> {
  return {
    format: "numbers_v1",
    official_model: v.official_model,
    recent_window: v.recent_window,
    prior_strength: v.prior_strength,
    top_main: v.top_main,
    top_super: v.top_super,
    backtest_min_train: v.backtest_min_train,
    data_scope: JSON.parse(v.data_scope),
  };
}

function CreateConfigDialog({ game, base, onClose }: { game: GameCode; base: ModelConfiguration | null; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<CfgIn, unknown, CfgOut>({ resolver: zodResolver(cfgSchema), defaultValues: cfgDefaults(base) });
  const [activate, setActivate] = React.useState(false);
  const [pending, setPending] = React.useState<CfgOut | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const errs = form.formState.errors;
  const legacyBase = !!base && !isNumbersConfig(base.params);

  const save = async (v: CfgOut) => {
    setError(null);
    try {
      const r = await mutations.createConfig(game, { name: v.name.trim(), params: toNumbersParams(v), activate, notes: v.notes || null });
      toast.success(`Configuración v${r.version_number} creada${r.is_active ? " y activada" : ""}`);
      qc.invalidateQueries({ queryKey: ["configurations", game] });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const onSubmit = form.handleSubmit((v) => (activate ? setPending(v) : save(v)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva configuración · {game}</DialogTitle>
          <DialogDescription>Parámetros del método de predicción (formato actual: números en cualquier orden). El backend valida los valores y rechaza configuraciones inválidas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {legacyBase && <Alert variant="info" title="La configuración base es del formato anterior; se parte de los valores por defecto." />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="c-name" error={errs.name?.message}><Input id="c-name" {...form.register("name")} /></Field>
            <Field label="Notas" htmlFor="c-notes"><Input id="c-notes" {...form.register("notes")} /></Field>
          </div>
          <Field label="Método oficial" htmlFor="c-model" hint="Decide qué combinación se publica como sugerida.">
            <Controller
              control={form.control}
              name="official_model"
              render={({ field }) => (
                <SimpleSelect id="c-model" value={field.value} onChange={field.onChange} options={OFFICIAL_MODEL_OPTIONS.map((o) => ({ ...o }))} />
              )}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ventana reciente (sorteos)" htmlFor="c-rw" error={errs.recent_window?.message}><Input id="c-rw" type="number" {...form.register("recent_window")} /></Field>
            <Field label="Suavizado (prior_strength)" htmlFor="c-ps" error={errs.prior_strength?.message}><Input id="c-ps" type="number" step="any" {...form.register("prior_strength")} /></Field>
            <Field label="Entrenamiento mínimo (evaluación)" htmlFor="c-bt" error={errs.backtest_min_train?.message}><Input id="c-bt" type="number" {...form.register("backtest_min_train")} /></Field>
            <Field label="Números a listar" htmlFor="c-tm" error={errs.top_main?.message}><Input id="c-tm" type="number" {...form.register("top_main")} /></Field>
            <Field label="Súper Números a listar" htmlFor="c-ts" error={errs.top_super?.message}><Input id="c-ts" type="number" {...form.register("top_super")} /></Field>
          </div>
          <Field label="Datos a usar (data_scope, JSON)" htmlFor="c-scope" error={errs.data_scope?.message}>
            <Textarea id="c-scope" rows={6} spellCheck={false} className="font-mono text-xs" {...form.register("data_scope")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={activate} onCheckedChange={setActivate} /> Activar al crear
          </label>
          {error && <Alert variant="destructive" title="El backend rechazó la configuración">{error}</Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>{activate ? "Crear y activar" : "Crear"}</Button>
          </DialogFooter>
        </form>
        <ConfirmDialog
          open={!!pending}
          onOpenChange={(o) => !o && setPending(null)}
          title="Crear y activar configuración"
          description="La nueva configuración se usará en las próximas predicciones y evaluaciones. Las ya publicadas no cambian."
          confirmLabel="Crear y activar"
          onConfirm={() => {
            const v = pending;
            setPending(null);
            if (v) void save(v);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
