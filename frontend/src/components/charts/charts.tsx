import * as React from "react";
import type { EChartsOption, CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from "echarts";
import { EChart, axisStyle, baseOption, useChartTheme } from "./EChart";
import { fmtNum, fmtPct } from "@/lib/format";

type Fmt = (v: number) => string;
const pctFmt: Fmt = (v) => fmtPct(v, 1);

export interface FreqDatum {
  number: number;
  value: number;
  ciLow?: number | null;
  ciHigh?: number | null;
  reference?: number | null;
  significant?: boolean;
  count?: number;
}

/**
 * Barras de frecuencia relativa observada con IC 95 % (bigotes) y la probabilidad de referencia bajo azar
 * (línea discontinua). Los números marcados como significativos (BH) se resaltan.
 */
export function FrequencyChart({ data, height = 300, valueLabel = "Frecuencia observada", onClick }: {
  data: FreqDatum[];
  height?: number;
  valueLabel?: string;
  onClick?: (n: number) => void;
}) {
  const t = useChartTheme();
  const hasCI = data.some((d) => d.ciLow !== undefined && d.ciLow !== null);
  const hasRef = data.some((d) => d.reference !== undefined && d.reference !== null);
  const cats = data.map((d) => String(d.number));
  const option: EChartsOption = {
    ...baseOption(t),
    legend: { ...(baseOption(t).legend as object), data: [valueLabel, ...(hasCI ? ["IC 95 %"] : []), ...(hasRef ? ["Referencia (azar)"] : [])] },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      formatter: (ps: unknown) => {
        const arr = ps as { dataIndex: number }[];
        const d = data[arr[0]?.dataIndex ?? 0];
        if (!d) return "";
        const lines = [
          `<b>Número ${d.number}</b>`,
          `${valueLabel}: <b>${fmtPct(d.value, 2)}</b>${d.count !== undefined ? ` (${d.count})` : ""}`,
        ];
        if (d.ciLow !== undefined && d.ciLow !== null) lines.push(`IC 95 %: ${fmtPct(d.ciLow, 2)} – ${fmtPct(d.ciHigh ?? 0, 2)}`);
        if (d.reference !== undefined && d.reference !== null) lines.push(`Referencia bajo azar: ${fmtPct(d.reference, 2)}`);
        if (d.significant) lines.push(`<span style="color:${t.significant}">Significativo tras BH (α=0,05)</span>`);
        return lines.join("<br/>");
      },
    },
    xAxis: { type: "category", data: cats, ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, interval: data.length > 30 ? 1 : 0 }, splitLine: { show: false } },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v: number) => fmtPct(v, 0) } },
    series: [
      {
        name: valueLabel,
        type: "bar",
        barMaxWidth: 18,
        barCategoryGap: "20%",
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: data.map((d) => ({
          value: d.value,
          itemStyle: d.significant ? { color: t.significant } : { color: t.series[0] },
        })),
      },
      ...(hasCI
        ? [
            {
              name: "IC 95 %",
              type: "custom" as const,
              itemStyle: { color: t.reference },
              renderItem: (_p: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
                const x = api.value(0) as number;
                const lo = api.coord([x, api.value(1) as number]);
                const hi = api.coord([x, api.value(2) as number]);
                const w = Math.max(3, ((api.size?.([1, 0]) as number[])[0] ?? 10) * 0.18);
                const style = { stroke: t.reference, lineWidth: 1 };
                return {
                  type: "group" as const,
                  children: [
                    { type: "line" as const, shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style },
                    { type: "line" as const, shape: { x1: lo[0] - w, y1: lo[1], x2: lo[0] + w, y2: lo[1] }, style },
                    { type: "line" as const, shape: { x1: hi[0] - w, y1: hi[1], x2: hi[0] + w, y2: hi[1] }, style },
                  ],
                };
              },
              encode: { x: 0, y: [1, 2] },
              data: data.map((d, i) => [i, d.ciLow ?? d.value, d.ciHigh ?? d.value]),
              z: 3,
              tooltip: { show: false },
            },
          ]
        : []),
      ...(hasRef
        ? [
            {
              name: "Referencia (azar)",
              type: "line" as const,
              step: "middle" as const,
              symbol: "none",
              lineStyle: { type: "dashed" as const, width: 1.5, color: t.reference },
              itemStyle: { color: t.reference },
              data: data.map((d) => d.reference ?? null),
              z: 4,
            },
          ]
        : []),
    ],
  };
  const onEvents = React.useMemo(
    () => (onClick ? { click: (p: unknown) => onClick(data[(p as { dataIndex: number }).dataIndex]?.number) } : undefined),
    [onClick, data],
  );
  return <EChart option={option} height={height} onEvents={onEvents} ariaLabel={valueLabel} />;
}

