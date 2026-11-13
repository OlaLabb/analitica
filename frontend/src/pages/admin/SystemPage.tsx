import { toast } from "sonner";
import { Hammer, ServerCog } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useJobTracker } from "@/hooks/jobs";
import { mutations, useGames, useSystem } from "@/api/hooks";
import { API_URL, errorMessage } from "@/api/client";
import { KeyValue, PageHeader, QueryState, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { fmtDate, fmtInt } from "@/lib/format";

export default function SystemPage() {
  const { game } = useGame();
  const sys = useSystem();
  const games = useGames();
  const { track } = useJobTracker();
  return (
    <div className="space-y-5">
      <PageHeader icon={ServerCog} title="Sistema" description="Información del entorno y operaciones de mantenimiento del motor estadístico." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Entorno">
          <QueryState query={sys} loadingHeight={120}>
            {(s) => (
              <KeyValue
                items={[
                  ["Entorno", <Badge key="e" variant={s.environment === "production" ? "warning" : "secondary"}>{s.environment}</Badge>],
                  ["Autenticación", s.auth_provider],
                  ["Publicación automática con datos nuevos", s.auto_publish_on_new_data ? "Activada" : "Desactivada"],
                  ["Versión del algoritmo", s.algorithm_version],
                  ["API", API_URL],
                ]}
              />
            )}
          </QueryState>
        </Section>
        <Section title="Juegos">
          <QueryState query={games} loadingHeight={120}>
            {(gs) => (
              <div className="space-y-2">
                {gs.map((g) => (
                  <div key={g.code} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-semibold">{g.name} <span className="font-mono text-xs text-muted-foreground">{g.code}</span></p>
                      <p className="text-xs text-muted-foreground">{g.description}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold tabular-nums">{fmtInt(g.draw_count)} sorteos</p>
                      <p className="text-muted-foreground">último {fmtDate(g.last_draw_date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </QueryState>
        </Section>
      </div>
      <Section
        title={`Reconstrucción del motor · ${game}`}
        description="Recalcula desde cero el snapshot estadístico de la versión vigente del histórico. Úselo tras cambios de algoritmo o si detecta inconsistencias. No modifica sorteos ni predicciones publicadas."
      >
        <ConfirmDialog
          trigger={<Button><Hammer /> Reconstruir {game}</Button>}
          title={`Reconstruir motor de ${game}`}
          description="Se encolará un trabajo de reconstrucción. Puede tardar algunos segundos; el avance se muestra en Trabajos."
          confirmLabel="Reconstruir"
          onConfirm={async () => {
            try {
              const r = await mutations.rebuild(game);
              track(r.job_id, `Reconstrucción ${game}`, game);
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      </Section>
    </div>
  );
}
