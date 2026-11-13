import { ExternalLink } from "lucide-react";
import type { Odds, PrizeCategory } from "@/api/types";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtOneIn, fmtProbPct } from "@/lib/format";

/** Descripción en palabras de una categoría ("4 + SB" → "4 números y el Súper Número"). */
export function categoryWords(c: Pick<PrizeCategory, "matches" | "super">): string {
  if (c.matches === 0) return c.super ? "Solo el Súper Número" : "Ningún número";
  const nums = `${c.matches} número${c.matches === 1 ? "" : "s"}`;
  return c.super ? `${nums} y el Súper Número` : `${nums} (sin el Súper Número)`;
}

/** Separa la URL del resto del texto de la fuente para poder enlazarla. */
export function splitSource(src: string): { url: string | null; rest: string } {
  const m = /(https?:\/\/\S+)/.exec(src);
  if (!m) return { url: null, rest: src };
  const rest = src.replace(m[1], "").trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  return { url: m[1], rest };
}

/**
 * Tabla de probabilidades reales por categoría oficial de premio. Todas las cifras vienen de la API
 * (`combinations.odds`); aquí solo se formatean.
 */
export function OddsTable({ odds, prizeCategories, prizeSource }: {
  odds: Odds;
  prizeCategories?: PrizeCategory[] | null;
  prizeSource?: string | null;
}) {
  if (!odds.available || !odds.categories.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {odds.reason ?? "No hay probabilidades disponibles: faltan las reglas o la tabla de premios del juego."}
      </p>
    );
  }
  const cats = prizeCategories ?? odds.categories;
  const hasOnePlusSb = cats.some((c) => c.matches === 1 && c.super);
  const source = prizeSource ? splitSource(prizeSource) : null;

  return (
    <div className="space-y-4">
      <Table data-testid="odds-table">
        <THead>
          <TR>
            <TH>Premio</TH>
            <TH className="text-right">Probabilidad</TH>
            <TH className="hidden text-right sm:table-cell">Porcentaje</TH>
          </TR>
        </THead>
        <TBody>
          {odds.categories.map((c) => (
            <TR key={c.label}>
              <TD>
                <span className="font-semibold">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{categoryWords(c)}</span>
              </TD>
              <TD className="whitespace-nowrap text-right font-semibold tabular-nums" data-testid="one-in">
                {fmtOneIn(c.one_in)}
                <span className="block text-xs font-normal text-muted-foreground sm:hidden">{fmtProbPct(c.probability)}</span>
              </TD>
              <TD className="hidden whitespace-nowrap text-right tabular-nums text-muted-foreground sm:table-cell">{fmtProbPct(c.probability)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {odds.any_prize_one_in !== null && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-accent px-4 py-3 text-accent-foreground">
          <span className="text-sm font-medium">Probabilidad de ganar algún premio</span>
          <span className="text-lg font-semibold tabular-nums" data-testid="any-prize">
            {fmtOneIn(odds.any_prize_one_in)} <span className="text-sm font-normal">({fmtProbPct(odds.any_prize_probability)})</span>
          </span>
        </div>
      )}

      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
        {odds.note && <p>{odds.note}</p>}
        {source && (
          <p>
            Las categorías son las de la tabla oficial de premios
            {source.url ? (
              <>
                {" "}(
                <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  fuente <ExternalLink className="h-3 w-3" />
                </a>
                {source.rest ? ` · ${source.rest}` : ""})
              </>
            ) : (
              `: ${source.rest}`
            )}
            .
          </p>
        )}
        {!hasOnePlusSb && <p data-testid="no-one-sb">La combinación «1 + SB» no aparece en esa tabla oficial, por eso no se incluye como premio.</p>}
      </div>
    </div>
  );
}
