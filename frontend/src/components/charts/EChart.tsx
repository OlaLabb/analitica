import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useIsDark } from "@/hooks/theme";
import { cn } from "@/lib/utils";

/** Paleta categórica validada (orden fijo, nunca cíclico). Claro / oscuro. */
export const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
/** Rampa secuencial de un solo tono (azul) para mapas de calor. */
export const SEQ_BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
export const SEQ_BLUE_DARK = ["#1a2433", "#184f95", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#cde2fb"];

export interface ChartTheme {
  dark: boolean;
  series: string[];
  text: string;
  textMuted: string;
  grid: string;
  axis: string;
  surface: string;
  reference: string;
  significant: string;
  seq: string[];
  diverging: string[];
}

export function useChartTheme(): ChartTheme {
  const dark = useIsDark();
  return React.useMemo(
    () => ({
      dark,
      series: dark ? SERIES_DARK : SERIES_LIGHT,
      text: dark ? "#e2e8f0" : "#0f172a",
      textMuted: dark ? "#94a3b8" : "#64748b",
      grid: dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.07)",
      axis: dark ? "rgba(148,163,184,0.35)" : "rgba(15,23,42,0.25)",
      surface: dark ? "#111827" : "#ffffff",
      reference: dark ? "#cbd5e1" : "#475569",
      significant: dark ? "#e66767" : "#e34948",
      seq: dark ? SEQ_BLUE_DARK : SEQ_BLUE,
      diverging: dark ? ["#d95926", "#3a3f4a", "#3987e5"] : ["#eb6834", "#e5e7eb", "#2a78d6"],
    }),
    [dark],
  );
}

/** Valores base comunes (ejes discretos, tooltip, rejilla recesiva). */
export function baseOption(t: ChartTheme): EChartsOption {
  return {
    backgroundColor: "transparent",
    textStyle: { color: t.text, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontSize: 11 },
    color: t.series,
    grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.dark ? "#0f172a" : "#ffffff",
      borderColor: t.dark ? "#334155" : "#e2e8f0",
      textStyle: { color: t.text, fontSize: 12 },
      axisPointer: { type: "shadow", shadowStyle: { color: t.dark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)" } },
      confine: true,
    },
    legend: { top: 0, left: 0, textStyle: { color: t.textMuted, fontSize: 11 }, itemWidth: 14, itemHeight: 8, icon: "roundRect" },
    animationDuration: 300,
  };
}

export function axisStyle(t: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.textMuted, fontSize: 10 },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.textMuted, fontSize: 10 },
  };
}

export function EChart({
  option, height = 280, className, onEvents, ariaLabel,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (p: unknown) => void>;
  ariaLabel?: string;
}) {
  const dark = useIsDark();
  return (
    <div className={cn("w-full", className)} role="img" aria-label={ariaLabel}>
      <ReactECharts
        key={dark ? "d" : "l"}
        option={option}
        notMerge
        lazyUpdate
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
      />
    </div>
  );
}
