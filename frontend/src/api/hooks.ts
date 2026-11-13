import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AuditEntry, Backtest, BacktestTarget, CalendarResult, Compare, Dimension, Distribution, Draw, Game,
  GameCode, GameSummary, Groups, Grouped, HistoricalVersion, HistoryChangeOut, ImportMapping, ImportPreview,
  ImportRecord, ImportReport, Invitation, Job, ModelConfiguration, ModelsInfo, Paged, Pairs,
  PooledFrequency, PositionRelations, PositionsFrequency, Prediction, Recurrence, Repeats, Rolling, Rules,
  StatsEnvelope, Sums, SystemInfo, TrackRecord, Transitions, User, Variable, VariableAny, Yearly, FrequencyTable,
} from "./types";
import { windowIncomplete, windowToParams, type WindowState } from "@/lib/window";

const STALE = 60_000;

/* ------------------------------------------------------------------ juegos */
export const useGames = () => useQuery({ queryKey: ["games"], queryFn: () => api<Game[]>("/games"), staleTime: STALE });

export const useSummary = (game: GameCode) =>
  useQuery({ queryKey: ["summary", game], queryFn: () => api<GameSummary>(`/games/${game}/summary`), staleTime: STALE });

export const useRules = (game: GameCode) =>
  useQuery({ queryKey: ["rules", game], queryFn: () => api<{ active: Rules | null; history: Rules[] }>(`/games/${game}/rules`) });

export const useVersions = (game: GameCode) =>
  useQuery({ queryKey: ["versions", game], queryFn: () => api<HistoricalVersion[]>(`/games/${game}/versions`) });

/* ------------------------------------------------------------------ histórico */
export interface DrawFilters {
  start?: string;
  end?: string;
  weekday?: number;
  number?: number;
  order?: "asc" | "desc";
  page: number;
  page_size: number;
}

export const useDraws = (game: GameCode, f: DrawFilters) =>
  useQuery({
    queryKey: ["draws", game, f],
    queryFn: () => api<Paged<Draw>>(`/games/${game}/draws`, { query: { ...f } }),
    placeholderData: keepPreviousData,
  });

export const useDrawHistory = (game: GameCode, id: number | null) =>
  useQuery({
    queryKey: ["draw-history", game, id],
    queryFn: () => api<Draw[]>(`/games/${game}/draws/${id}/history`),
    enabled: id !== null,
  });

/* ------------------------------------------------------------------ estadísticas */
type Extra = Record<string, string | number | undefined | null>;

function useStats<T>(game: GameCode, path: string, w: WindowState, extra: Extra = {}, enabled = true) {
  const incomplete = windowIncomplete(w);
  return useQuery({
    queryKey: ["stats", game, path, windowToParams(w), extra],
    queryFn: ({ signal }) =>
      api<StatsEnvelope<T>>(`/games/${game}/stats/${path}`, { query: { ...windowToParams(w), ...extra }, signal }),
    enabled: enabled && !incomplete,
    staleTime: STALE,
    placeholderData: keepPreviousData,
  });
}

export const useFrequency = (game: GameCode, w: WindowState, v: Variable, enabled = true) =>
  useStats<FrequencyTable>(game, "frequencies", w, { var: v }, enabled);
export const usePooledFrequency = (game: GameCode, w: WindowState, enabled = true) =>
  useStats<PooledFrequency>(game, "frequencies", w, { var: "main_any" }, enabled);
export const usePositionsFrequency = (game: GameCode, w: WindowState) =>
  useStats<PositionsFrequency>(game, "frequencies/positions", w);
export const useRecurrence = (game: GameCode, w: WindowState, v: VariableAny) =>
  useStats<Recurrence>(game, "recurrence", w, { var: v });
export const useRolling = (game: GameCode, w: WindowState, v: VariableAny, window: number, numbers: string) =>
  useStats<Rolling>(game, "trends/rolling", w, { var: v, window, numbers: numbers || undefined });
export const useRecentVsPrevious = (game: GameCode, w: WindowState, v: Variable, window: number) =>
  useStats<Compare>(game, "trends/recent-vs-previous", w, { var: v, window });
export const useCompare = (game: GameCode, a: WindowState, b: WindowState, v: Variable) =>
  useStats<Compare>(game, "trends/compare", a, { var: v, ...windowToParams(b, "b_") }, !windowIncomplete(b));
