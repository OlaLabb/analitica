/** Tipos derivados de las respuestas reales del backend (app/api/routes/* y app/engine/*). */

export type GameCode = "BALOTO" | "REVANCHA";
export type Role = "admin" | "user";
export type Variable = "p1" | "p2" | "p3" | "p4" | "p5" | "sn";
export type VariableAny = Variable | "main_any";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Game {
  code: GameCode;
  name: string;
  description: string | null;
  is_active: boolean;
  draw_count: number;
  last_draw_date: string | null;
}

export interface Rules {
  id: number;
  version_number: number;
  name: string;
  main_min: number | null;
  main_max: number | null;
  super_min: number | null;
  super_max: number | null;
  main_unique: boolean | null;
  main_order: "sorted_asc" | "draw_order" | "unknown";
  draw_weekdays: number[] | null;
  notes: string | null;
  /** Categorías oficiales de premio (aciertos en cualquier orden + Súper Número). */
  prize_categories?: PrizeCategory[] | null;
  /** Fuente de la tabla de premios (texto libre, normalmente con URL). */
  prize_source?: string | null;
  created_at: string | null;
  fully_confirmed: boolean;
}

export interface PrizeCategory {
  label: string;
  matches: number;
  super: boolean;
}

export interface HistoricalVersion {
  id: number;
  version_number: number;
  change_type: string;
  description: string | null;
  draw_count: number;
  first_draw_date: string | null;
  last_draw_date: string | null;
  content_hash: string;
  is_append_only: boolean;
  created_at: string | null;
}

export interface SnapshotVar {
  numbers: number[];
  counts: number[];
  draws_since_last: (number | null)[];
  mean_gap: (number | null)[];
}

export interface GameSummary {
  game: { code: GameCode; name: string };
  history: HistoricalVersion | null;
  years_covered: number | null;
  rules: Rules | null;
  next_target_date: string | null;
  official_prediction: {
    id: string;
    target_date: string;
    format?: PredictionFormat;
    suggested?: Suggested | null;
    generated_at: string;
    historical_version_id: number;
    prediction_hash: string;
  } | null;
  last_backtest: { id: string; status: string; started_at: string; conclusion: string | null } | null;
  last_live_evaluation: { target_date: string; results: NumbersEvaluation | LiveResults } | null;
  snapshot: { computation: string; summary: Partial<Record<Variable, SnapshotVar>> } | null;
}

export interface Draw {
  id: number;
  draw_date: string;
  weekday: number;
  draw_number: number | null;
  numbers: number[];
  super_number: number;
  valid_from_version: number;
  valid_to_version: number | null;
  supersedes_id: number | null;
  change_reason: string | null;
  source_import_id: string | null;
}

export interface Paged<T> {
  total: number;
  page?: number;
  page_size?: number;
  items: T[];
}

export interface HistoryChangeOut {
  version: HistoricalVersion;
  publish_job_id: string | null;
}

/* ------------------------------------------------------------------ estadísticas */
export interface WindowDescribe {
  spec: {
    mode: string;
    start: string | null;
    end: string | null;
    n: number | null;
    years: number[] | null;
    months: number[] | null;
    weekdays: number[] | null;
    anchor?: string;
  };
  first_date: string | null;
  last_date: string | null;
  n_draws: number;
  draw_ids_hash?: string;
  warnings: string[];
}

export interface StatsEnvelope<T> {
  window: WindowDescribe;
  historical_version: number | null;
  rules_confirmed: boolean;
  result: T;
}

export interface ChiTest {
  statistic: number | null;
  df: number | null;
  p_value: number | null;
  n?: number;
  cramers_v?: number | null;
  low_expected_share?: number | null;
  warning?: string | null;
}

export interface FreqRow {
  number: number;
  count: number;
  relative: number;
  percent: number;
  ci95_low: number;
  ci95_high: number;
  reference_prob: number;
  expected_count: number;
  z_score: number | null;
  p_value: number | null;
  p_value_bh: number | null;
  significant_bh_05: boolean;
}

export interface FrequencyTable {
  variable: Variable;
  label: string;
  n_draws: number;
  reference: { theoretical: boolean; description?: string; prob?: number };
  gof_test: ChiTest | null;
  n_significant_bh: number;
  rows: FreqRow[];
  warnings: string[];
  interpretation?: string;
}

export interface PooledRow {
  number: number;
  appearances: number;
  draws_containing: number;
  relative: number;
  ci95_low: number;
  ci95_high: number;
  reference_prob: number;
  expected_count: number;
  p_value_bh: number | null;
  significant_bh_05: boolean;
}