/** Observado (barras) vs esperado bajo azar (línea). */
export function ObservedExpectedChart({ categories, observed, expected, height = 260, observedLabel = "Observado", expectedLabel = "Esperado bajo azar", xName, fmt }: {
  categories: (string | number)[];
  observed: (number | null)[];
  expected: (number | null)[];
  height?: number;
  observedLabel?: string;
  expectedLabel?: string;
  xName?: string;
  fmt?: Fmt;
}) {
  const t = useChartTheme();
  const f = fmt ?? ((v: number) => fmtNum(v, 1));
  const option: EChartsOption = {
    ...baseOption(t),
    tooltip: { ...(baseOption(t).tooltip as object), valueFormatter: (v) => (typeof v === "number" ? f(v) : "—") },
    xAxis: { type: "category", data: categories.map(String), name: xName, nameLocation: "middle", nameGap: 26, ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v: number) => f(v) } },
    grid: { left: 8, right: 16, top: 32, bottom: xName ? 24 : 8, containLabel: true },
    series: [
      { name: observedLabel, type: "bar", barMaxWidth: 22, itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0] }, data: observed },
      {
        name: expectedLabel,
        type: "line",
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { type: "dashed", width: 1.5, color: t.reference },
        itemStyle: { color: t.reference },
        data: expected,
      },
    ],
  };
  return <EChart option={option} height={height} ariaLabel={`${observedLabel} frente a ${expectedLabel}`} />;
}

/** Mapa de calor genérico (escala secuencial de un solo tono, o divergente). */
export function HeatmapChart({ xLabels, yLabels, matrix, height = 360, fmt = pctFmt, diverging, min, max, xName, yName, tooltipExtra, valueLabel = "Valor" }: {
  xLabels: (string | number)[];
  yLabels: (string | number)[];
  /** matrix[y][x] */
  matrix: (number | null)[][];
  height?: number;
  fmt?: Fmt;
  diverging?: boolean;
  min?: number;
  max?: number;
  xName?: string;
  yName?: string;
  tooltipExtra?: (x: number, y: number) => string;
  valueLabel?: string;
}) {
  const t = useChartTheme();
  const data: [number, number, number | null][] = [];
  let lo = Infinity;
  let hi = -Infinity;
  matrix.forEach((row, y) =>
    row.forEach((v, x) => {
      data.push([x, y, v]);
      if (v !== null && Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }),
  );
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const option: EChartsOption = {
    ...baseOption(t),
    legend: undefined,
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: t.dark ? "#0f172a" : "#ffffff",
      borderColor: t.dark ? "#334155" : "#e2e8f0",
      textStyle: { color: t.text, fontSize: 12 },
      formatter: (p: unknown) => {
        const d = (p as { data: [number, number, number | null] }).data;
        const extra = tooltipExtra ? `<br/>${tooltipExtra(d[0], d[1])}` : "";
        return `${yName ?? ""} <b>${yLabels[d[1]]}</b> · ${xName ?? ""} <b>${xLabels[d[0]]}</b><br/>${valueLabel}: <b>${d[2] === null ? "—" : fmt(d[2])}</b>${extra}`;
      },
    },
    grid: { left: 8, right: 16, top: 8, bottom: 48, containLabel: true },
    xAxis: { type: "category", data: xLabels.map(String), ...axisStyle(t), splitArea: { show: false }, splitLine: { show: false }, name: xName, nameLocation: "middle", nameGap: 22 },
    yAxis: { type: "category", data: yLabels.map(String), ...axisStyle(t), splitLine: { show: false }, name: yName },
    visualMap: {
      min: min ?? lo,
      max: max ?? hi,
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemHeight: 140,
      itemWidth: 10,
      textStyle: { color: t.textMuted, fontSize: 10 },
      formatter: (v: unknown) => fmt(Number(v)),
      inRange: { color: diverging ? t.diverging : t.seq },
    },
    series: [
      {
        type: "heatmap",
        data,
        itemStyle: { borderColor: t.surface, borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } },
      },
    ],
  };
  return <EChart option={option} height={height} ariaLabel="Mapa de calor" />;
}