export const useYearly = (game: GameCode, w: WindowState, v: Variable) =>
  useStats<Yearly>(game, "trends/yearly", w, { var: v });
export const useDistribution = (game: GameCode, w: WindowState, v: Variable) =>
  useStats<Distribution>(game, "distribution", w, { var: v });
export const useSums = (game: GameCode, w: WindowState) => useStats<Sums>(game, "distribution/sums", w);
export const usePairs = (game: GameCode, w: WindowState, top: number) =>
  useStats<Pairs>(game, "cooccurrence/pairs", w, { top });
export const useGroups = (game: GameCode, w: WindowState, size: number, top: number) =>
  useStats<Groups>(game, "cooccurrence/groups", w, { size, top });
export const useRepeats = (game: GameCode, w: WindowState, maxLag: number) =>
  useStats<Repeats>(game, "cooccurrence/repeats", w, { max_lag: maxLag });
export const useTransitions = (game: GameCode, w: WindowState, v: Variable) =>
  useStats<Transitions>(game, "cooccurrence/transitions", w, { var: v });
export const usePositionRelations = (game: GameCode, w: WindowState) =>
  useStats<PositionRelations>(game, "cooccurrence/positions", w);
export const useGrouped = (game: GameCode, w: WindowState, v: VariableAny, dimension: Dimension, top: number) =>
  useStats<Grouped>(game, "temporal/grouped", w, { var: v, dimension, top });
export const useCalendar = (
  game: GameCode, w: WindowState, ref: string, days: number, v: VariableAny, lastYears: number | undefined,
) => useStats<CalendarResult>(game, "temporal/calendar", w, { ref, days, var: v, last_years: lastYears }, !!ref);

/* ------------------------------------------------------------------ predicciones */
export const useOfficialPrediction = (game: GameCode) =>
  useQuery({
    queryKey: ["prediction-official", game],
    queryFn: () => api<Prediction>(`/games/${game}/predictions/official`),
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
    staleTime: STALE,
  });

export const usePredictionList = (game: GameCode, page: number, includeSuperseded: boolean) =>
  useQuery({
    queryKey: ["predictions", game, page, includeSuperseded],
    queryFn: () =>
      api<Paged<Prediction>>(`/games/${game}/predictions`, {
        query: { kind: "official", include_superseded: includeSuperseded, page, page_size: 20 },
      }),
    placeholderData: keepPreviousData,
  });

export const usePrediction = (id: string | null) =>
  useQuery({ queryKey: ["prediction", id], queryFn: () => api<Prediction>(`/predictions/${id}`), enabled: !!id });

/** Marcador en lenguaje simple: aciertos reales + simulación histórica. */
export const useTrackRecord = (game: GameCode) =>
  useQuery({ queryKey: ["track-record", game], queryFn: () => api<TrackRecord>(`/games/${game}/track-record`), staleTime: STALE });

/* ------------------------------------------------------------------ evaluación */
export const useBacktests = (game: GameCode) =>
  useQuery({ queryKey: ["backtests", game], queryFn: () => api<Backtest[]>(`/games/${game}/backtests`) });

export const useBacktest = (id: string | null) =>
  useQuery({ queryKey: ["backtest", id], queryFn: () => api<Backtest>(`/backtests/${id}`), enabled: !!id });

