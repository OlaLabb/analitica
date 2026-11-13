import * as React from "react";
import * as AD from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const AlertDialog = AD.Root;
export const AlertDialogTrigger = AD.Trigger;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AD.Content>,
  React.ComponentPropsWithoutRef<typeof AD.Content>
>(({ className, ...props }, ref) => (
  <AD.Portal>
    <AD.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <AD.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-card p-5 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </AD.Portal>
));
AlertDialogContent.displayName = "AlertDialogContent";

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AD.Title>,
  React.ComponentPropsWithoutRef<typeof AD.Title>
>(({ className, ...props }, ref) => <AD.Title ref={ref} className={cn("text-base font-semibold", className)} {...props} />);
AlertDialogTitle.displayName = "AlertDialogTitle";

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AD.Description>,
  React.ComponentPropsWithoutRef<typeof AD.Description>
>(({ className, ...props }, ref) => <AD.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />);
AlertDialogDescription.displayName = "AlertDialogDescription";

export const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AD.Action>,
  React.ComponentPropsWithoutRef<typeof AD.Action> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <AD.Action ref={ref} className={cn(buttonVariants({ variant: destructive ? "destructive" : "default" }), className)} {...props} />
));
AlertDialogAction.displayName = "AlertDialogAction";

export const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AD.Cancel>,
  React.ComponentPropsWithoutRef<typeof AD.Cancel>
>(({ className, ...props }, ref) => <AD.Cancel ref={ref} className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />);
AlertDialogCancel.displayName = "AlertDialogCancel";

/** Diálogo de confirmación reutilizable para operaciones administrativas. */
export function ConfirmDialog({
  trigger, title, description, confirmLabel = "Confirmar", onConfirm, destructive, children, open, onOpenChange,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <div className="space-y-2">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </div>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
