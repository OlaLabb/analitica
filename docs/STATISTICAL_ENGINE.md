# Motor estadístico

> **Formato vigente de predicción (algoritmo 2.0.0, `engine/numbers.py`): 5 números en CUALQUIER orden +
> Súper Número**, que es como se juega y se paga Baloto. El modelo oficial es **`azar`**: una combinación
> aleatoria reproducible (semilla = juego + fecha objetivo) acompañada de las probabilidades EXACTAS de cada
> categoría de premio (`engine/odds.py`, hipergeométrica). Motivo: con 653 sorteos por juego ningún método
> supera al azar, y las únicas probabilidades demostrables son las del sorteo justo
> (cada número 5/43 = 11,63 %, SB 1/16, 5+SB = 1 en 15.401.568). Los métodos de frecuencia
> (`frecuencia_historica`, `frecuencia_reciente`) se mantienen solo como comparación.
>
> Las categorías de premio se registran en las reglas del juego tal como aparecen en la tabla oficial
> (baloto.com, sorteo 2734): 5+SB, 5, 4+SB, 4, 3+SB, 3, 2+SB, 0+SB. "1 + SB" no aparece en esa tabla y no se
> asume. El backtest "como se juega" cuenta, sorteo por sorteo, cuántos números habría acertado cada método y
> en qué categoría habría caído, frente a la distribución hipergeométrica exacta (suma de aciertos por
> convolución exacta, superbalota binomial, Holm).
>
> Las secciones siguientes describen además el análisis por posición (algoritmo 1.x), que sigue disponible
> en "Análisis avanzado" y en las predicciones históricas conservadas.

Código: `backend/app/engine/` (Python puro: pandas, NumPy, SciPy, statsmodels). Versión del algoritmo:
`ALGORITHM_VERSION` en `engine/__init__.py`. Cualquier cambio que altere resultados numéricos debe
incrementarla.

## Principios

- Cada variable (posición 1–5 y Súper Número) se analiza por separado; no se asume que la posición 1
  equivale a la 3.
- **Referencia de azar correcta por posición.** Si las reglas confirman que los números se publican
  ordenados (`sorted_asc`) y sin repetición, la posición k sigue el estadístico de orden k de 5 extraídos
  de N: `P(X_(k)=x) = C(x−1,k−1)·C(N−x,5−k)/C(N,5)`. Usar una uniforme sería un error (la posición 1 de
  Baloto vale 1 con probabilidad 11,6 % y nunca 40–43). En orden de extracción, cada posición es uniforme.
- Sin reglas confirmadas, el dominio se infiere del histórico y toda referencia se marca como
  "no teórica" con advertencias.
- Frecuencia ≠ probabilidad. El "puntaje" de un modelo es la probabilidad que el MODELO asigna, no una
  probabilidad demostrada.

## Análisis (todos aceptan cualquier ventana temporal)

| Módulo | Contenido | Contrastes |
|---|---|---|
| `frequencies` | absoluta, relativa, %, IC Wilson 95 %, esperado bajo referencia; cualquier posición | binomial por número + Benjamini-Hochberg; χ² de bondad de ajuste (aviso si esperados < 5) |
| `recurrence` | sorteos desde la última aparición, intervalo medio/mín/máx/mediana/desv./CV, distribución | histograma observado vs mezcla de geométricas; `absence_tail_prob` (descriptivo, no predictivo) |
| `trends` | frecuencia móvil (ventana configurable), estabilidad, recientes vs anteriores, A vs B, evolución anual | χ² de homogeneidad + z de dos proporciones con BH |
| `distribution` | media, varianza, cuartiles, asimetría, curtosis, entropía, Gini, suma de los 5, paridad | contra media/desv. teóricas, hipergeométrica |
| `cooccurrence` | pares (matriz), grupos, repeticiones con rezago 1..k, transiciones, correlación entre posiciones | Poisson por par + BH; hipergeométrica; χ² de independencia; Spearman + Holm |
| `temporal` | por día de semana, mes, año, trimestre, temporada, semana ISO, día del mes; misma fecha/±días en años anteriores | χ² de homogeneidad entre grupos; aviso de grupos < 30 sorteos |

