import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContextForTests } from "@/hooks/auth";
import { RequireAdmin, RequireAuth } from "@/components/layout/guards";
import type { User } from "@/api/types";

function renderWith(user: User | null, path: string, loading = false) {
  const value = {
    user, loading, isAdmin: user?.role === "admin",
    login: async () => user as User, logout: () => {}, acceptSession: () => {},
  };
  return render(
    <AuthContextForTests.Provider value={value}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<p>Pantalla de login</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>Panel privado</p>} />
            <Route path="/admin" element={<RequireAdmin />}>
              <Route path="usuarios" element={<p>Gestión de usuarios</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContextForTests.Provider>,
  );
}

const base: User = { id: "1", email: "a@b.co", full_name: "Ana", role: "user", is_active: true, last_login_at: null };

describe("guardas de ruta", () => {
  it("redirige a /login sin sesión", () => {
    renderWith(null, "/");
    expect(screen.getByText("Pantalla de login")).toBeInTheDocument();
    expect(screen.queryByText("Panel privado")).not.toBeInTheDocument();
  });

  it("muestra la página con sesión", () => {
    renderWith(base, "/");
    expect(screen.getByText("Panel privado")).toBeInTheDocument();
  });

  it("espera mientras se valida el token", () => {
    renderWith(null, "/", true);
    expect(screen.getByText(/verificando sesión/i)).toBeInTheDocument();
  });

  it("bloquea las vistas de administración a usuarios normales", () => {
    renderWith(base, "/admin/usuarios");
    expect(screen.getByText("Acceso restringido")).toBeInTheDocument();
    expect(screen.queryByText("Gestión de usuarios")).not.toBeInTheDocument();
  });

  it("permite las vistas de administración a administradores", () => {
    renderWith({ ...base, role: "admin" }, "/admin/usuarios");
    expect(screen.getByText("Gestión de usuarios")).toBeInTheDocument();
  });
});
