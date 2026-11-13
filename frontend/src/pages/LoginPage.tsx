import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/auth";
import { errorMessage } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { AuthLayout } from "./AuthLayout";

const schema = z.object({
  email: z.string().min(1, "Ingrese su correo").email("Correo inválido"),
  password: z.string().min(1, "Ingrese su contraseña"),
});

export default function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/";
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.email, v.password);
      nav(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthLayout title="Iniciar sesión" subtitle="Acceda con la cuenta que le asignó un administrador.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert variant="destructive" title={error} />}
        <Field label="Correo electrónico" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" autoFocus {...form.register("email")} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Entrar
        </Button>
        <p className="text-center text-xs text-muted-foreground">¿Recibió una invitación? Abra el enlace que le compartió el administrador.</p>
      </form>
    </AuthLayout>
  );
}
