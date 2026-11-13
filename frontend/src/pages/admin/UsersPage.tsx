import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, MailPlus, Pencil, UserPlus, Users } from "lucide-react";
import { mutations, useUsers } from "@/api/hooks";
import { errorMessage } from "@/api/client";
import type { Invitation, User } from "@/api/types";
import { useAuth } from "@/hooks/auth";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";

export default function UsersPage() {
  const q = useUsers();
  const { user: me } = useAuth();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [inviting, setInviting] = React.useState(false);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Usuarios"
        description="Gestione cuentas y roles. Las invitaciones generan un enlace que usted entrega al invitado (no se envía correo)."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setInviting(true)}><MailPlus /> Invitar</Button>
            <Button size="sm" onClick={() => setCreating(true)}><UserPlus /> Crear usuario</Button>
          </>
        }
      />
      <Section title="Cuentas">
        {q.isLoading ? (
          <LoadingBlock height={160} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Sin usuarios" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Correo</TH>
                <TH>Rol</TH>
                <TH>Estado</TH>
                <TH>Último acceso</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {q.data.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.full_name}{u.id === me?.id && <Badge variant="outline" className="ml-2">Usted</Badge>}</TD>
                  <TD className="text-xs">{u.email}</TD>
                  <TD><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role === "admin" ? "Administrador" : "Usuario"}</Badge></TD>
                  <TD>{u.is_active ? <Badge variant="success">Activo</Badge> : <Badge variant="destructive">Inactivo</Badge>}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(u.last_login_at)}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}><Pencil /> Editar</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
      {creating && <CreateUserDialog onClose={() => setCreating(false)} />}
      {editing && <EditUserDialog user={editing} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  );
}

const createSchema = z.object({
  email: z.string().email("Correo inválido"),
  full_name: z.string().trim().min(1, "Requerido").max(200),
  role: z.enum(["user", "admin"]),
  password: z.string().min(10, "Mínimo 10 caracteres").max(200),
});

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema), defaultValues: { email: "", full_name: "", role: "user", password: "" } });
  const [error, setError] = React.useState<string | null>(null);
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await mutations.createUser(v);
      toast.success("Usuario creado");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const errs = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
          <DialogDescription>Comparta la contraseña inicial por un canal seguro; el usuario puede cambiarla luego.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {error && <Alert variant="destructive" title={error} />}
          <Field label="Nombre completo" htmlFor="u-name" error={errs.full_name?.message}><Input id="u-name" {...form.register("full_name")} /></Field>
          <Field label="Correo" htmlFor="u-email" error={errs.email?.message}><Input id="u-email" type="email" {...form.register("email")} /></Field>
          <Field label="Rol" htmlFor="u-role">
            <Controller control={form.control} name="role" render={({ field }) => (
              <SimpleSelect id="u-role" value={field.value} onChange={field.onChange} options={[{ value: "user", label: "Usuario" }, { value: "admin", label: "Administrador" }]} />
            )} />
          </Field>
          <Field label="Contraseña inicial" htmlFor="u-pw" error={errs.password?.message}><Input id="u-pw" type="password" autoComplete="new-password" {...form.register("password")} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  full_name: z.string().trim().min(1, "Requerido").max(200),
  role: z.enum(["user", "admin"]),
  is_active: z.boolean(),
  password: z.string().refine((v) => v === "" || v.length >= 10, "Mínimo 10 caracteres"),
});

function EditUserDialog({ user, isSelf, onClose }: { user: User; isSelf: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { full_name: user.full_name, role: user.role, is_active: user.is_active, password: "" },
  });
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const values = form.watch();
  const sensitive = values.role !== user.role || values.is_active !== user.is_active || values.password !== "";
  const doSave = async () => {
    const v = form.getValues();
    setError(null);
    try {
      await mutations.updateUser(user.id, {
        full_name: v.full_name !== user.full_name ? v.full_name : undefined,
        role: v.role !== user.role ? v.role : undefined,
        is_active: v.is_active !== user.is_active ? v.is_active : undefined,
        password: v.password || undefined,
      });
      toast.success("Usuario actualizado");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const submit = form.handleSubmit(() => (sensitive ? setConfirmOpen(true) : doSave()));
  const errs = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {user.email}</DialogTitle>
          <DialogDescription>Deje la contraseña vacía para no cambiarla.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          {error && <Alert variant="destructive" title={error} />}
          {isSelf && <Alert variant="info" title="No puede quitarse el rol de administrador ni desactivar su propia cuenta." />}
          <Field label="Nombre completo" htmlFor="e-name" error={errs.full_name?.message}><Input id="e-name" {...form.register("full_name")} /></Field>
          <Field label="Rol" htmlFor="e-role">
            <Controller control={form.control} name="role" render={({ field }) => (
              <SimpleSelect id="e-role" value={field.value} onChange={field.onChange} disabled={isSelf} options={[{ value: "user", label: "Usuario" }, { value: "admin", label: "Administrador" }]} />
            )} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Controller control={form.control} name="is_active" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSelf} />} />
            Cuenta activa
          </label>
          <Field label="Nueva contraseña (opcional)" htmlFor="e-pw" error={errs.password?.message}><Input id="e-pw" type="password" autoComplete="new-password" {...form.register("password")} /></Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" loading={form.formState.isSubmitting}>Guardar</Button>
          </DialogFooter>
        </form>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirmar cambios sensibles"
          description="Va a modificar el rol, el estado o la contraseña de este usuario. El cambio queda registrado en la auditoría."
          onConfirm={() => void doSave()}
        />
      </DialogContent>
    </Dialog>
  );
}

const inviteSchema = z.object({
  email: z.string().email("Correo inválido"),
  role: z.enum(["user", "admin"]),
  days_valid: z.coerce.number().int().min(1, "1–60").max(60, "1–60"),
});

function InviteDialog({ onClose }: { onClose: () => void }) {
  const form = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "user", days_valid: 7 } });
  const [inv, setInv] = React.useState<Invitation | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const link = inv ? `${window.location.origin}${inv.accept_path}` : "";
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      setInv(await mutations.invite(v));
    } catch (e) {
      setError(errorMessage(e));
    }
  });
  const errs = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>Se genera un enlace de un solo uso. Entréguelo al invitado por un canal seguro.</DialogDescription>
        </DialogHeader>
        {inv ? (
          <div className="space-y-3">
            <Alert variant="success" title={`Invitación creada para ${inv.email}`}>Vence el {fmtDateTime(inv.expires_at)}. El enlace solo se muestra ahora.</Alert>
            <div className="flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Enlace de invitación" className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success("Enlace copiado")).catch(() => toast.error("No se pudo copiar"))}
              >
                <Copy /> Copiar
              </Button>
            </div>
            <DialogFooter><Button onClick={onClose}>Cerrar</Button></DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            {error && <Alert variant="destructive" title={error} />}
            <Field label="Correo" htmlFor="i-email" error={errs.email?.message}><Input id="i-email" type="email" {...form.register("email")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rol" htmlFor="i-role">
                <Controller control={form.control} name="role" render={({ field }) => (
                  <SimpleSelect id="i-role" value={field.value} onChange={field.onChange} options={[{ value: "user", label: "Usuario" }, { value: "admin", label: "Administrador" }]} />
                )} />
              </Field>
              <Field label="Días de validez" htmlFor="i-days" error={errs.days_valid?.message}><Input id="i-days" type="number" {...form.register("days_valid")} /></Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>Generar enlace</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
