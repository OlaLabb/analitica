import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WindowFilter } from "@/components/stats/WindowFilter";
import { windowFromSearch, windowIncomplete, windowToParams, windowToSearch, type WindowState } from "@/lib/window";

describe("windowToParams", () => {
  it("solo envía los parámetros relevantes para el modo", () => {
    expect(windowToParams({ mode: "all" })).toEqual({ mode: "all" });
    expect(windowToParams({ mode: "last_n_draws", n: 100, start: "2024-01-01" })).toEqual({ mode: "last_n_draws", n: 100 });
    expect(windowToParams({ mode: "date_range", start: "2023-01-01", end: "2023-12-31", n: 5 })).toEqual({
      mode: "date_range", start: "2023-01-01", end: "2023-12-31",
    });
    expect(windowToParams({ mode: "years", years: [2024, 2023], weekdays: [5, 0, 2], months: [12, 1] })).toEqual({
      mode: "years", years: "2023,2024", weekdays: "0,2,5", months: "1,12",
    });
  });

  it("aplica prefijo para la ventana B de comparación", () => {
    expect(windowToParams({ mode: "last_n_years", n: 2 }, "b_")).toEqual({ b_mode: "last_n_years", b_n: 2 });
  });

  it("detecta ventanas incompletas", () => {
    expect(windowIncomplete({ mode: "last_n_months" })).toBeTruthy();
    expect(windowIncomplete({ mode: "years", years: [] })).toBeTruthy();
    expect(windowIncomplete({ mode: "date_range" })).toBeTruthy();
    expect(windowIncomplete({ mode: "date_range", start: "2024-01-01" })).toBeNull();
  });

  it("serializa y lee la ventana desde la URL", () => {
    const w: WindowState = { mode: "years", years: [2022, 2023], weekdays: [2] };
    const sp = windowToSearch(w, new URLSearchParams("tab=frecuencias"));
    expect(sp.get("tab")).toBe("frecuencias");
    expect(sp.get("w_years")).toBe("2022,2023");
    expect(windowFromSearch(sp)).toMatchObject({ mode: "years", years: [2022, 2023], weekdays: [2] });
    expect(windowFromSearch(new URLSearchParams("w_mode=bogus"))).toEqual({ mode: "all" });
  });
});

describe("<WindowFilter />", () => {
  it("aplica el borrador solo al pulsar Aplicar y genera los parámetros de consulta", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WindowFilter value={{ mode: "last_n_draws", n: 200 }} onChange={onChange} />);

    const n = screen.getByLabelText("N");
    await user.clear(n);
    await user.type(n, "50");
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /más filtros/i }));
    await user.click(screen.getByRole("button", { name: "Sáb" }));
    await user.click(screen.getByRole("button", { name: "Lun" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const applied = onChange.mock.calls[0][0] as WindowState;
    expect(windowToParams(applied)).toEqual({ mode: "last_n_draws", n: 50, weekdays: "0,5" });
  });

  it("deshabilita Aplicar cuando falta N", async () => {
    const user = userEvent.setup();
    render(<WindowFilter value={{ mode: "last_n_draws", n: 200 }} onChange={vi.fn()} />);
    await user.clear(screen.getByLabelText("N"));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(screen.getByText("Indique N")).toBeInTheDocument();
  });

  it("Restablecer vuelve a todo el histórico", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WindowFilter value={{ mode: "last_n_draws", n: 30 }} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /restablecer/i }));
    expect(onChange).toHaveBeenCalledWith({ mode: "all" });
  });
});
