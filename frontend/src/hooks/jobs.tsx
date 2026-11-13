import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useJob } from "@/api/hooks";
import type { GameCode, Job } from "@/api/types";
import { JOB_TYPE_LABEL } from "@/lib/format";

interface Tracked {
  id: string;
  label: string;
  game?: GameCode;
}
interface JobsState {
  tracked: Tracked[];
  track: (id: string, label: string, game?: GameCode) => void;
}
const JobsContext = React.createContext<JobsState | null>(null);

/** Sigue trabajos en segundo plano (publicación, backtest, reconstrucción) y avisa al terminar. */
export function JobTrackerProvider({ children }: { children: React.ReactNode }) {
  const [tracked, setTracked] = React.useState<Tracked[]>([]);
  const track = React.useCallback((id: string, label: string, game?: GameCode) => {
    setTracked((t) => (t.some((x) => x.id === id) ? t : [...t, { id, label, game }]));
    toast.info(`${label}: trabajo en cola`, { description: `ID ${id.slice(0, 8)}…` });
  }, []);
  const done = React.useCallback((id: string) => setTracked((t) => t.filter((x) => x.id !== id)), []);
  const value = React.useMemo(() => ({ tracked, track }), [tracked, track]);
  return (
    <JobsContext.Provider value={value}>
      {children}
      {tracked.map((t) => (
        <JobWatcher key={t.id} item={t} onDone={done} />
      ))}
    </JobsContext.Provider>
  );
}

function JobWatcher({ item, onDone }: { item: Tracked; onDone: (id: string) => void }) {
  const q = useJob(item.id);
  const qc = useQueryClient();
  const status = q.data?.status;
  React.useEffect(() => {
    if (status === "succeeded" || status === "failed") {
      if (status === "succeeded") toast.success(`${item.label}: completado`);
      else toast.error(`${item.label}: falló`, { description: q.data?.error?.split("\n")[0] ?? undefined });
      for (const k of ["summary", "prediction-official", "predictions", "backtests", "backtest", "track-record", "jobs", "stats", "configurations"])
        qc.invalidateQueries({ queryKey: [k] });
      onDone(item.id);
    }
  }, [status, item, onDone, qc, q.data?.error]);
  React.useEffect(() => {
    if (q.isError) onDone(item.id);
  }, [q.isError, item.id, onDone]);
  return null;
}

export function useJobTracker(): JobsState {
  const ctx = React.useContext(JobsContext);
  if (!ctx) throw new Error("useJobTracker fuera de JobTrackerProvider");
  return ctx;
}

export function jobLabel(j: Pick<Job, "job_type">): string {
  return JOB_TYPE_LABEL[j.job_type] ?? j.job_type;
}
