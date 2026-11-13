import * as React from "react";
import { FileClock, RotateCcw } from "lucide-react";
import { useAudit } from "@/api/hooks";
import type { AuditEntry } from "@/api/types";
import { EmptyState, JsonView, PageHeader, Pagination, QueryState, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";

const ENTITY_TYPES = ["profile", "invitation", "draw", "historical_version", "historical_import", "game_rules", "model_configuration", "prediction", "backtest_run"];
const PAGE_SIZE = 50;

export default function AuditPage() {
  const [action, setAction] = React.useState("");
  const [entity, setEntity] = React.useState("all");
  const [applied, setApplied] = React.useState({ action: "", entity: "all" });
  const [page, setPage] = React.useState(1);
  const [detail, setDetail] = React.useState<AuditEntry | null>(null);
  const q = useAudit({ action: applied.action || undefined, entity_type: applied.entity === "all" ? undefined : applied.entity, page, page_size: PAGE_SIZE });
  return (
    <div className="space-y-5">
      <PageHeader icon={FileClock} title="Auditoría" description="Registro inmutable de operaciones: inicios de sesión, cambios en el histórico, reglas, usuarios, configuraciones e importaciones." />
      <Section title="Eventos">
        <form
          className="mb-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied({ action, entity });
          }}
        >
          <div className="flex w-56 flex-col gap-1.5">
            <Label htmlFor="a-action">Acción contiene</Label>
            <Input id="a-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ej. login, draw, rules" />
          </div>
          <div className="flex w-56 flex-col gap-1.5">
            <Label htmlFor="a-entity">Tipo de entidad</Label>
            <SimpleSelect id="a-entity" value={entity} onChange={setEntity} options={[{ value: "all", label: "Todas" }, ...ENTITY_TYPES.map((t) => ({ value: t, label: t }))]} />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setAction(""); setEntity("all"); setApplied({ action: "", entity: "all" }); setPage(1); }}>
            <RotateCcw /> Limpiar
          </Button>
        </form>
        <QueryState query={q} loadingHeight={300} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="Sin eventos para estos filtros" />}>
          {(d) => (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Actor</TH>
                    <TH>Acción</TH>
                    <TH>Entidad</TH>
                    <TH>IP</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {d.items.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-xs">{fmtDateTime(e.occurred_at)}</TD>
                      <TD className="text-xs">{e.actor ?? <span className="text-muted-foreground">sistema / anónimo</span>}</TD>
                      <TD><Badge variant={e.action.includes("failed") ? "destructive" : "secondary"} className="font-mono">{e.action}</Badge></TD>
                      <TD className="max-w-[220px] truncate text-xs">{e.entity_type ?? "—"} <span className="font-mono text-muted-foreground">{e.entity_id ?? ""}</span></TD>
                      <TD className="font-mono text-xs text-muted-foreground">{e.ip_address ?? "—"}</TD>
                      <TD className="text-right">
                        {!!(e.before || e.after || e.details) && <Button size="sm" variant="ghost" onClick={() => setDetail(e)}>Detalle</Button>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={PAGE_SIZE} total={d.total} onPage={setPage} />
            </>
          )}
        </QueryState>
      </Section>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{detail?.action}</DialogTitle>
            <DialogDescription>{detail && fmtDateTime(detail.occurred_at)} · {detail?.actor ?? "—"}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid gap-3 md:grid-cols-2">
              {detail.before != null && <div><p className="mb-1 text-xs font-semibold">Antes</p><JsonView value={detail.before} /></div>}
              {detail.after != null && <div><p className="mb-1 text-xs font-semibold">Después</p><JsonView value={detail.after} /></div>}
              {detail.details != null && <div className="md:col-span-2"><p className="mb-1 text-xs font-semibold">Detalles</p><JsonView value={detail.details} /></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