export interface PooledFrequency {
  variable: "main_any";
  label: string;
  n_draws: number;
  numbers: number[];
  reference: { theoretical: boolean; prob?: number; description?: string };
  rows: PooledRow[];
  by_position: Record<string, number[]>;
  warnings: string[];
}

export type PositionsFrequency = Record<Variable, FrequencyTable>;

export interface RecurrenceRow {
  number: number;
  appearances: number;
  last_seen_date: string | null;
  draws_since_last: number | null;
  never_seen: boolean;
  gap_mean: number | null;
  gap_median: number | null;
  gap_min: number | null;
  gap_max: number | null;
  gap_std: number | null;
  gap_cv: number | null;
  expected_gap: number | null;
  absence_tail_prob: number | null;
}

export interface Recurrence {
  variable: string;
  label: string;
  n_draws: number;
  rows: RecurrenceRow[];
  gap_histogram: { bins: string[]; observed: number[]; expected_geometric: number[] } | null;
  geometric_fit_test: ChiTest | null;
  warnings: string[];
  interpretation?: string;
}

export interface Rolling {
  variable: string;
  label: string;
  window: number;
  dates: string[];
  series: { number: number; values: (number | null)[]; reference_prob: number }[];
  stability: { number: number; rolling_std: number | null; latest: number | null }[];
  warnings: string[];
}

export interface CompareRow {
  number: number;
  count_a: number;
  count_b: number;
  rel_a: number;
  rel_b: number;
  diff: number;
  p_value: number | null;
  p_value_bh: number | null;
  significant_bh_05: boolean;
}

export interface Compare {
  variable: string;
  label: string;
  label_a: string;
  label_b: string;
  n_a: number;
  n_b: number;
  homogeneity_test: ChiTest | null;
  verdict: string;
  rows: CompareRow[];
  warnings: string[];
  window_b?: WindowDescribe;
}

export interface Yearly {
  variable: string;
  label: string;
  years: number[];
  n_per_year: number[];
  numbers: number[];
  relative: number[][];
  counts: number[][];
  homogeneity_test: ChiTest | null;
  warnings: string[];
}

export interface Distribution {
  variable: string;
  label: string;
  n: number;
  mean: number | null;
  variance: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  quartiles: number[] | null;
  skewness: number | null;
  kurtosis: number | null;
  reference_mean: number | null;
  reference_std: number | null;
  reference_theoretical: boolean;
  concentration: { entropy_normalized: number | null; gini: number | null; top10pct_share: number | null } | null;
  histogram: { numbers: number[]; counts: number[]; expected: number[] } | null;
  gof_test: ChiTest | null;
  warnings: string[];
}

export interface Sums {
  n: number;
  mean: number | null;
  std: number | null;
  reference: { mean: number; std: number } | null;
  histogram: { edges: number[]; counts: number[] } | null;
  parity: { even_count: number[]; observed: number[]; expected: number[] } | null;
  warnings: string[];
}

export interface PairItem {
  pair: [number, number];
  count: number;
  expected: number;
  p_value_bh: number | null;
  significant_bh_05: boolean;
}

export interface Pairs {
  n_draws: number;
  expected_per_pair: number;
  n_pairs: number;
  n_significant_bh: number;
  most_frequent: PairItem[];
  least_frequent: PairItem[];
  matrix: { numbers: number[]; counts: number[][] };
  warnings: string[];
}

export interface Groups {
  size: number;
  n_draws: number;
  groups: { numbers: number[]; count: number }[];
  n_distinct_groups_observed: number;
  warnings?: string[];
}

export interface Repeats {
  lags: { lag: number; n: number; mean_shared: number; expected_mean_shared: number; sn_repeat_rate: number }[];
  lag1_distribution: { shared: number[]; observed: number[]; expected: number[] } | null;
  sn_expected_repeat_rate: number | null;
  warnings: string[];
}

export interface Transitions {
  variable: string;
  label: string;
  numbers: number[];
  matrix: number[][];
  n_transitions: number;
  independence_test: ChiTest | null;
  warnings: string[];
}

export interface PositionRelations {
  variables: string[];
  spearman: (number | null)[][];
  p_values_holm: (number | null)[][];
  warnings: string[];
}

export type Dimension = "weekday" | "month" | "year" | "quarter" | "season" | "week_of_year" | "day_of_month";

