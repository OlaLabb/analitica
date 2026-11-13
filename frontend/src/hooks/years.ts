import { useSummary } from "@/api/hooks";
import type { GameCode } from "@/api/types";
import { yearsBetween } from "@/components/stats/WindowFilter";

export function useAvailableYears(game: GameCode): number[] {
  const s = useSummary(game);
  return yearsBetween(s.data?.history?.first_draw_date, s.data?.history?.last_draw_date);
}
