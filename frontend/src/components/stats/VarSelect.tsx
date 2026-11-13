import type { Variable, VariableAny } from "@/api/types";
import { SimpleSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { VARIABLES, VARIABLE_LABELS } from "@/lib/format";

export function VarSelect<T extends VariableAny>({ value, onChange, allowAny, label = "Variable", id }: {
  value: T;
  onChange: (v: T) => void;
  allowAny?: boolean;
  label?: string;
  id?: string;
}) {
  const opts = [...(allowAny ? (["main_any"] as VariableAny[]) : []), ...(VARIABLES as Variable[])].map((v) => ({
    value: v as T,
    label: VARIABLE_LABELS[v],
  }));
  return (
    <div className="flex w-48 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <SimpleSelect<T> id={id} value={value} onChange={onChange} options={opts} ariaLabel={label} />
    </div>
  );
}

export function NumInput({ label, value, onChange, min = 1, max, id, width = "w-28" }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; id: string; width?: string;
}) {
  return (
    <div className={`flex ${width} flex-col gap-1.5`}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        key={value}
        onBlur={(e) => {
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= min && (max === undefined || v <= max)) onChange(v);
          else e.target.value = String(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