/** Líneas temporales (una serie por número) con referencia opcional. */
export function LinesChart({ x, series, reference, height = 320, fmt = pctFmt, referenceLabel = "Referencia (azar)" }: {
  x: string[];
  series: { name: string; values: (number | null)[] }[];
  reference?: number | null;
  height?: number;
  fmt?: Fmt;
  referenceLabel?: string;
}) {
  const t = useChartTheme();
  const option: EChartsOption = {
    ...baseOption(t),
    tooltip: { ...(baseOption(t).tooltip as object), axisPointer: { type: "line", lineStyle: { color: t.axis } }, valueFormatter: (v) => (typeof v === "number" ? fmt(v) : "—") },
    legend: { ...(baseOption(t).legend as object), type: "scroll" },
    grid: { left: 8, right: 16, top: 32, bottom: 40, containLabel: true },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 4, borderColor: "transparent", textStyle: { color: t.textMuted } }],
    xAxis: { type: "category", data: x, boundaryGap: false, ...axisStyle(t), splitLine: { show: false } },
    yAxis: { type: "value", ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v: number) => fmt(v) } },
    series: [
      ...series.map((s, i) => ({
        name: s.name,
        type: "line" as const,
        showSymbol: false,
        lineStyle: { width: 2 },
        color: t.series[i % t.series.length],
        data: s.values,
      })),
      ...(reference !== undefined && reference !== null
        ? [{
            name: referenceLabel,
            type: "line" as const,
            showSymbol: false,
            lineStyle: { type: "dashed" as const, width: 1.5, color: t.reference },
            itemStyle: { color: t.reference },
            data: x.map(() => reference),
          }]
        : []),
    ],
  };
  return <EChart option={option} height={height} ariaLabel="Series temporales" />;
}

/** Barras agrupadas (p. ej. comparación de periodos A/B o por día de la semana). */
export function GroupedBarsChart({ categories, series, height = 280, fmt = pctFmt, reference, horizontal }: {
  categories: (string | number)[];
  series: { name: string; values: (number | null)[] }[];
  height?: number;
  fmt?: Fmt;
  reference?: number | null;
  horizontal?: boolean;
}) {
  const t = useChartTheme();
  const cat = { type: "category" as const, data: categories.map(String), ...axisStyle(t), splitLine: { show: false } };
  const val = { type: "value" as const, ...axisStyle(t), axisLabel: { ...axisStyle(t).axisLabel, formatter: (v: number) => fmt(v) } };
  const option: EChartsOption = {
    ...baseOption(t),
    tooltip: { ...(baseOption(t).tooltip as object), valueFormatter: (v) => (typeof v === "number" ? fmt(v) : "—") },
    xAxis: horizontal ? val : cat,
    yAxis: horizontal ? { ...cat, inverse: true } : val,
    series: [
      ...series.map((s, i) => ({
        name: s.name,
        type: "bar" as const,
        barMaxWidth: 14,
        barGap: "15%",
        itemStyle: { color: t.series[i % t.series.length], borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
        data: s.values,
      })),
      ...(reference !== undefined && reference !== null
        ? [{
            name: "Referencia (azar)",
            type: "line" as const,
            symbol: "none",
            lineStyle: { type: "dashed" as const, width: 1.5, color: t.reference },
            itemStyle: { color: t.reference },
            data: categories.map(() => reference),
          }]
        : []),
    ],
  };
  return <EChart option={option} height={height} ariaLabel="Barras agrupadas" />;
}
