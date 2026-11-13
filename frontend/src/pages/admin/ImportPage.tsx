import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet, FileUp, Upload, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { mutations, useImports, useInvalidateGame } from "@/api/hooks";
import { api, errorMessage } from "@/api/client";
import type { ImportMapping, ImportPreview, ImportRecord, ImportReport } from "@/api/types";
import { useJobTracker } from "@/hooks/jobs";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section } from "@/components/common";
import { LiveJob } from "@/components/JobStatus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Segmented, Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { WEEKDAYS_SHORT, fmtDate, fmtDateTime, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const REQUIRED = ["draw_date", "position_1", "position_2", "position_3", "position_4", "position_5", "super_number"] as const;
const OPTIONAL = ["draw_number"] as const;
const FIELD_LABELS: Record<string, string> = {
  draw_date: "Fecha del sorteo",
  position_1: "Posición 1",
  position_2: "Posición 2",
  position_3: "Posición 3",
  position_4: "Posición 4",
  position_5: "Posición 5",
  super_number: "Súper Número",
  draw_number: "Número de sorteo (opcional)",
  game: "Columna de juego",
};
const DATE_FORMATS = [
  { value: "auto", label: "Autodetectar" },
  { value: "%Y-%m-%d", label: "AAAA-MM-DD" },
  { value: "%d/%m/%Y", label: "DD/MM/AAAA" },
  { value: "%d-%m-%Y", label: "DD-MM-AAAA" },
  { value: "%Y/%m/%d", label: "AAAA/MM/DD" },
  { value: "%m/%d/%Y", label: "MM/DD/AAAA" },
  { value: "%d.%m.%Y", label: "DD.MM.AAAA" },
];
const NONE = "__none__";
const GAME_CODES = ["BALOTO", "REVANCHA"];
const STEPS = ["Archivo", "Mapeo", "Validación", "Confirmación"];

interface WizardState {
  imp: ImportRecord;
  preview: ImportPreview;
}

