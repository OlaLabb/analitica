import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/auth";
import { mutations } from "@/api/hooks";
import { errorMessage } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { AuthLayout } from "./AuthLayout";

const schema = z
  .object({
    full_name: z.string().trim().min(1, "Ingrese su nombre").max(200),
    password: z.string().min(10, "Mínimo 10 caracteres").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export default function AcceptInvitationPage() {
  const [sp] = useSearchParams();
  const token = sp.get("token") ?? "";
  const { acceptSession } = useAuth();
  const nav = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { full_name: "", password: "", confirm: "" } });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const t = await mutations.acceptInvitation({ token, full_name: v.full_name, password: v.password });
      acceptSession(t);
      nav("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthLayout title="Aceptar invitación" subtitle="Cree su cuenta para acceder a la plataforma.">
      {!token ? (
        <Alert variant="destructive" title="Enlace incompleto">
          El enlace no contiene el token de invitación. Solicite un nuevo enlace al administrador. <Link className="text-primary underline" to="/login">Ir a iniciar sesión</Link>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert variant="destructive" title={error} />}
          <Field label="Nombre completo" htmlFor="full_name" error={form.formState.errors.full_name?.message}>
            <Input id="full_name" autoComplete="name" {...form.register("full_name")} />
          </Field>
          <Field label="Contraseña" htmlFor="password" error={form.formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field label="Confirmar contraseña" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Crear cuenta
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            ¿Ya tiene cuenta? <Link className="text-primary hover:underline" to="/login">Iniciar sesión</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
