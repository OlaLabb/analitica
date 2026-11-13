import { useSearchParams } from "react-router-dom";
import { Activity, BarChart3, GitMerge, Repeat, Sigma, TrendingUp } from "lucide-react";
import { useGame } from "@/hooks/game";
import { useAvailableYears } from "@/hooks/years";
import { HonestyNote, PageHeader } from "@/components/common";
import { WindowFilter, useWindowParam } from "@/components/stats/WindowFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FrequencyTab } from "./stats/FrequencyTab";
import { RecurrenceTab } from "./stats/RecurrenceTab";
import { TrendsTab } from "./stats/TrendsTab";
import { DistributionTab } from "./stats/DistributionTab";
import { CooccurrenceTab } from "./stats/CooccurrenceTab";

const TABS = ["frecuencias", "recurrencia", "tendencias", "distribucion", "coocurrencias"] as const;
type Tab = (typeof TABS)[number];

export default function StatsPage() {
  const { game } = useGame();
  const years = useAvailableYears(game);
  const [win, setWin] = useWindowParam();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.includes(sp.get("tab") as Tab) ? sp.get("tab") : "frecuencias") as Tab;
  const setTab = (t: string) =>
    setSp((cur) => {
      const n = new URLSearchParams(cur);
      n.set("tab", t);
      return n;
    }, { replace: true });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BarChart3}
        title="Estadísticas"
        description={`Análisis exploratorio del histórico de ${game}. Toda comparación se hace contra la probabilidad de referencia bajo azar y con corrección por comparaciones múltiples.`}
      />
      <WindowFilter value={win} onChange={setWin} availableYears={years} />
      <HonestyNote />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="frecuencias"><BarChart3 /> Frecuencias</TabsTrigger>
          <TabsTrigger value="recurrencia"><Repeat /> Recurrencia</TabsTrigger>
          <TabsTrigger value="tendencias"><TrendingUp /> Tendencias</TabsTrigger>
          <TabsTrigger value="distribucion"><Sigma /> Distribución</TabsTrigger>
          <TabsTrigger value="coocurrencias"><GitMerge /> Coocurrencias</TabsTrigger>
        </TabsList>
        <TabsContent value="frecuencias"><FrequencyTab win={win} /></TabsContent>
        <TabsContent value="recurrencia"><RecurrenceTab win={win} /></TabsContent>
        <TabsContent value="tendencias"><TrendsTab win={win} /></TabsContent>
        <TabsContent value="distribucion"><DistributionTab win={win} /></TabsContent>
        <TabsContent value="coocurrencias"><CooccurrenceTab win={win} /></TabsContent>
      </Tabs>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Activity className="h-3 w-3" /> Los cálculos se realizan en el servidor sobre la versión vigente del histórico.</p>
    </div>
  );
}