export interface GroupedGroup {
  key: number | string;
  label: string;
  n_draws: number;
  insufficient_sample: boolean;
  counts: number[];
  relative: number[];
  top: { number: number; count: number; relative: number; ci95: [number, number] }[];
}

export interface Grouped {
  variable: string;
  label: string;
  dimension: Dimension;
  numbers: number[];
  groups: GroupedGroup[];
  homogeneity_test: ChiTest | null;
  verdict: string;
  warnings: string[];
}

export interface CalendarResult {
  reference_date: string;
  days: number;
  variable: string;
  n_draws: number;
  draws: { draw_date: string; weekday: number; numbers: number[]; sn: number }[];
  rows: { number: number; count_window: number; rel_window: number; rel_overall: number }[];
  warnings: string[];
}

/* ------------------------------------------------------------------ predicciones */
export type PredictionFormat = "numbers_v1" | "positional_v1";

/** Combinación sugerida: 5 números (en cualquier orden, ordenados) + Súper Número. */
export interface Suggested {
  numbers: number[];
  super_number: number | null;
}

/** Probabilidad exacta de una categoría oficial de premio (app/engine/odds.py). */
export interface OddsCategory extends PrizeCategory {
  probability: number;
  one_in: number;
}

export interface Odds {
  available: boolean;
  reason?: string;
  categories: OddsCategory[];
  any_prize_probability: number | null;
  any_prize_one_in: number | null;
  expected_matches_by_chance: number | null;
  match_distribution: { matches: number; probability: number }[];
  note?: string;
}

export interface NumbersCombinations {
  suggested: Suggested | null;
  odds: Odds | null;
}

export interface NumberMetrics {
  times_drawn?: number;
  draws?: number;
  share?: number;
  expected_times_by_chance?: number;
  recent_window?: number;
  recent_times?: number;
  recent_expected_by_chance?: number;
  draws_since_last?: number | null;
  last_seen_date?: string | null;
  average_gap?: number | null;
  expected_gap_by_chance?: number | null;
}

/** Candidato del formato numbers_v1 (app/engine/numbers.py). `score` es la probabilidad real (p. ej. 5/43). */
export interface NumberCandidate {
  rank: number;
  number: number;
  score: number;
  reference_prob: number;
  lift: number;
  uncertainty: { text: string; compatible_with_chance: boolean; range_90: [number, number] | null; p_value_adjusted?: number | null } | null;
  metrics: NumberMetrics;
  factors: Record<string, number> | null;
  explanation: string[] | null;
}

export interface NumbersSupport {
  format?: "numbers_v1";
  disclaimer?: string;
  official_model_description?: string;
  main_reference?: number;
  super_reference?: number;
}

/** Evaluación de una predicción numbers_v1 frente al sorteo real. */
export interface NumbersEvaluation {
  format: "numbers_v1";
  actual: { numbers: number[]; super_number: number };
  suggested: Suggested;
  matches: number;
  super_hit: boolean;
  category: string | null;
  top_list_hits?: number[];
  top_list_size?: number;
}

/* --- formato anterior (por posición), solo lectura --- */
export interface Uncertainty {
  level: string;
  p_value_bh: number | null;
  credible_90: [number, number] | null;
  explanation: string;
  compatible_with_reference: boolean;
}

export interface LegacyCandidate {
  rank: number;
  number: number;
  score: number;
  reference_prob: number;
  lift: number;
  uncertainty: Uncertainty | null;
  metrics: Record<string, number | string | null>;
  factors: Record<string, unknown> | null;
  explanation: string[] | null;
}

export interface Combination {
  numbers: number[];
  criterion: string;
  log_score: number;
  super_number: number;
  lift_vs_reference: number;
  per_position_prob: number[];
  reference_prob_under_uniform: number;
}

export interface LegacyCombinations {
  note?: string;
  items?: Combination[];
  method?: string;
  available: boolean;
  reason?: string;
}

export interface LiveVarResult {
  actual: number;
  rank_in_top: number | null;
  top_k: number;
  hit_top1?: boolean;
  hit_top3?: boolean;
  hit_top5?: boolean;
}
/** Evaluación del formato anterior (services/predictions.evaluate_prediction, rama positional_v1). */
export interface LiveResults {
  format?: "positional_v1";
  actual?: Partial<Record<Variable, number>>;
  variables?: Partial<Record<Variable, LiveVarResult>>;
  combinations?: { numbers: number[]; position_matches?: number; number_matches: number; super_number_match?: boolean }[];
}

