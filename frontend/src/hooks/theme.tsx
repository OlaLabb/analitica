import * as React from "react";

type Theme = "light" | "dark";

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const setTheme = React.useCallback((t: Theme) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* noop */
    }
    setThemeState(t);
    window.dispatchEvent(new Event("as:theme"));
  }, []);
  return [theme, setTheme];
}

/** Observa el cambio de tema (para re-renderizar gráficos). */
export function useIsDark(): boolean {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"));
  React.useEffect(() => {
    const h = () => setDark(document.documentElement.classList.contains("dark"));
    window.addEventListener("as:theme", h);
    return () => window.removeEventListener("as:theme", h);
  }, []);
  return dark;
}
