import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OddsTable, categoryWords, splitSource } from "@/components/predictions/OddsTable";
import { fmtDateHuman, fmtOneIn, fmtProbPct } from "@/lib/format";
import { numbersPrediction, rules } from "./fixtures";

const odds = numbersPrediction.combinations!.odds!;

describe("formato de probabilidades", () => {
  it("usa separador de miles es-CO en «1 en X»", () => {
    expect(fmtOneIn(15401568)).toBe("1 en 15.401.568");
    expect(fmtOneIn(22)).toBe("1 en 22");
    expect(fmtOneIn(null)).toBe("—");
  });

  it("no muestra 0,00 % para premios muy improbables", () => {
    expect(fmtProbPct(0.045569256325070286)).toBe("4,56 %");
    expect(fmtProbPct(6.492845403792653e-8)).toBe("0,0000065 %");
    expect(fmtProbPct(0.006846705478299353)).toBe("0,68 %");
  });

  it("escribe la fecha en palabras", () => {
    expect(fmtDateHuman("2026-11-14")).toBe("sábado 14 de noviembre de 2026");
  });

  it("describe cada categoría en palabras", () => {
    expect(categoryWords({ matches: 4, super: true })).toBe("4 números y el Súper Número");
    expect(categoryWords({ matches: 0, super: true })).toBe("Solo el Súper Número");
    expect(categoryWords({ matches: 1, super: false })).toBe("1 número (sin el Súper Número)");
  });

  it("separa la URL de la fuente", () => {
    expect(splitSource("https://baloto.com/x (tabla oficial, consultada 2026-11-13)")).toEqual({
      url: "https://baloto.com/x",
      rest: "tabla oficial, consultada 2026-11-13",
    });
  });
});

describe("<OddsTable />", () => {
  it("muestra cada categoría oficial con «1 en X» y la probabilidad de algún premio", () => {
    render(<OddsTable odds={odds} prizeCategories={rules.prize_categories} prizeSource={rules.prize_source} />);
    const table = screen.getByTestId("odds-table");
    const first = within(table).getAllByRole("row")[1];
    expect(within(first).getByText("5 + SB")).toBeInTheDocument();
    expect(within(first).getByTestId("one-in")).toHaveTextContent("1 en 15.401.568");
    expect(within(table).getByText("4 + SB")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(1 + odds.categories.length);
    expect(screen.getByTestId("any-prize")).toHaveTextContent("1 en 22");
    expect(screen.getByTestId("any-prize")).toHaveTextContent("4,56 %");
    expect(screen.getByRole("link", { name: /fuente/i })).toHaveAttribute("href", "https://baloto.com/resultados-baloto/2734");
  });

  it("aclara que «1 + SB» no está en la tabla oficial solo cuando falta", () => {
    const { unmount } = render(<OddsTable odds={odds} prizeCategories={rules.prize_categories} />);
    expect(screen.getByTestId("no-one-sb")).toHaveTextContent("«1 + SB» no aparece");
    unmount();
    render(<OddsTable odds={odds} prizeCategories={[...(rules.prize_categories ?? []), { label: "1 + SB", matches: 1, super: true }]} />);
    expect(screen.queryByTestId("no-one-sb")).not.toBeInTheDocument();
  });

  it("explica cuando no hay probabilidades disponibles", () => {
    render(<OddsTable odds={{ ...odds, available: false, categories: [], reason: "Faltan las reglas" }} />);
    expect(screen.getByText("Faltan las reglas")).toBeInTheDocument();
  });
});
