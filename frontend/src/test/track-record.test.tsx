import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { TrackRecord } from "@/api/types";
import { GameProvider } from "@/hooks/game";
import { trackRecord } from "./fixtures";

const state: { data: TrackRecord } = { data: trackRecord };

vi.mock("@/api/hooks", () => ({
  useTrackRecord: () => ({ data: state.data, isLoading: false, isError: false, error: null, refetch: () => undefined }),
}));
// ECharts no funciona en jsdom: se sustituye el gráfico por un marcador.
vi.mock("@/components/charts/charts", () => ({ ObservedExpectedChart: () => <div data-testid="chart" /> }));

async function renderPage() {
  const { default: TrackRecordPage } = await import("@/pages/TrackRecordPage");
  return render(
    <GameProvider initialGame="BALOTO">
      <TrackRecordPage />
    </GameProvider>,
  );
}

describe("¿Cómo le ha ido?", () => {
  it("muestra titular, conclusión y una tarjeta por estrategia con nombres humanos", async () => {
    await renderPage();
    expect(screen.getByTestId("headline")).toHaveTextContent(/553 sorteos/);
    expect(screen.getByTestId("conclusion")).toHaveTextContent("Ningún método supera al azar");
    const cards = screen.getAllByTestId("strategy-card");
    expect(cards).toHaveLength(3);
    // La oficial (azar) va primero
    expect(within(cards[0]).getByText("Combinación al azar (método oficial)")).toBeInTheDocument();
    const titles = cards.map((c) => c.querySelector("h3")?.textContent);
    expect(titles).toEqual(["Combinación al azar (método oficial)", "Números que más han salido", "Números que más han salido últimamente"]);
    expect(screen.getAllByText("Igual que el azar")).toHaveLength(2);
    // Los p-valores solo dentro del detalle plegado
    const details = screen.getByTestId("stat-details");
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getAllByText(/p Holm/).length).toBeGreaterThan(0);
  });

  it("explica que la sección en vivo se llenará con nuevos sorteos", async () => {
    await renderPage();
    expect(screen.getByText("Aún no hay sorteos reales para comparar")).toBeInTheDocument();
  });

  it("lista sorteos reales con aciertos y categoría cuando existen", async () => {
    state.data = {
      ...trackRecord,
      live: {
        draws: 1, average_matches: 2, expected_average_by_chance: 0.5814, super_hits: 1, with_prize: 1,
        items: [{
          target_date: "2026-11-14", prediction_id: "x", format: "numbers_v1",
          suggested: { numbers: [10, 11, 17, 25, 32], super_number: 7 },
          actual: { numbers: [3, 10, 17, 30, 41], super_number: 7 },
          matches: 2, super_hit: true, category: "2 + SB",
        }],
      },
    };
    await renderPage();
    const list = screen.getByTestId("live-items");
    expect(within(list).getByText("Premio 2 + SB")).toBeInTheDocument();
    expect(within(list).getByText(/Acertó 2 de 5 números y el Súper Número/)).toBeInTheDocument();
  });
});