interface PredictionBase {
  id: string;
  game_id: number;
  kind: string;
  status: "published" | "superseded" | string;
  target_date: string;
  target_weekday: number;
  generated_at: string;
  published_at: string | null;
  superseded_at: string | null;
  superseded_by_id: string | null;
  historical_version: { number: number; draw_count: number; last_draw_date: string; content_hash: string };
  configuration: { version_number: number; name: string; config_hash: string };
  algorithm_version: string;
  official_model: string;
  data_scope: WindowDescribe & { historical_version?: number };
  prediction_hash: string;
  input_hash: string;
  warnings: string[];
  params?: Record<string, unknown>;
}

export interface NumbersPrediction extends PredictionBase {
  format: "numbers_v1";
  support_metrics: NumbersSupport;
  combinations: NumbersCombinations | null;
  evaluation: NumbersEvaluation | null;
  candidates?: { main?: NumberCandidate[]; sn?: NumberCandidate[] };
}

export interface LegacyPrediction extends PredictionBase {
  format: "positional_v1";
  support_metrics: Record<string, unknown> & { disclaimer?: string; official_model_description?: string };
  combinations: LegacyCombinations | null;
  evaluation: LiveResults | null;
  candidates?: Partial<Record<Variable, LegacyCandidate[]>>;
}

export type Prediction = NumbersPrediction | LegacyPrediction;

export function isNumbersPrediction(p: Prediction): p is NumbersPrediction {
  return p.format === "numbers_v1" || (p.support_metrics as { format?: string } | null)?.format === "numbers_v1";
}

/* ------------------------------------------------------------------ marcador (track record) */
export type StrategyName = "azar" | "frecuencia_historica" | "frecuencia_reciente" | string;
export type StrategyVerdict = "referencia" | "igual_que_el_azar" | "mejor_que_el_azar" | string;

export interface StrategyResult {
  strategy: StrategyName;
  draws: number;
  average_matches: number;
  expected_average_by_chance: number;
  matches_distribution: number[];
  matches_distribution_expected: number[];
  super_hits: number;
  super_hits_expected_by_chance: number;
  prize_categories: { label: string; times: number; expected_by_chance: number }[];
  draws_with_prize: number;
  draws_with_prize_expected: number;
  p_value_matches?: number | null;
  p_value_super?: number | null;
  p_holm_matches?: number | null;
  p_holm_super?: number | null;
  verdict: StrategyVerdict;
  plain?: string;
}

export interface LiveTrackItem {
  target_date: string;
  prediction_id: string;
  format?: "numbers_v1";
  actual: { numbers: number[]; super_number: number };
  suggested: Suggested;
  matches: number;
  super_hit: boolean;
  category: string | null;
}

export interface TrackRecord {
  live: {
    draws: number;
    average_matches: number | null;
    expected_average_by_chance: number | null;
    super_hits: number;
    with_prize: number;
    items: LiveTrackItem[];
  };
  simulation: {
    backtest_id: string;
    draws: number;
    first_date: string | null;
    last_date: string | null;
    headline: string;
    conclusion: string;
    official_strategy: StrategyName;
    strategies: StrategyResult[];
  } | null;
}

/* ------------------------------------------------------------------ backtests */
export interface TopKStat {
  hits: number;
  rate: number;
  p_value: number | null;
  p_holm?: number | null;
  expected_under_null: number;
  random_baseline_hits: number;
  expected_rate_under_null: number;
}

export interface GroupRate {
  n: number;
  group: number | string;
  top5_rate: number | null;
  mean_logloss: number | null;
}

export interface Calibration {
  ece: number | null;
  bins: [number, number][];
  count: number[];
  observed_freq: (number | null)[];
  mean_predicted: (number | null)[];
}

export interface BacktestRow {
  model: string;
  variable: Variable;
  top_k: Record<string, TopKStat>;
  by_year: GroupRate[];
  by_weekday: GroupRate[];
  verdict: "referencia" | "sin_mejora_significativa" | "evidencia_parcial" | "mejora_significativa" | string;
  mean_rank: number | null;
  n_targets: number;
  mean_brier: number | null;
  baseline_brier?: number | null;
  calibration: Calibration | null;
  logloss_diff: number | null;
  logloss_p_value?: number | null;
  logloss_p_holm?: number | null;
  mean_logloss: number | null;
  baseline_logloss?: number | null;
  expected_rank_uniform?: number | null;
}

