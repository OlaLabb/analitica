import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthContextForTests } from "@/hooks/auth";
import { TooltipProvider } from "@/components/ui/misc";
import { SidebarNav } from "@/components/layout/AppShell";
import type { User } from "@/api/types";

function renderNav(role: "user" | "admin", path = "/") {
  const u: User = { id: "1", email: "a@b.co", full_name: "Ana", role, is_active: true, last_login_at: null };
  return render(
    <AuthContextForTests.Provider value={{ user: u, loading: false, isAdmin: role === "admin", login: async () => u, logout: () => {}, acceptSession: () => {} }}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SidebarNav />
        </MemoryRouter>
      </TooltipProvider>
    </AuthContextForTests.Provider>,
  );
}

describe("navegación", () => {
  it("un usuario normal solo ve Predicción, ¿Cómo le ha ido? e Histórico", () => {
    renderNav("user");
    const links = screen.getAllByRole("link").map((a) => a.textContent);
    expect(links).toEqual(["Predicción", "¿Cómo le ha ido?", "Histórico"]);
    expect(screen.queryByText("Análisis avanzado")).not.toBeInTheDocument();
    expect(screen.queryByText("Estadísticas")).not.toBeInTheDocument();
    expect(screen.queryByText("Administración")).not.toBeInTheDocument();
  });

  it("el administrador ve el grupo «Análisis avanzado» plegado y Administración", async () => {
    renderNav("admin");
    const toggle = screen.getByRole("button", { name: /análisis avanzado/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Estadísticas" })).not.toBeInTheDocument();
    expect(screen.getByText("Administración")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reglas del juego" })).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole("link", { name: "Estadísticas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendario" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Evaluación técnica" })).toBeInTheDocument();
  });

  it("el grupo avanzado se abre solo si la ruta actual está dentro", () => {
    renderNav("admin", "/evaluacion");
    expect(screen.getByRole("link", { name: "Evaluación técnica" })).toBeInTheDocument();
  });
});
