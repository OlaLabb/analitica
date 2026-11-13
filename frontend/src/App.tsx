import * as React from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiError } from "@/api/client";
import { AuthProvider } from "@/hooks/auth";
import { GameProvider } from "@/hooks/game";
import { JobTrackerProvider } from "@/hooks/jobs";
import { useIsDark } from "@/hooks/theme";
import { TooltipProvider } from "@/components/ui/misc";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin, RequireAuth } from "@/components/layout/guards";
import { LoadingBlock } from "@/components/common";
import LoginPage from "@/pages/LoginPage";
import AcceptInvitationPage from "@/pages/AcceptInvitationPage";

const PredictionPage = React.lazy(() => import("@/pages/PredictionPage"));
const TrackRecordPage = React.lazy(() => import("@/pages/TrackRecordPage"));
const HistoryPage = React.lazy(() => import("@/pages/HistoryPage"));
const StatsPage = React.lazy(() => import("@/pages/StatsPage"));
const CalendarPage = React.lazy(() => import("@/pages/CalendarPage"));
const EvaluationPage = React.lazy(() => import("@/pages/EvaluationPage"));
const ImportPage = React.lazy(() => import("@/pages/admin/ImportPage"));
const RulesPage = React.lazy(() => import("@/pages/admin/RulesPage"));
const UsersPage = React.lazy(() => import("@/pages/admin/UsersPage"));
const ModelsPage = React.lazy(() => import("@/pages/admin/ModelsPage"));
const AuditPage = React.lazy(() => import("@/pages/admin/AuditPage"));
const JobsPage = React.lazy(() => import("@/pages/admin/JobsPage"));
const SystemPage = React.lazy(() => import("@/pages/admin/SystemPage"));

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          const s = err instanceof ApiError ? err.status : 0;
          if (s >= 400 && s < 500) return false;
          return count < 2;
        },
      },
    },
  });
}

function ThemedToaster() {
  const dark = useIsDark();
  return <Toaster theme={dark ? "dark" : "light"} richColors closeButton position="bottom-right" />;
}

export function Providers({ children, client }: { children: React.ReactNode; client?: QueryClient }) {
  const [qc] = React.useState(() => client ?? makeQueryClient());
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <GameProvider>
          <TooltipProvider>
            <JobTrackerProvider>
              {children}
              <ThemedToaster />
            </JobTrackerProvider>
          </TooltipProvider>
        </GameProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/aceptar-invitacion" element={<AcceptInvitationPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route
            element={
              <React.Suspense fallback={<LoadingBlock height={400} />}>
                <SuspenseOutlet />
              </React.Suspense>
            }
          >
            <Route index element={<PredictionPage />} />
            <Route path="como-le-ha-ido" element={<TrackRecordPage />} />
            <Route path="historico" element={<HistoryPage />} />
            {/* Rutas antiguas */}
            <Route path="predicciones" element={<Navigate to="/" replace />} />
            {/* Análisis avanzado: solo administradores */}
            <Route element={<RequireAdmin />}>
              <Route path="estadisticas" element={<StatsPage />} />
              <Route path="calendario" element={<CalendarPage />} />
              <Route path="evaluacion" element={<EvaluationPage />} />
            </Route>
            <Route path="admin" element={<RequireAdmin />}>
              <Route index element={<Navigate to="importacion" replace />} />
              <Route path="importacion" element={<ImportPage />} />
              <Route path="reglas" element={<RulesPage />} />
              <Route path="usuarios" element={<UsersPage />} />
              <Route path="modelos" element={<ModelsPage />} />
              <Route path="auditoria" element={<AuditPage />} />
              <Route path="trabajos" element={<JobsPage />} />
              <Route path="sistema" element={<SystemPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

function SuspenseOutlet() {
  return <Outlet />;
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-4xl font-semibold text-muted-foreground">404</p>
      <p className="mt-2 text-sm text-muted-foreground">La página solicitada no existe.</p>
    </div>
  );
}