export interface CombosMatches {
  mean_number_matches: number;
  mean_position_matches: number;
  distribution_number_matches: number[];
}

export interface BacktestSummary {
  rows: BacktestRow[];
  seed: number;
  top_ks: number[];
  overall: Record<string, { mean_logloss_diff: number | null; variables_with_significant_improvement: number }>;
  min_train: number;
  n_targets: number;
  conclusion: string;
  combinations?: {
    n: number;
    available: boolean;
    joint?: CombosMatches;
    random?: CombosMatches;
    independent?: CombosMatches;
    joint_vs_random_p_value?: number | null;
    independent_invalid_share?: number | null;
  };
  last_target_date: string | null;
  first_target_date: string | null;
  multiple_testing: { method: string; n_tests: number };
  historical_version: number;
  configuration_version: number;
}

export interface NumbersBacktestSummary {
  format: "numbers_v1";
  seed: number;
  draws: number;
  min_train: number;
  first_date: string | null;
  last_date: string | null;
  headline: string;
  conclusion: string;
  official_strategy: StrategyName;
  strategies: StrategyResult[];
  historical_version?: number;
  configuration_version?: number;
}

export interface Backtest {
  id: string;
  status: string;
  params: Record<string, unknown>;
  seed: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  historical_version: number;
  configuration_version: number;
  format?: PredictionFormat;
  draws?: number | null;
  headline?: string | null;
  conclusion: string | null;
  summary?: NumbersBacktestSummary | BacktestSummary | null;
}

export function isNumbersSummary(s: NumbersBacktestSummary | BacktestSummary): s is NumbersBacktestSummary {
  return (s as NumbersBacktestSummary).format === "numbers_v1";
}

/** Detalle por sorteo de un backtest numbers_v1. */
export interface BacktestTarget {
  target_date: string;
  draw_id: number | null;
  results: {
    numbers?: number[];
    super_number?: number | null;
    actual?: number[];
    actual_super?: number;
    matches?: number;
    super_hit?: boolean;
    category?: string | null;
  };
}

/* ------------------------------------------------------------------ admin */
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  job_type: string;
  status: JobStatus;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  accept_path: string;
}

export interface ModelsInfo {
  algorithm_version: string;
  available_model_types: Record<string, string>;
  versions: { algorithm_version: string; created_at: string }[];
}

export interface ModelConfiguration {
  id: number;
  version_number: number;
  name: string;
  params: Record<string, unknown>;
  config_hash: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  occurred_at: string;
  actor: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  details: unknown;
  ip_address: string | null;
}

export interface SystemInfo {
  environment: string;
  auth_provider: string;
  auto_publish_on_new_data: boolean;
  algorithm_version: string;
  assistant?: unknown;
}

export interface ImportRecord {
  id: string;
  filename: string;
  file_format: string;
  file_sha256: string;
  file_size: number;
  status: string;
  rows_detected: number | null;
  rows_valid: number | null;
  rows_rejected: number | null;
  rows_duplicate_existing: number | null;
  rows_conflicting_existing: number | null;
  rows_inserted: number | null;
  created_at: string;
  committed_at: string | null;
  created_by: string | null;
  column_mapping?: ImportMapping | null;
  report?: ImportReport | null;
  errors?: ImportRowError[] | null;
}

export interface ImportPreview {
  columns: string[];
  rows: Record<string, string>[];
  total_rows: number;
  sheets: string[];
  suggested_mapping: Record<string, string>;
}

export interface ImportMapping {
  columns: Record<string, string>;
  date_format?: string | null;
  fixed_game?: string | null;
  game_values?: Record<string, string> | null;
  sheet_name?: string | null;
  skip_existing_identical?: boolean;
}

export interface ImportRowError {
  row: number;
  game?: string;
  type: string;
  message: string;
}

export interface ImportObserved {
  main_min?: number;
  main_max?: number;
  super_min?: number;
  super_max?: number;
  all_sorted_ascending?: boolean;
  any_repeated_within_draw?: boolean;
  weekdays?: number[];
}

export interface ImportReport {
  rows_detected: number;
  rows_valid: number;
  rows_rejected: number;
  rows_duplicate_existing: number;
  rows_conflicting_existing: number;
  games: Record<string, { valid_new: number; first_date: string | null; last_date: string | null; rules_confirmed: boolean; observed: ImportObserved }>;
  errors: ImportRowError[];
  errors_truncated: boolean;
  resulting_versions?: Record<string, number>;
}
