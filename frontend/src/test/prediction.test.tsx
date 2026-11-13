import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContextForTests } from "@/hooks/auth";
import { GameProvider } from "@/hooks/game";
import { TooltipProvider } from "@/components/ui/misc";
import { HistoryRowSummary, LegacyPredictionView } from "@/components/predictions/PredictionParts";
import type { Prediction, User } from "@/api/types";
import { legacyPrediction, numbersPrediction, rules } from "./fixtures";

const state: { official: Prediction | null; list: Prediction[] } = { official: null, list: [] };

vi.mock("@/api/hooks", () => {
  const q = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null, refetch: () => undefined, isFetching: false });
  return {
    useOfficialPrediction: () => q(state.official),
    useSummary: () => q({ game: { code: "BALOTO", name: "Baloto" }, next_target_date: "2026-11-14", rules }),
    usePredictionList: () => q({ total: state.list.length, items: state.list }),
    usePrediction: () => q(undefined),
    mutations: {},
  };
});
vi.mock("@/hooks/jobs", () => ({ useJobTracker: () => ({ tracked: [], track: () => undefined }) }));

const user: User = { id: "1", email: "a@b.co", full_name: "Ana", role: "user", is_active: true, last_login_at: null };

async function renderPage(role: "user" | "admin" = "user") {
  const { default: PredictionPage } = await import("@/pages/PredictionPage");
  const u = { ...user, role };
  return render(
    <AuthContextForTests.Provider value={{ user: u, loading: false, isAdmin: role === "admin", login: async () => u, logout: () => {}, acceptSession: () => {} }}>
      <GameProvider initialGame="BALOTO">
        <TooltipProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <PredictionPage />
          </MemoryRouter>
        </TooltipProvider>
      </GameProvider>
    </AuthContextForTests.Provider>,
  );
}

beforeEach(() => {
  state.official = numbersPrediction;
  state.list = [numbersPrediction, legacyPrediction];
});

describe("Predicción (numbers_v1)", () => {
  it("muestra fecha, balotas, descripción, probabilidades y el historial con ambos formatos", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Predicción" })).toBeInTheDocument();
    expect(screen.getAllByText(/sábado 14 de noviembre de 2026/).length).toBeGreaterThan(0);
    const balls = screen.getByTestId("suggested-balls");
    for (const n of [10, 11, 17, 25, 32]) expect(within(balls).getByLabelText(`Número ${n}`)).toBeInTheDocument();
    expect(within(balls).getByLabelText("Súper Número 7")).toBeInTheDocument();
    expect(screen.getByText(/Combinación elegida al azar respetando las reglas/)).toBeInTheDocument();
    expect(screen.getByText(/todas las combinaciones tienen exactamente la misma probabilidad/)).toBeInTheDocument();
    expect(screen.getByTestId("odds-table")).toHaveTextContent("1 en 15.401.568");
    // Detalles técnicos cerrados por defecto
    expect(screen.getByTestId("technical-details")).not.toHaveAttribute("open");
    // Sin jerga de p-valores en la vista principal
    expect(screen.queryByText(/p-valor|p =|Holm/i)).not.toBeInTheDocument();
    // Historial: vigente vs formato anterior
    const hist = screen.getByTestId("prediction-history");
    expect(within(hist).getByText("Publicada (vigente)")).toBeInTheDocument();
    expect(within(hist).getByText("Reemplazada")).toBeInTheDocument();
    expect(within(hist).getByText(/Formato anterior \(por posición\) — reemplazado/)).toBeInTheDocument();
    // Solo administradores pueden recalcular
    expect(screen.queryByRole("button", { name: /recalcular predicción/i })).not.toBeInTheDocument();
  });

  it("al tocar una balota muestra su explicación y datos simples", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Número 11: ver detalles" }));
    const panel = await screen.findByTestId("number-detail");
    expect(within(panel).getByText("84")).toBeInTheDocument();
    expect(within(panel).getByText(/por azar se esperaban 75,9/)).toBeInTheDocument();
    expect(within(panel).getByText("09/11/2026")).toBeInTheDocument();
    expect(within(panel).getByText(/salió 84 veces en 653 sorteos/)).toBeInTheDocument();
  });

  it("el administrador ve el botón Recalcular predicción", async () => {
    await renderPage("admin");
    expect(screen.getByRole("button", { name: /recalcular predicción/i })).toBeInTheDocument();
  });

  it("si la oficial fuese del formato anterior, se muestra en modo de solo lectura", async () => {
    state.official = legacyPrediction;
    await renderPage();
    expect(screen.getByTestId("legacy-prediction")).toBeInTheDocument();
    expect(screen.queryByTestId("odds-table")).not.toBeInTheDocument();
  });
});

describe("<HistoryRowSummary />", () => {
  it("numbers_v1 evaluada: aciertos, Súper Número y categoría", () => {
    const evaluated = {
      ...numbersPrediction,
      evaluation: {
        format: "numbers_v1" as const,
        actual: { numbers: [3, 10, 17, 30, 41], super_number: 7 },
        suggested: numbersPrediction.combinations!.suggested!,
        matches: 2,
        super_hit: true,
        category: "2 + SB",
      },
    };
    render(<HistoryRowSummary p={evaluated} />);
    expect(screen.getByTestId("history-eval")).toHaveTextContent("Acertó 2 de 5 números y el Súper Número · Premio: 2 + SB");
  });

  it("numbers_v1 pendiente", () => {
    render(<HistoryRowSummary p={numbersPrediction} />);
    expect(screen.getByTestId("history-eval")).toHaveTextContent(/Pendiente/);
  });

  it("formato anterior: etiqueta de reemplazado y sin balotas sugeridas", () => {
    render(<HistoryRowSummary p={legacyPrediction} />);
    expect(screen.getByText("Formato anterior (por posición) — reemplazado")).toBeInTheDocument();
    expect(screen.queryByTestId("history-eval")).not.toBeInTheDocument();
  });

  it("la vista de solo lectura del formato anterior lista sus combinaciones", () => {
    render(<LegacyPredictionView p={legacyPrediction} />);
    expect(screen.getByText("Combinaciones que se mostraban")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Súper Número/).length).toBeGreaterThan(0);
  });
});
