import * as React from "react";
import { AlertTriangle, Copy, Check, Inbox, RefreshCw, Scale } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/misc";
import { errorMessage } from "@/api/client";
import type { ChiTest, WindowDescribe } from "@/api/types";
import { cn } from "@/lib/utils";
import { fmtDate, fmtInt, fmtNum, fmtP, shortHash } from "@/lib/format";

export function PageHeader({ title, description, actions, icon: Icon }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; icon?: React.ElementType;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          {title}
        </h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingBlock({ height = 240, className, label = "Cargando…" }: { height?: number; className?: string; label?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label={label}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton style={{ height }} className="w-full" />
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <Alert variant="destructive" className={className} title="No se pudieron cargar los datos">
      <div className="flex flex-wrap items-center gap-3">
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw /> Reintentar
          </Button>
        )}
      </div>
    </Alert>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, action, className }: {
  title: string; description?: React.ReactNode; icon?: React.ElementType; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      <Icon className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

/** Renderiza la consulta en sus estados: carga, error, vacío o datos. */
export function QueryState<T>({ query, children, loadingHeight = 240, isEmpty, empty }: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => React.ReactNode;
  loadingHeight?: number;
  isEmpty?: (d: T) => boolean;
  empty?: React.ReactNode;
}) {
  if (query.isLoading) return <LoadingBlock height={loadingHeight} />;
  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Sin datos para esta selección" />}</>;
  return <>{children(query.data)}</>;
}

