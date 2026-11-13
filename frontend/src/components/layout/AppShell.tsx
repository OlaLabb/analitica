import * as React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, CalendarDays, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardCheck, Cog, FileClock, FileUp, History,
  ListChecks, LogOut, Menu, Moon, Scale, ServerCog, Sparkles, Sun, Trophy, Users, KeyRound, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/auth";
import { GAMES, useGame } from "@/hooks/game";
import { useTheme } from "@/hooks/theme";
import { useJobTracker } from "@/hooks/jobs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Tip } from "@/components/ui/misc";
import { mutations } from "@/api/hooks";
import { errorMessage } from "@/api/client";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

/** Menú principal (todos los usuarios). */
export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Predicción", icon: Sparkles },
  { to: "/como-le-ha-ido", label: "¿Cómo le ha ido?", icon: Trophy },
  { to: "/historico", label: "Histórico", icon: History },
];
/** Grupo plegable solo para administradores. */
export const ADVANCED_NAV: NavItem[] = [
  { to: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/evaluacion", label: "Evaluación técnica", icon: ClipboardCheck },
];
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin/importacion", label: "Importación", icon: FileUp },
  { to: "/admin/reglas", label: "Reglas del juego", icon: Scale },
  { to: "/admin/usuarios", label: "Usuarios", icon: Users },
  { to: "/admin/modelos", label: "Configuración de modelos", icon: Cog },
  { to: "/admin/auditoria", label: "Auditoría", icon: FileClock },
  { to: "/admin/trabajos", label: "Trabajos", icon: ListChecks },
  { to: "/admin/sistema", label: "Sistema", icon: ServerCog },
];

const ADV_KEY = "as.nav.advanced";

function NavItemLink({ it, collapsed, onNavigate, small }: { it: NavItem; collapsed?: boolean; onNavigate?: () => void; small?: boolean }) {
  const link = (
    <NavLink
      to={it.to}
      end={it.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          small ? "py-1.5 text-[13px]" : "py-2.5 text-sm",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-primary/10 font-semibold text-primary"
            : "text-sidebar-foreground/75 hover:bg-muted hover:text-sidebar-foreground",
        )
      }
    >
      <it.icon className={cn("shrink-0", small ? "h-4 w-4" : "h-[18px] w-[18px]")} />
      {!collapsed && <span className="truncate">{it.label}</span>}
    </NavLink>
  );
  return collapsed ? (
    <Tip content={it.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">{children}</p>;
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  const loc = useLocation();
  const inAdvanced = ADVANCED_NAV.some((it) => loc.pathname.startsWith(it.to));
  const [advOpen, setAdvOpen] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(ADV_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleAdv = () =>
    setAdvOpen((o) => {
      try {
        localStorage.setItem(ADV_KEY, o ? "0" : "1");
      } catch {
        /* noop */
      }
      return !o;
    });
  const showAdv = advOpen || inAdvanced || !!collapsed;

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4" aria-label="Navegación principal">
      <div className="space-y-1">
        {MAIN_NAV.map((it) => (
          <NavItemLink key={it.to} it={it} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
      {isAdmin && (
        <div className="space-y-0.5">
          {collapsed ? (
            <div className="mx-3 mb-1 border-t" />
          ) : (
            <button
              type="button"
              onClick={toggleAdv}
              aria-expanded={showAdv}
              className="flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Análisis avanzado
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdv && "rotate-180")} />
            </button>
          )}
          {showAdv && ADVANCED_NAV.map((it) => <NavItemLink key={it.to} it={it} collapsed={collapsed} onNavigate={onNavigate} small />)}
        </div>
      )}
      {isAdmin && (
        <div className="space-y-0.5">
          {collapsed ? <div className="mx-3 mb-1 border-t" /> : <SectionLabel>Administración</SectionLabel>}
          {ADMIN_NAV.map((it) => (
            <NavItemLink key={it.to} it={it} collapsed={collapsed} onNavigate={onNavigate} small />
          ))}
        </div>
      )}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex h-14 items-center gap-2.5 border-b px-4", collapsed && "justify-center px-2")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ball text-ball-foreground shadow-sm">
        <span className="text-sm font-bold">5</span>
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-sidebar-foreground">Analítica de Sorteos</p>
          <p className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Probabilidades reales</p>
        </div>
      )}
    </div>
  );
}