## Modelos predictivos (`engine/models`)

Cada variable tiene un `VariableState` incremental. Todos los modelos producen una distribución de
probabilidad sobre el dominio, suavizada (Dirichlet) hacia la referencia de azar: con pocos datos, el
modelo ES la referencia.

| Tipo | Idea |
|---|---|
| `baseline` | referencia de azar |
| `frequency_all` | frecuencia de toda la ventana |
| `frequency_recent` | frecuencia de los últimos N (N configurable; varias instancias) |
| `ewma` | conteos con decaimiento exponencial (vida media H) |
| `recurrence` | razón de riesgo empírica por intervalo desde la última aparición, contraída hacia 1 |
| `weekday` / `month` | frecuencia condicionada al día/mes del sorteo objetivo, contraída hacia la global |
| `transition` | Markov orden 1 (valor previo → siguiente), contraída hacia la global |
| `ensemble` | mezcla lineal ponderada (pesos en la configuración) |

No se incluyó un modelo de coocurrencias para la predicción: no hay una forma estadísticamente
justificada de condicionar posiciones ordenadas entre sí sin un modelo conjunto; las coocurrencias se
reportan como análisis descriptivo.

**Combinaciones**: k mejores combinaciones exactas (A*) maximizando Σ log puntaje por posición, con las
restricciones de las reglas (orden ascendente estricto, sin repetidos). Se probó ordenar por "lift frente
al azar" y se descartó: favorece valores casi imposibles y en el backtest rindió peor que el azar. Bajo
azar uniforme toda combinación válida tiene la misma probabilidad (1/962.598 en Baloto).

**Incertidumbre por candidato**: intervalo creíble 90 % (Beta con prior centrado en la referencia) y
nivel alta/media/baja según si incluye la referencia y si la desviación es significativa tras BH.

## Backtesting walk-forward (`engine/backtest.py`)

Para cada sorteo t: predecir con 0..t−1, comparar, incorporar t. Imposible usar información futura
(hay una prueba que altera el futuro y verifica que el pasado no cambia).

- **Top-k vs azar**: bajo la hipótesis nula la probabilidad de acierto en t es la suma de las
  probabilidades de referencia de los k elegidos ⇒ total de aciertos ~ Poisson-binomial (p-valor exacto).
- **Log loss / Brier** frente al modelo de referencia, t pareada unilateral.
- **Calibración**: diagrama de fiabilidad y ECE.
- **Holm** sobre todas las pruebas (modelos × variables). Veredicto `mejora_significativa` solo si log loss
  Y aciertos mejoran tras la corrección.
- **Línea base aleatoria simulada** con semilla registrada, respetando las reglas.
- **Control de potencia** (prueba automática): con un Súper Número sintético sesgado, el modelo de
  frecuencia SÍ es declarado significativo. Esto demuestra que el "sin mejora" con datos reales no es una
  prueba incapaz de detectar patrones.

## Resultados con el histórico real (BALOTO y REVANCHA, 653 sorteos c/u, 2021-05-01 → 2026-11-11)

Walk-forward sobre los 652 sorteos predecibles: ningún modelo supera al azar en ninguna posición ni en el
Súper Número tras Holm. El caso más llamativo (BALOTO posición 2, p=0,008) tiene p de Holm 0,90.
Las frecuencias por posición son compatibles con la distribución de estadísticos de orden (χ² p≈0,95 en
P1) y la suma media observada (109,96) coincide con la teórica (110,0).

## Snapshots incrementales (`engine/snapshots.py`)

Estadísticos suficientes por versión del histórico (conteos, por día/mes, últimas apariciones, sumas de
intervalos). Si una versión solo agrega sorteos posteriores, se actualiza incrementalmente; en otro caso
se reconstruye. Prueba automática: incremental ≡ reconstrucción completa (mismo hash).
