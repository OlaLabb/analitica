import * as React from "react";
import { ListChecks } from "lucide-react";
import { useJobs } from "@/api/hooks";
import type { Job } from "@/api/types";
import { EmptyState, JsonView, PageHeader, QueryState, Section } from "@/components/common";
import { JobStatusBadge } from "@/components/JobStatus";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, fmtDateTime } from "@/lib/format";

function duration(j: Job): string {
  if (!j.started_at) return "—";
  const end = j.finished_at ? new Date(j.finished_at).getTime() : Date.now();
  const s = Math.max(0, (end - new Date(j.started_at).getTime()) / 1000);
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export default function JobsPage() {
  const q = useJobs();
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [detail, setDetail] = React.useState<Job | null>(null);
  return (
    <div className="space-y-5">
      <PageHeader icon={ListChecks} title="Trabajos en segundo plano" description="Publicaciones, backtests y reconstrucciones. La lista se actualiza cada 5 segundos (últimos 100)." />
      <Section
        title="Trabajos"
        actions={
          <>
            <SimpleSelect className="w-44" value={type} onChange={setType} ariaLabel="Tipo"
              options={[{ value: "all", label: "Todos los tipos" }, ...Object.entries(JOB_TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
            <SimpleSelect className="w-40" value={status} onChange={setStatus} ariaLabel="Estado"
              options={[{ value: "all", label: "Todos los estados" }, ...Object.entries(JOB_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          </>
        }
      >
        <QueryState query={q} loadingHeight={200}>
          {(jobs) => {
            const rows = jobs.filter((j) => (status === "all" || j.status === status) && (type === "all" || j.job_type === type));
            if (!rows.length) return <EmptyState title="No hay trabajos" description="Aparecerán al publicar predicciones, lanzar backtests o reconstruir el motor." />;
            return (
              <Table>
                <THead>
                  <TR>
                    <TH>Creado</TH>
                    <TH>Tipo</TH>
                    <TH>Estado</TH>
                    <TH>Duración</TH>
                    <TH>ID</TH>
                    <TH>Error</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {rows.map((j) => (
                    <TR key={j.id}>
                      <TD className="whitespace-nowrap text-xs">{fmtDateTime(j.created_at)}</TD>
                      <TD className="text-sm">{JOB_TYPE_LABEL[j.job_type] ?? j.job_type}</TD>
                      <TD><JobStatusBadge status={j.status} /></TD>
                      <TD className="text-xs tabular-nums">{duration(j)}</TD>
                      <TD className="font-mono text-xs text-muted-foreground">{j.id.slice(0, 8)}</TD>
                      <TD className="max-w-xs truncate text-xs text-destructive">{j.error?.split("\n")[0] ?? ""}</TD>
                      <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => setDetail(j)}>Detalle</Button></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            );
          }}
        </QueryState>
      </Section>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail && (JOB_TYPE_LABEL[detail.job_type] ?? detail.job_type)}</DialogTitle>
            <DialogDescription className="font-mono">{detail?.id}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div><p className="mb-1 text-xs font-semibold">Parámetros</p><JsonView value={detail.params} /></div>
              {detail.result && <div><p className="mb-1 text-xs font-semibold">Resultado</p><JsonView value={detail.result} /></div>}
              {detail.error && <div><p className="mb-1 text-xs font-semibold text-destructive">Error</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border bg-destructive/5 p-3 font-mono text-[11px]">{detail.error}</pre></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