export function GameSelector() {
  const { game, setGame } = useGame();
  return (
    <div role="radiogroup" aria-label="Juego" className="inline-flex rounded-lg border bg-muted p-0.5">
      {GAMES.map((g) => (
        <button
          key={g.code}
          role="radio"
          aria-checked={game === g.code}
          onClick={() => setGame(g.code)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            game === g.code ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

const pwSchema = z
  .object({
    current_password: z.string().min(1, "Requerido"),
    new_password: z.string().min(10, "Mínimo 10 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.new_password === d.confirm, { message: "No coincide", path: ["confirm"] });

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const form = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema), defaultValues: { current_password: "", new_password: "", confirm: "" } });
  const [busy, setBusy] = React.useState(false);
  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    try {
      await mutations.changePassword({ current_password: v.current_password, new_password: v.new_password });
      toast.success("Contraseña actualizada");
      form.reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>La nueva contraseña debe tener al menos 10 caracteres.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Contraseña actual" htmlFor="cp-cur" error={form.formState.errors.current_password?.message}>
            <Input id="cp-cur" type="password" autoComplete="current-password" {...form.register("current_password")} />
          </Field>
          <Field label="Nueva contraseña" htmlFor="cp-new" error={form.formState.errors.new_password?.message}>
            <Input id="cp-new" type="password" autoComplete="new-password" {...form.register("new_password")} />
          </Field>
          <Field label="Confirmar" htmlFor="cp-conf" error={form.formState.errors.confirm?.message}>
            <Input id="cp-conf" type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [pw, setPw] = React.useState(false);
  if (!user) return null;
  const initials = (user.full_name || user.email)
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menú de usuario">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials}</span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block max-w-[140px] truncate text-xs font-medium">{user.full_name}</span>
              <span className="block text-[10px] text-muted-foreground">{user.role === "admin" ? "Administrador" : "Usuario"}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <span className="block truncate">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPw(true)}>
            <KeyRound /> Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={logout}>
            <LogOut /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
    </>
  );
}

function RunningJobs() {
  const { tracked } = useJobTracker();
  if (!tracked.length) return null;
  return (
    <Tip content={tracked.map((t) => t.label).join(", ")}>
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> {tracked.length} trabajo{tracked.length > 1 ? "s" : ""}
      </Badge>
    </Tip>
  );
}

export function AppShell() {
  const [theme, setTheme] = useTheme();
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("as.sidebar") === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const loc = useLocation();
  React.useEffect(() => setMobileOpen(false), [loc.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("as.sidebar", c ? "0" : "1");
      } catch {
        /* noop */
      }
      return !c;
    });
  };

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Brand collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} />
        <div className="border-t p-2">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/60 hover:bg-muted hover:text-sidebar-foreground"
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Contraer</>}
          </button>
        </div>
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col border-none bg-sidebar p-0 text-sidebar-foreground">
          <DialogTitle className="sr-only">Menú</DialogTitle>
          <Brand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <Menu />
          </Button>
          <GameSelector />
          <div className="ml-auto flex items-center gap-2">
            <RunningJobs />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema oscuro"}
              title={theme === "dark" ? "Usar tema claro" : "Usar tema oscuro"}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 sm:px-5 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t px-5 py-3 text-center text-[11px] text-muted-foreground">
          Los sorteos son aleatorios: ninguna herramienta puede garantizar aciertos. Juegue con responsabilidad.
        </footer>
      </div>
    </div>
  );
}
