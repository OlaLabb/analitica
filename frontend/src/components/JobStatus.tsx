import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useJob } from "@/api/hooks";
import type { JobStatus as S } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL } from "@/lib/format";

export function JobStatusBadge({ status }: { status: S | string }) {
  const icon =
    status === "succeeded" ? <CheckCircle2 className="h-3 w-3" /> :
    status === "failed" ? <XCircle className="h-3 w-3" /> :
    status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />;
  const variant = status === "succeeded" ? "success" : status === "failed" ? "destructive" : status === "running" ? "default" : "secondary";
  return (
    <Badge variant={variant}>
      {icon} {JOB_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** Estado en vivo de un trabajo (sondea /admin/jobs/{id} hasta que termina). */
export function LiveJob({ id }: { id: string }) {
  const q = useJob(id);
  if (q.isLoading) return <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin" /> Consultando…</Badge>;
  if (q.isError || !q.data) return <Badge variant="destructive">No disponible</Badge>;
  const j = q.data;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium">{JOB_TYPE_LABEL[j.job_type] ?? j.job_type}</span>
      <JobStatusBadge status={j.status} />
      <span className="font-mono text-muted-foreground">{j.id.slice(0, 8)}</span>
      {j.error && <span className="text-destructive">{j.error.split("\n")[0]}</span>}
    </div>
  );
}
