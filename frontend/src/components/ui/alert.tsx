import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-lg border px-4 py-3 text-sm flex gap-3 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-card text-foreground",
      info: "border-primary/30 bg-primary/5 text-foreground [&>svg]:text-primary",
      warning: "border-warning/40 bg-warning/10 text-foreground [&>svg]:text-warning",
      destructive: "border-destructive/40 bg-destructive/5 text-foreground [&>svg]:text-destructive",
      success: "border-success/40 bg-success/10 text-foreground [&>svg]:text-success",
    },
  },
  defaultVariants: { variant: "default" },
});

const ICONS = { default: Info, info: Info, warning: AlertTriangle, destructive: ShieldAlert, success: CheckCircle2 };

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">, VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  icon?: boolean;
}

export function Alert({ className, variant, title, children, icon = true, ...props }: AlertProps) {
  const Icon = ICONS[variant ?? "default"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <Icon />}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <div className="font-medium leading-tight">{title}</div>}
        {children && <div className="text-[13px] leading-relaxed text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
