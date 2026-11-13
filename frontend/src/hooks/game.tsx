import * as React from "react";
import type { GameCode } from "@/api/types";

const KEY = "as.game";
export const GAMES: { code: GameCode; label: string }[] = [
  { code: "BALOTO", label: "BALOTO" },
  { code: "REVANCHA", label: "REVANCHA" },
];

interface GameState {
  game: GameCode;
  setGame: (g: GameCode) => void;
}
const GameContext = React.createContext<GameState | null>(null);

function initial(): GameCode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "BALOTO" || v === "REVANCHA") return v;
  } catch {
    /* noop */
  }
  return "BALOTO";
}

export function GameProvider({ children, initialGame }: { children: React.ReactNode; initialGame?: GameCode }) {
  const [game, setGameState] = React.useState<GameCode>(initialGame ?? initial);
  const setGame = React.useCallback((g: GameCode) => {
    setGameState(g);
    try {
      localStorage.setItem(KEY, g);
    } catch {
      /* noop */
    }
  }, []);
  const value = React.useMemo(() => ({ game, setGame }), [game, setGame]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameState {
  const ctx = React.useContext(GameContext);
  if (!ctx) throw new Error("useGame fuera de GameProvider");
  return ctx;
}