export function Warnings({ items, title = "Advertencias", className }: { items?: (string | null | undefined)[] | null; title?: string; className?: string }) {
  const list = (items ?? []).filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <Alert variant="warning" title={title} className={className}>
      <ul className="list-disc space-y-0.5 pl-4">
        {list.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** Nota de honestidad científica: puntaje ≠ probabilidad de ganar. */
export function HonestyNote({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <Alert variant="info" icon className={className} title="Lectura responsable">
      {children ?? (
        <>
          Las cifras describen el histórico. Un <strong>puntaje del modelo</strong> no es una probabilidad garantizada de
          acierto; la <strong>probabilidad de referencia</strong> es la que tendría cada número si el sorteo es puramente
          aleatorio. Ningún análisis aquí permite predecir resultados con ventaja demostrada.
        </>
      )}
    </Alert>
  );
}

export function Disclaimer({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null;
  return (
    <div className={cn("flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs leading-relaxed text-muted-foreground", className)}>
      <Scale className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p>
        <span className="font-semibold text-foreground">Descargo: </span>
        {text}
      </p>
    </div>
  );
}

type BallSize = "sm" | "md" | "lg" | "xl";
const BALL_SIZE: Record<BallSize, string> = {
  sm: "!h-7 !w-7 !text-xs",
  md: "",
  lg: "!h-11 !w-11 !text-lg",
  xl: "!h-11 !w-11 !text-xl min-[400px]:!h-12 min-[400px]:!w-12 sm:!h-16 sm:!w-16 sm:!text-[1.7rem]",
};

/** Balota: amarilla para los 5 números, roja para el Súper Número (superbalota). */
export function NumberBall({ n, sn, size = "md", highlight, dim, className }: {
  n: number | null | undefined; sn?: boolean; size?: BallSize; highlight?: boolean; dim?: boolean; className?: string;
}) {
  return (
    <span
      className={cn(
        dim ? "num-ball-off" : sn ? "num-ball-sn" : "num-ball",
        BALL_SIZE[size],
        highlight && "ring-2 ring-success ring-offset-2 ring-offset-background",
        className,
      )}
      aria-label={sn ? `Súper Número ${n ?? "—"}` : `Número ${n ?? "—"}`}
    >
      {n ?? "—"}
    </span>
  );
}

/**
 * Fila de balotas. `highlight` marca con anillo verde los números indicados; con `dimOthers` los demás se ven
 * apagados (útil para comparar sugerida vs. real).
 */
export function DrawNumbers({ numbers, sn, size = "sm", highlight, dimOthers, snHighlight, snDim }: {
  numbers: number[]; sn?: number | null; size?: BallSize; highlight?: number[]; dimOthers?: boolean; snHighlight?: boolean; snDim?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {numbers.map((n, i) => {
        const hit = highlight?.includes(n);
        return <NumberBall key={i} n={n} size={size} highlight={hit} dim={dimOthers && !hit} />;
      })}
      {sn !== undefined && sn !== null && (
        <>
          <span className="mx-0.5 text-muted-foreground" aria-hidden>+</span>
          <NumberBall n={sn} sn size={size} highlight={snHighlight} dim={snDim} />
        </>
      )}
    </span>
  );
}

export function StatTile({ label, value, sub, icon: Icon, className, tone }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ElementType; className?: string; tone?: "default" | "warning" | "success";
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4 text-muted-foreground", tone === "warning" && "text-warning", tone === "success" && "text-success")} />}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function HashText({ value, n = 12, className }: { value: string | null | undefined; n?: number; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  if (!value) return <span>—</span>;
  return (
    <Tip content={value}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 rounded font-mono text-xs text-muted-foreground hover:text-foreground", className)}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }).catch(() => undefined);
        }}
        aria-label={`Copiar ${value}`}
      >
        {shortHash(value, n)}
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
      </button>
    </Tip>
  );
}

export function PBadge({ p, significant, label = "p" }: { p: number | null | undefined; significant?: boolean; label?: string }) {
  return (
    <Badge variant={significant ? "warning" : "secondary"} className="font-mono">
      {label} = {fmtP(p)}
    </Badge>
  );
}

/** Resumen de una prueba chi² con advertencia de aproximación. */
export function ChiSummary({ test, title = "Prueba χ²", verdict }: { test: ChiTest | null | undefined; title?: string; verdict?: string }) {
  if (!test) return <p className="text-xs text-muted-foreground">{title}: no disponible para esta ventana.</p>;
  const sig = test.p_value !== null && test.p_value < 0.05;
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{title}</span>
        <span className="font-mono">χ² = {fmtNum(test.statistic, 2)}</span>
        <span className="font-mono">gl = {fmtInt(test.df)}</span>
        <PBadge p={test.p_value} significant={sig} />
        {test.cramers_v !== undefined && test.cramers_v !== null && <span className="font-mono">V de Cramér = {fmtNum(test.cramers_v, 3)}</span>}
        {test.n !== undefined && <span className="text-muted-foreground">n = {fmtInt(test.n)}</span>}
      </div>
      {verdict && <p className="font-medium">{verdict}</p>}
      {!verdict && (
        <p className="text-muted-foreground">
          {sig
            ? "p < 0,05: la desviación respecto a la referencia es poco habitual bajo azar (revise tamaño de muestra y comparaciones múltiples)."
            : "No hay evidencia de desviación respecto a la referencia de azar (α = 0,05)."}
        </p>
      )}
      {test.warning && (
        <p className="flex items-start gap-1 text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {test.warning}
        </p>
      )}
    </div>
  );
}

/** Descripción de la ventana efectivamente usada por el backend. */
export function WindowInfo({ window, version, rulesConfirmed }: { window: WindowDescribe; version?: number | null; rulesConfirmed?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground tabular-nums">{fmtInt(window.n_draws)}</strong> sorteos
        </span>
        <span>
          {fmtDate(window.first_date)} – {fmtDate(window.last_date)}
        </span>
        {version !== undefined && version !== null && <span>Histórico v{version}</span>}
        {rulesConfirmed === false && <Badge variant="warning">Reglas no confirmadas: referencia empírica</Badge>}
      </div>
      <Warnings items={window.warnings} title="Advertencias de la ventana" />
    </div>
  );
}

export function Section({ title, description, actions, children, className }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
      <span>
        {total === 0 ? "0 resultados" : `${fmtInt((page - 1) * pageSize + 1)}–${fmtInt(Math.min(total, page * pageSize))} de ${fmtInt(total)}`}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}

export function KeyValue({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm", className)}>
      {items.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words text-right text-sm sm:text-left">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre className={cn("max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed", className)}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