export default function ImportPage() {
  const [state, setState] = React.useState<WizardState | null>(null);
  const [step, setStep] = React.useState(0);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [result, setResult] = React.useState<{ imp: ImportRecord; jobs: string[] } | null>(null);
  const qc = useQueryClient();

  const reset = () => {
    setState(null);
    setReport(null);
    setResult(null);
    setStep(0);
    qc.invalidateQueries({ queryKey: ["imports"] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileUp}
        title="Importación de histórico"
        description="Cargue un CSV o Excel, asigne las columnas, valide fila por fila y confirme. Nada se escribe en el histórico hasta confirmar."
      />
      <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className={i === step ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <UploadStep
          onUploaded={(s) => {
            setState(s);
            setStep(1);
          }}
        />
      )}
      {step >= 1 && state && !result && (
        <MappingStep
          state={state}
          setPreview={(preview) => setState({ ...state, preview })}
          report={report}
          onValidated={(imp, rep) => {
            setState({ ...state, imp });
            setReport(rep);
            setStep(2);
          }}
          onCommitted={(imp, jobs) => {
            setResult({ imp, jobs });
            setStep(3);
          }}
          onCancel={reset}
        />
      )}
      {result && <ResultStep result={result} onDone={reset} />}
      <PastImports
        onResume={async (imp) => {
          try {
            const [full, preview] = await Promise.all([api<ImportRecord>(`/imports/${imp.id}`), mutations.previewImport(imp.id)]);
            setState({ imp: full, preview });
            setReport(full.status === "validated" ? full.report ?? null : null);
            setResult(null);
            setStep(full.status === "validated" ? 2 : 1);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function UploadStep({ onUploaded }: { onUploaded: (s: WizardState) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await mutations.uploadImport(file);
      onUploaded({ imp: r.import, preview: r.preview });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="1. Seleccione el archivo" description="Formatos admitidos: CSV (separador autodetectado) y Excel (.xlsx). Puede contener uno o ambos juegos.">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors", drag && "border-primary bg-primary/5")}
      >
        <FileSpreadsheet className="h-10 w-10 text-muted-foreground/60" />
        {file ? (
          <p className="text-sm">
            <span className="font-medium">{file.name}</span> <span className="text-muted-foreground">({fmtInt(Math.round(file.size / 1024))} KB)</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Arrastre el archivo aquí o selecciónelo.</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Archivo a importar"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Elegir archivo</Button>
          <Button size="sm" disabled={!file} loading={busy} onClick={upload}>
            <Upload /> Subir y previsualizar
          </Button>
        </div>
      </div>
      {error && <Alert variant="destructive" className="mt-3" title={error} />}
    </Section>
  );
}

function initialMapping(p: ImportPreview, existing?: ImportMapping | null): ImportMapping {
  if (existing) return existing;
  const columns = { ...p.suggested_mapping };
  return {
    columns,
    date_format: null,
    fixed_game: columns.game ? null : "BALOTO",
    game_values: null,
    sheet_name: p.sheets[0] ?? null,
    skip_existing_identical: true,
  };
}

function normalize(m: ImportMapping): ImportMapping {
  return {
    columns: m.columns,
    date_format: m.date_format ?? null,
    fixed_game: m.fixed_game ?? null,
    game_values: !m.fixed_game && m.game_values && Object.keys(m.game_values).length ? m.game_values : null,
    sheet_name: m.sheet_name ?? null,
    skip_existing_identical: m.skip_existing_identical ?? true,
  };
}

/** JSON con claves ordenadas (comparación estable). */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

function MappingStep({ state, setPreview, report, onValidated, onCommitted, onCancel }: {
  state: WizardState;
  setPreview: (p: ImportPreview) => void;
  report: ImportReport | null;
  onValidated: (imp: ImportRecord, rep: ImportReport) => void;
  onCommitted: (imp: ImportRecord, jobs: string[]) => void;
  onCancel: () => void;
}) {
  const { imp, preview } = state;
  const [m, setM] = React.useState<ImportMapping>(() => initialMapping(preview, imp.column_mapping));
  const [busy, setBusy] = React.useState<"validate" | "commit" | "cancel" | "sheet" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const gameMode: "column" | "fixed" = m.fixed_game ? "fixed" : "column";
  const colOptions = [{ value: NONE, label: "— sin asignar —" }, ...preview.columns.map((c) => ({ value: c, label: c }))];
  const missing = REQUIRED.filter((f) => !m.columns[f]);
  const gameMissing = gameMode === "column" ? !m.columns.game : !m.fixed_game;
  const gameCol = m.columns.game;
  const distinctGameValues = React.useMemo(
    () => (gameCol ? Array.from(new Set(preview.rows.map((r) => String(r[gameCol] ?? "").trim()).filter(Boolean))) : []),
    [gameCol, preview.rows],
  );
  const setCol = (field: string, col: string) => {
    const columns = { ...m.columns };
    if (col === NONE) delete columns[field];
    else columns[field] = col;
    setM({ ...m, columns });
  };
  // El endpoint de validación no devuelve column_mapping: recordamos localmente con qué mapeo se validó.
  const [validatedWith, setValidatedWith] = React.useState<ImportMapping | null>(() => (report && imp.column_mapping ? normalize(imp.column_mapping) : null));
  const dirtyAfterReport = !!report && (!validatedWith || stable(normalize(m)) !== stable(validatedWith));
  const invalidate = useInvalidateGame();

  const validate = async () => {
    setBusy("validate");
    setError(null);
    try {
      const body = normalize(m);
      const r = await mutations.validateImport(imp.id, body);
      setValidatedWith(body);
      onValidated({ ...r.import, column_mapping: body }, r.report);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Section
        title={`2. Vista previa · ${imp.filename}`}
        description={`${fmtInt(preview.total_rows)} filas detectadas · formato ${imp.file_format.toUpperCase()} · se muestran las primeras ${preview.rows.length}.`}
        actions={
          preview.sheets.length > 1 && (
            <div className="flex items-center gap-2">
              <Label>Hoja</Label>
              <SimpleSelect
                className="w-44"
                value={m.sheet_name ?? preview.sheets[0]}
                onChange={async (sheet) => {
                  setBusy("sheet");
                  try {
                    const p = await mutations.previewImport(imp.id, sheet);
                    setPreview(p);
                    setM({ ...initialMapping(p), sheet_name: sheet });
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setBusy(null);
                  }
                }}
                options={preview.sheets.map((s) => ({ value: s, label: s }))}
              />
            </div>
          )
        }
      >
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <THead className="sticky top-0">
              <TR>
                {preview.columns.map((c) => (
                  <TH key={c}>
                    {c}
                    {Object.entries(m.columns).filter(([, v]) => v === c).map(([f]) => (
                      <Badge key={f} variant="default" className="ml-1 normal-case">{FIELD_LABELS[f]?.replace(" (opcional)", "") ?? f}</Badge>
                    ))}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {preview.rows.map((r, i) => (
                <TR key={i}>
                  {preview.columns.map((c) => (
                    <TD key={c} className="whitespace-nowrap font-mono text-xs">{String(r[c] ?? "")}</TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </Section>

      <Section title="Mapeo de columnas" description="Se proponen asignaciones a partir de los encabezados; revíselas y ajústelas.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...REQUIRED, ...OPTIONAL].map((f) => (
            <div key={f} className="flex flex-col gap-1.5">
              <Label htmlFor={`map-${f}`}>
                {FIELD_LABELS[f]} {REQUIRED.includes(f as (typeof REQUIRED)[number]) && <span className="text-destructive">*</span>}
              </Label>
              <SimpleSelect id={`map-${f}`} value={m.columns[f] ?? NONE} onChange={(v) => setCol(f, v)} options={colOptions} />
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="map-date-fmt">Formato de fecha</Label>
            <SimpleSelect id="map-date-fmt" value={m.date_format ?? "auto"} onChange={(v) => setM({ ...m, date_format: v === "auto" ? null : v })} options={DATE_FORMATS} />
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Juego de cada fila:</span>
            <Segmented
              size="sm"
              value={gameMode}
              onChange={(v) => {
                if (v === "fixed") {
                  const columns = { ...m.columns };
                  delete columns.game;
                  setM({ ...m, columns, fixed_game: m.fixed_game ?? "BALOTO", game_values: null });
                } else setM({ ...m, fixed_game: null, columns: { ...m.columns, ...(preview.suggested_mapping.game ? { game: preview.suggested_mapping.game } : {}) } });
              }}
              options={[{ value: "column", label: "Columna del archivo" }, { value: "fixed", label: "Juego fijo" }]}
            />
          </div>
          {gameMode === "fixed" ? (
            <div className="flex w-48 flex-col gap-1.5">
              <Label htmlFor="map-fixed">Juego para todo el archivo</Label>
              <SimpleSelect id="map-fixed" value={m.fixed_game ?? "BALOTO"} onChange={(v) => setM({ ...m, fixed_game: v })} options={GAME_CODES.map((g) => ({ value: g, label: g }))} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex w-56 flex-col gap-1.5">
                <Label htmlFor="map-game">{FIELD_LABELS.game} <span className="text-destructive">*</span></Label>
                <SimpleSelect id="map-game" value={m.columns.game ?? NONE} onChange={(v) => setCol("game", v)} options={colOptions} />
              </div>
              {gameCol && distinctGameValues.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Valores encontrados en la vista previa → código de juego (si coincide con el código, no hace falta mapearlo):
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {distinctGameValues.map((val) => (
                      <div key={val} className="flex items-center gap-2 text-xs">
                        <span className="rounded bg-muted px-2 py-1 font-mono">{val}</span>→
                        <SimpleSelect
                          className="h-8 w-36"
                          value={m.game_values?.[val] ?? (GAME_CODES.includes(val.toUpperCase()) ? val.toUpperCase() : NONE)}
                          onChange={(code) => {
                            const gv = { ...(m.game_values ?? {}) };
                            if (code === NONE) delete gv[val];
                            else gv[val] = code;
                            setM({ ...m, game_values: gv });
                          }}
                          options={[{ value: NONE, label: "(tal cual)" }, ...GAME_CODES.map((g) => ({ value: g, label: g }))]}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Switch checked={m.skip_existing_identical ?? true} onCheckedChange={(c) => setM({ ...m, skip_existing_identical: c })} />
          Omitir filas idénticas a sorteos ya existentes
        </label>

        {(missing.length > 0 || gameMissing) && (
          <Alert variant="warning" className="mt-3" title="Faltan asignaciones obligatorias">
            {[...missing.map((f) => FIELD_LABELS[f]), ...(gameMissing ? ["Juego (columna o fijo)"] : [])].join(", ")}
          </Alert>
        )}
        {error && <Alert variant="destructive" className="mt-3" title="La validación no pudo ejecutarse">{error}</Alert>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            trigger={<Button variant="ghost" loading={busy === "cancel"}><XCircle /> Cancelar importación</Button>}
            title="Cancelar importación"
            description="La importación quedará marcada como cancelada y no se escribirá ningún sorteo."
            confirmLabel="Cancelar importación"
            destructive
            onConfirm={async () => {
              setBusy("cancel");
              try {
                await mutations.cancelImport(imp.id);
                toast.success("Importación cancelada");
                onCancel();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(null);
              }
            }}
          />
          <Button onClick={validate} disabled={missing.length > 0 || gameMissing || busy !== null} loading={busy === "validate"}>
            {report ? "Volver a validar" : "Validar"}
          </Button>
        </div>
      </Section>

      {report && (
        <ReportView
          report={report}
          stale={!!dirtyAfterReport}
          busy={busy === "commit"}
          onCommit={async () => {
            setBusy("commit");
            setError(null);
            try {
              const r = await mutations.commitImport(imp.id);
              invalidate();
              onCommitted(r.import, r.publish_jobs);
            } catch (e) {
              setError(errorMessage(e));
              toast.error(errorMessage(e));
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
    </div>
  );
}

const ERROR_TYPE_LABEL: Record<string, string> = {
  formato: "Formato",
  reglas: "Reglas",
  duplicado_en_archivo: "Duplicado en archivo",
  conflicto_con_historico: "Conflicto con histórico",
};

function ReportView({ report, stale, busy, onCommit }: { report: ImportReport; stale: boolean; busy: boolean; onCommit: () => void }) {
  const [type, setType] = React.useState("all");
  const types = Array.from(new Set(report.errors.map((e) => e.type)));
  const errs = report.errors.filter((e) => type === "all" || e.type === type);
  const tiles: [string, number, string?][] = [
    ["Filas detectadas", report.rows_detected],
    ["Válidas (nuevas)", report.rows_valid, "text-success"],
    ["Rechazadas", report.rows_rejected, report.rows_rejected ? "text-destructive" : undefined],
    ["Ya existentes (idénticas)", report.rows_duplicate_existing],
    ["En conflicto con histórico", report.rows_conflicting_existing, report.rows_conflicting_existing ? "text-warning" : undefined],
  ];
  return (
    <Section title="3. Informe de validación" description="Revise los errores antes de confirmar. Solo se insertarán las filas válidas nuevas.">
      {stale && <Alert variant="warning" className="mb-3" title="Cambió el mapeo después de validar: vuelva a validar antes de confirmar." />}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([l, v, cls]) => (
          <div key={l} className="rounded-md border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p>
            <p className={cn("text-xl font-semibold tabular-nums", cls)}>{fmtInt(v)}</p>
          </div>
        ))}
      </div>

      {Object.keys(report.games).length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(report.games).map(([code, g]) => (
            <div key={code} className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{code}</span>
                <Badge variant={g.rules_confirmed ? "success" : "warning"}>{g.rules_confirmed ? "Reglas confirmadas" : "Reglas sin confirmar"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {fmtInt(g.valid_new)} sorteos nuevos{g.first_date ? ` · ${fmtDate(g.first_date)} – ${fmtDate(g.last_date)}` : ""}
              </p>
              {g.observed && Object.keys(g.observed).length > 0 && (
                <div className="mt-2 space-y-0.5 text-xs">
                  <p className="font-medium">Propiedades observadas (no se imponen):</p>
                  <p>Principales {g.observed.main_min}–{g.observed.main_max} · SN {g.observed.super_min}–{g.observed.super_max}</p>
                  <p>
                    {g.observed.all_sorted_ascending ? "Todos en orden ascendente" : "No siempre ascendentes"} ·{" "}
                    {g.observed.any_repeated_within_draw ? "hay números repetidos en un sorteo" : "sin repetidos dentro del sorteo"}
                  </p>
                  {g.observed.weekdays && <p>Días: {g.observed.weekdays.map((d) => WEEKDAYS_SHORT[d]).join(", ")}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Errores por fila ({fmtInt(report.errors.length)}{report.errors_truncated ? "+, truncado a 1000" : ""})</p>
          {types.length > 0 && (
            <SimpleSelect className="w-56" value={type} onChange={setType} ariaLabel="Tipo de error"
              options={[{ value: "all", label: "Todos los tipos" }, ...types.map((t) => ({ value: t, label: ERROR_TYPE_LABEL[t] ?? t }))]} />
          )}
        </div>
        {report.errors.length === 0 ? (
          <p className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Sin errores.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-md border">
            <Table>
              <THead className="sticky top-0">
                <TR>
                  <TH>Fila</TH>
                  <TH>Juego</TH>
                  <TH>Tipo</TH>
                  <TH>Mensaje</TH>
                </TR>
              </THead>
              <TBody>
                {errs.map((e, i) => (
                  <TR key={i}>
                    <TD className="tabular-nums">{e.row}</TD>
                    <TD className="text-xs">{e.game ?? "—"}</TD>
                    <TD><Badge variant={e.type === "conflicto_con_historico" ? "warning" : "destructive"}>{ERROR_TYPE_LABEL[e.type] ?? e.type}</Badge></TD>
                    <TD className="text-xs">{e.message}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {report.rows_conflicting_existing > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Los conflictos no se sobrescriben: corrija esos sorteos desde Histórico (requiere motivo).</p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <ConfirmDialog
          trigger={<Button disabled={stale || busy} loading={busy}>4. Confirmar importación</Button>}
          title="Confirmar importación"
          description={
            report.rows_valid > 0
              ? `Se insertarán ${fmtInt(report.rows_valid)} sorteos en una transacción, creando una nueva versión del histórico por juego afectado. Después se publicarán nuevas predicciones automáticamente si el sistema lo tiene activado.`
              : "No hay filas nuevas para insertar; la importación quedará registrada como confirmada sin cambios en el histórico."
          }
          confirmLabel="Confirmar"
          onConfirm={onCommit}
        />
      </div>
    </Section>
  );
}

function ResultStep({ result, onDone }: { result: { imp: ImportRecord; jobs: string[] }; onDone: () => void }) {
  const { track } = useJobTracker();
  React.useEffect(() => {
    result.jobs.forEach((j) => track(j, "Publicación tras importación"));
  }, [result.jobs, track]);
  const versions = result.imp.report?.resulting_versions ?? {};
  return (
    <Section title="Importación confirmada">
      <Alert variant="success" title={`${fmtInt(result.imp.rows_inserted)} sorteos insertados`}>
        {Object.keys(versions).length
          ? `Nuevas versiones: ${Object.entries(versions).map(([g, v]) => `${g} v${v}`).join(", ")}.`
          : "No se crearon versiones nuevas (no había filas nuevas)."}
      </Alert>
      {result.jobs.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Trabajos de publicación</p>
          {result.jobs.map((j) => (
            <LiveJob key={j} id={j} />
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={onDone}>Nueva importación</Button>
      </div>
    </Section>
  );
}

function PastImports({ onResume }: { onResume: (i: ImportRecord) => void }) {
  const q = useImports();
  return (
    <Section title="Importaciones anteriores">
      {q.isLoading ? (
        <LoadingBlock height={120} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="No hay importaciones registradas" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Archivo</TH>
              <TH>Estado</TH>
              <TH className="text-right">Detectadas</TH>
              <TH className="text-right">Válidas</TH>
              <TH className="text-right">Rechazadas</TH>
              <TH className="text-right">Duplicadas</TH>
              <TH className="text-right">Conflictos</TH>
              <TH className="text-right">Insertadas</TH>
              <TH>Creada</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {q.data.map((i) => (
              <TR key={i.id}>
                <TD className="max-w-[200px] truncate text-xs" title={`${i.filename} · sha256 ${i.file_sha256}`}>{i.filename}</TD>
                <TD>
                  <Badge variant={i.status === "committed" ? "success" : i.status === "cancelled" ? "secondary" : "warning"}>{i.status}</Badge>
                </TD>
                <TD className="text-right">{fmtInt(i.rows_detected)}</TD>
                <TD className="text-right">{fmtInt(i.rows_valid)}</TD>
                <TD className="text-right">{fmtInt(i.rows_rejected)}</TD>
                <TD className="text-right">{fmtInt(i.rows_duplicate_existing)}</TD>
                <TD className="text-right">{fmtInt(i.rows_conflicting_existing)}</TD>
                <TD className="text-right">{fmtInt(i.rows_inserted)}</TD>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(i.created_at)}</TD>
                <TD className="text-right">
                  {(i.status === "uploaded" || i.status === "validated") && (
                    <Button size="sm" variant="ghost" onClick={() => onResume(i)}>Reanudar</Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Section>
  );
}
