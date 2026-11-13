import * as React from "react";
import type { NumberCandidate, Suggested } from "@/api/types";
import { NumberBall } from "@/components/common";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { fmtDate, fmtInt, fmtNum } from "@/lib/format";

function sinceText(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (n === 0) return "en el último sorteo";
  return `hace ${fmtInt(n)} sorteo${n === 1 ? "" : "s"}`;
}

/** Panel con la explicación de un número y un par de datos sencillos. */
export function NumberDetail({ number, sn, candidate }: { number: number; sn?: boolean; candidate?: NumberCandidate }) {
  const m = candidate?.metrics;
  const since = sinceText(m?.draws_since_last);
  return (
    <div className="space-y-3" data-testid="number-detail">
      <div className="flex items-center gap-2">
        <NumberBall n={number} sn={sn} />
        <p className="font-semibold">{sn ? `Súper Número ${number}` : `Número ${number}`}</p>
      </div>
      {!candidate ? (
        <p className="text-sm text-muted-foreground">No hay datos guardados para este número en esta predicción.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-muted px-2 py-2">
              <dt className="text-[11px] text-muted-foreground">Veces que salió</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmtInt(m?.times_drawn)}</dd>
              <dd className="text-[11px] text-muted-foreground">
                por azar se esperaban {fmtNum(m?.expected_times_by_chance, 1)}
              </dd>
            </div>
            <div className="rounded-md bg-muted px-2 py-2">
              <dt className="text-[11px] text-muted-foreground">Última vez que salió</dt>
              <dd className="text-lg font-semibold tabular-nums">{m?.last_seen_date ? fmtDate(m.last_seen_date) : "Nunca"}</dd>
              {since && <dd className="text-[11px] text-muted-foreground">{since}</dd>}
            </div>
          </dl>
          {!!candidate.explanation?.length && (
            <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
              {candidate.explanation.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function BallButton({ n, sn, size, candidate }: { n: number; sn?: boolean; size: "lg" | "xl"; candidate?: NumberCandidate }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`${sn ? "Súper Número" : "Número"} ${n}: ver detalles`}
        >
          <NumberBall n={n} sn={sn} size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        collisionPadding={12}
        className="max-h-[min(70vh,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        <NumberDetail number={n} sn={sn} candidate={candidate} />
      </PopoverContent>
    </Popover>
  );
}

/** Las 5 balotas amarillas + la roja del Súper Número; al tocar una se abre su explicación. */
export function SuggestedBalls({ suggested, main, sn, size = "xl" }: {
  suggested: Suggested;
  main?: NumberCandidate[];
  sn?: NumberCandidate[];
  size?: "lg" | "xl";
}) {
  const byMain = React.useMemo(() => new Map((main ?? []).map((c) => [c.number, c])), [main]);
  const bySn = React.useMemo(() => new Map((sn ?? []).map((c) => [c.number, c])), [sn]);
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-[400px]:gap-2 sm:gap-3" data-testid="suggested-balls">
      {suggested.numbers.map((n) => (
        <BallButton key={n} n={n} size={size} candidate={byMain.get(n)} />
      ))}
      {suggested.super_number !== null && suggested.super_number !== undefined && (
        <>
          <span className="text-xl font-light text-muted-foreground sm:px-0.5 sm:text-2xl" aria-hidden>+</span>
          <BallButton n={suggested.super_number} sn size={size} candidate={bySn.get(suggested.super_number)} />
        </>
      )}
    </div>
  );
}