export const useBacktestTargets = (id: string | null, model: string, page: number) =>
  useQuery({
    queryKey: ["backtest-targets", id, model, page],
    queryFn: () => api<BacktestTarget[]>(`/backtests/${id}/targets`, { query: { model, page, page_size: 25 } }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });


/* ------------------------------------------------------------------ administración */
export const useJobs = (enabled = true) =>
  useQuery({ queryKey: ["jobs"], queryFn: () => api<Job[]>("/admin/jobs"), enabled, refetchInterval: 5000 });

export const useJob = (id: string | null) =>
  useQuery({
    queryKey: ["job", id],
    queryFn: () => api<Job>(`/admin/jobs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "succeeded" || s === "failed" ? false : 1500;
    },
  });

export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/admin/users") });
export const useModelsInfo = () => useQuery({ queryKey: ["models-info"], queryFn: () => api<ModelsInfo>("/admin/models") });
export const useConfigurations = (game: GameCode) =>
  useQuery({
    queryKey: ["configurations", game],
    queryFn: () => api<ModelConfiguration[]>(`/admin/games/${game}/configurations`),
  });
export const useAudit = (f: { action?: string; entity_type?: string; page: number; page_size: number }) =>
  useQuery({
    queryKey: ["audit", f],
    queryFn: () => api<Paged<AuditEntry>>("/admin/audit", { query: { ...f } }),
    placeholderData: keepPreviousData,
  });
export const useSystem = () => useQuery({ queryKey: ["system"], queryFn: () => api<SystemInfo>("/admin/system") });
export const useImports = () => useQuery({ queryKey: ["imports"], queryFn: () => api<ImportRecord[]>("/imports") });

/* ------------------------------------------------------------------ mutaciones */
export function useInvalidateGame() {
  const qc = useQueryClient();
  return (game?: GameCode) => {
    const keys = ["summary", "draws", "versions", "stats", "prediction-official", "predictions", "backtests", "track-record", "rules", "games"];
    for (const k of keys) qc.invalidateQueries({ queryKey: game && k !== "games" ? [k, game] : [k] });
  };
}

export const mutations = {
  addDraw: (game: GameCode, body: { draw_date: string; numbers: number[]; super_number: number; draw_number?: number | null }) =>
    api<HistoryChangeOut>(`/games/${game}/draws`, { method: "POST", body }),
  correctDraw: (game: GameCode, id: number, body: { draw_date: string; numbers: number[]; super_number: number; draw_number?: number | null; reason: string }) =>
    api<HistoryChangeOut>(`/games/${game}/draws/${id}`, { method: "PUT", body }),
  deleteDraw: (game: GameCode, id: number, reason: string) =>
    api<HistoryChangeOut>(`/games/${game}/draws/${id}`, { method: "DELETE", body: { reason } }),
  publish: (game: GameCode, target_date?: string | null) =>
    api<{ job_id: string }>(`/games/${game}/predictions/publish`, { method: "POST", body: { target_date: target_date || null } }),
  createBacktest: (game: GameCode, body: { min_train: number; seed: number }) =>
    api<{ backtest_id: string; job_id: string }>(`/games/${game}/backtests`, { method: "POST", body }),
  setRules: (game: GameCode, body: Record<string, unknown>) => api<Rules>(`/games/${game}/rules`, { method: "POST", body }),
  createUser: (body: { email: string; full_name: string; role: string; password: string }) =>
    api<User>("/admin/users", { method: "POST", body }),
  updateUser: (id: string, body: { full_name?: string; role?: string; is_active?: boolean; password?: string }) =>
    api<User>(`/admin/users/${id}`, { method: "PATCH", body }),
  invite: (body: { email: string; role: string; days_valid: number }) =>
    api<Invitation>("/admin/invitations", { method: "POST", body }),
  createConfig: (game: GameCode, body: { name: string; params: unknown; activate: boolean; notes?: string | null }) =>
    api<{ id: number; version_number: number; is_active: boolean }>(`/admin/games/${game}/configurations`, { method: "POST", body }),
  activateConfig: (game: GameCode, id: number) =>
    api<{ ok: boolean }>(`/admin/games/${game}/configurations/${id}/activate`, { method: "POST" }),
  rebuild: (game: GameCode) => api<{ job_id: string }>(`/admin/games/${game}/rebuild`, { method: "POST" }),
  uploadImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api<{ import: ImportRecord; preview: ImportPreview }>("/imports", { method: "POST", formData: fd });
  },
  previewImport: (id: string, sheet?: string) => api<ImportPreview>(`/imports/${id}/preview`, { query: { sheet } }),
  validateImport: (id: string, mapping: ImportMapping) =>
    api<{ import: ImportRecord; report: ImportReport }>(`/imports/${id}/validate`, { method: "POST", body: mapping }),
  commitImport: (id: string) =>
    api<{ import: ImportRecord; publish_jobs: string[] }>(`/imports/${id}/commit`, { method: "POST" }),
  cancelImport: (id: string) => api<ImportRecord>(`/imports/${id}/cancel`, { method: "POST" }),
  acceptInvitation: (body: { token: string; full_name: string; password: string }) =>
    api<import("./types").TokenOut>("/auth/accept-invitation", { method: "POST", body }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    api<{ ok: boolean }>("/auth/change-password", { method: "POST", body }),
};

export { useMutation };
