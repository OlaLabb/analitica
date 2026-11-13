import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2, ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/auth";
import { EmptyState } from "@/components/common";

/** Exige sesión iniciada; si no, redirige a /login conservando el destino. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando sesión…
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

/** Oculta las vistas de administración a usuarios sin rol admin (el backend también lo exige). */
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin)
    return (
      <EmptyState
        icon={ShieldOff}
        title="Acceso restringido"
        description="Esta sección es solo para administradores. Si necesita acceso, contacte a un administrador."
      />
    );
  return <Outlet />;
}
