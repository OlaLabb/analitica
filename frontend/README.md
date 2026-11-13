# Analítica de Sorteos · Frontend

Interfaz web (en español) para el análisis estadístico del histórico de **BALOTO** y **REVANCHA**.
Consume exclusivamente la API FastAPI de `../backend`; no contiene datos simulados.

## Stack

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · componentes estilo shadcn/ui (Radix + CVA, en `src/components/ui`) ·
React Router 6 · TanStack Query 5 · React Hook Form + Zod · Apache ECharts · Vitest + Testing Library.

## Requisitos

- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22`)
- Backend en ejecución (por defecto `http://localhost:8000`, con CORS para `http://localhost:5173`)

## Puesta en marcha

```bash
cd frontend
cp .env.example .env        # ajuste VITE_API_URL si el backend no está en localhost:8000
npm install
npm run dev                 # http://localhost:5173
```

| Script            | Descripción                                   |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo en el puerto 5173      |
| `npm run build`   | `tsc -b` + `vite build` (salida en `dist/`)   |
| `npm run preview` | Sirve el build en el puerto 4173              |
| `npm test`        | Vitest (use `npm test -- --run` para una pasada) |
| `npm run lint`    | Verificación de tipos (`tsc -b --noEmit`)     |

## Estructura

```
src/
  api/          client.ts (fetch + token + errores), types.ts (formas reales de la API), hooks.ts (TanStack Query)
  hooks/        auth (sesión), game (juego global en localStorage), jobs (seguimiento de trabajos), theme
  lib/          window.ts (ventana temporal ↔ query params/URL), format.ts (formato es-CO), utils.ts
  components/
    ui/         primitivas estilo shadcn (button, card, select, tabs, dialog, alert-dialog, table…)
    layout/     AppShell (barra lateral colapsable, selector de juego, tema), guardas de ruta
    charts/     envoltorio ECharts con tema claro/oscuro y gráficos reutilizables
    stats/      WindowFilter compartido, selectores de variable
    predictions/OddsTable (probabilidades por premio), SuggestedBalls (balotas + panel por número),
                PredictionParts (historial, evaluación, vista del formato anterior, detalles técnicos)
  pages/        Login, Aceptar invitación, Predicción (inicio), ¿Cómo le ha ido?, Histórico,
                Estadísticas / Calendario / Evaluación técnica (solo admin) y
                admin/ (Importación, Reglas, Usuarios, Modelos, Auditoría, Trabajos, Sistema)
  test/         pruebas Vitest (fixtures.ts = respuestas reales de la API recortadas, solo para pruebas)
```

## Páginas y navegación

| Ruta | Quién | Contenido |
| --- | --- | --- |
| `/` **Predicción** | todos | Próximo sorteo, combinación sugerida (5 balotas amarillas + Súper Número rojo; al tocar una balota se ve su explicación), descripción del método y descargo, tabla **Probabilidades reales** por categoría oficial de premio («1 en X» y %), probabilidad de algún premio, «Detalles técnicos» plegado, historial de predicciones (vigente / reemplazada / formato anterior) con su evaluación. Admin: «Recalcular predicción». |
| `/como-le-ha-ido` **¿Cómo le ha ido?** | todos | Marcador en lenguaje simple (`/games/{code}/track-record`): titular y conclusión, una tarjeta por método frente al azar, gráfico de aciertos 0–5, premios obtenidos vs esperados, p-valores solo en «Ver detalle estadístico», y sorteos reales (estado vacío mientras no haya). |
| `/historico` **Histórico** | todos | Sorteos con balotas; versiones y correcciones solo para admin. |
| `/estadisticas`, `/calendario`, `/evaluacion` | admin | Grupo plegable «Análisis avanzado». Evaluación técnica muestra el resumen `numbers_v1` (estrategias, p-valores y Holm, detalle por sorteo) y una vista mínima de evaluaciones del formato anterior. |
| `/admin/*` | admin | Reglas (incluye `prize_categories` y `prize_source`), Modelos (formulario NumbersConfig: `official_model`, `recent_window`, `prior_strength`, `top_main`, `top_super`, `backtest_min_train`, `data_scope`), etc. |

`/predicciones` redirige a `/`. El antiguo Panel se eliminó.

## Notas de diseño

- **Tema claro por defecto** (superficies blancas/gris claro, un acento azul, balotas amarillas y Súper Número rojo).
  El oscuro es opcional (botón luna) y la elección se guarda en `localStorage` (`theme`).
- **Formatos de predicción:** `numbers_v1` (vigente: 5 números en cualquier orden + Súper Número) y
  `positional_v1` (anterior, por posición). Las predicciones antiguas se muestran en modo de solo lectura con la
  etiqueta «Formato anterior (por posición) — reemplazado».
- **Sin inventar cifras:** todas las probabilidades, conteos y textos explicativos vienen de la API; el frontend solo
  los formatea en es-CO (p. ej. «1 en 15.401.568»; porcentajes muy pequeños con 2 cifras significativas).
- **Juego global:** el selector BALOTO/REVANCHA de la barra superior se guarda en `localStorage`.
- **Ventana temporal:** los filtros de estadísticas se guardan en la URL (`w_mode`, `w_n`, …) para poder compartirlos.
- **Roles:** las vistas de administración se ocultan a usuarios sin rol `admin`; la seguridad real la aplica el backend.
- **Trabajos en segundo plano:** publicar, backtest y reconstrucción devuelven `job_id`; la interfaz consulta
  `/admin/jobs/{id}` hasta `succeeded|failed` y avisa con una notificación.
- **Invitaciones:** el backend no envía correos; el administrador copia el enlace `/aceptar-invitacion?token=…`.
