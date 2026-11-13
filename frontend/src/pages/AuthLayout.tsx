import * as React from "react";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr,1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary-foreground)) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ball text-ball-foreground shadow">
            <span className="text-sm font-bold">5</span>
          </div>
          <span className="font-semibold">Analítica de Sorteos</span>
        </div>
        <div className="relative max-w-md space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">La predicción de BALOTO y REVANCHA, con probabilidades reales.</h2>
          <p className="text-sm leading-relaxed text-primary-foreground/80">
            Una combinación sugerida para cada sorteo, la probabilidad exacta de cada premio y un marcador honesto de cómo le ha ido
            frente al azar. Sin inventar nada.
          </p>
          <p className="border-l-2 border-ball pl-3 text-xs text-primary-foreground/75">
            Los sorteos son aleatorios. Esta plataforma no promete ni facilita ganar.
          </p>
        </div>
        <p className="relative text-[11px] text-primary-foreground/60">Uso interno · Datos del backend en tiempo real</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ball text-ball-foreground shadow-sm">
                <span className="text-sm font-bold">5</span>
              </div>
              <span className="font-semibold">Analítica de Sorteos</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
