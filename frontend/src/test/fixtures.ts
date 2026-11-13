/* Datos tomados de respuestas reales de la API (BALOTO, 2026-11-13), recortados. No se usan en la app. */
import type { LegacyPrediction, NumbersPrediction, Rules, TrackRecord } from "@/api/types";

export const numbersPrediction = {
 "id": "5c53e2c8-16c7-4889-ad38-f09b065955b4",
 "game_id": 1,
 "format": "numbers_v1",
 "kind": "official",
 "status": "published",
 "target_date": "2026-11-14",
 "target_weekday": 5,
 "generated_at": "2026-11-13T14:42:08.299769-05:00",
 "published_at": "2026-11-13T14:42:08.299769-05:00",
 "superseded_at": null,
 "superseded_by_id": null,
 "historical_version": {
  "number": 1,
  "draw_count": 653,
  "last_draw_date": "2026-11-11",
  "content_hash": "f09ab711a17817f3696a050dff560f9d6d29c05ee8b1dbacab1b015af4047c05"
 },
 "configuration": {
  "version_number": 2,
  "name": "Configuración por defecto (números en cualquier orden)",
  "config_hash": "65e6089cf5558ab39635c92e7cef8a46ea476f1f0dc3057b622490ce0737b408"
 },
 "algorithm_version": "2.0.0",
 "official_model": "azar",
 "data_scope": {
  "spec": {
   "n": null,
   "end": null,
   "mode": "all",
   "start": null,
   "years": null,
   "anchor": "last_draw",
   "months": null,
   "weekdays": null
  },
  "n_draws": 653,
  "warnings": [],
  "last_date": "2026-11-11",
  "first_date": "2021-05-01",
  "draw_ids_hash": "7fd90c50851ba5a4",
  "historical_version": 1
 },
 "prediction_hash": "058a4335d2bc335bd368f287663f64950d23b9f7e495208d497ae736ed840b26",
 "input_hash": "fc532873e5cf85a085909a68006b8427c9c3580c7324ca0a820a97830ab08a43",
 "warnings": [],
 "support_metrics": {
  "format": "numbers_v1",
  "disclaimer": "En un sorteo aleatorio todas las combinaciones tienen exactamente la misma probabilidad. Ningún método conocido acierta más que el azar con este histórico (ver '¿Cómo le ha ido?').",
  "main_reference": 0.11627906976744186,
  "super_reference": 0.0625,
  "official_model_description": "Combinación elegida al azar respetando las reglas. Las probabilidades mostradas son las reales y exactas del sorteo: la misma para cualquier combinación."
 },
 "combinations": {
  "odds": {
   "note": "Estas probabilidades son idénticas para cualquier combinación de números.",
   "available": true,
   "categories": [
    {
     "label": "5 + SB",
     "super": true,
     "one_in": 15401568,
     "matches": 5,
     "probability": 6.492845403792653e-08
    },
    {
     "label": "5",
     "super": false,
     "one_in": 1026771,
     "matches": 5,
     "probability": 9.73926810568898e-07
    },
    {
     "label": "4 + SB",
     "super": true,
     "one_in": 81061,
     "matches": 4,
     "probability": 1.2336406267206041e-05
    },
    {
     "label": "4",
     "super": false,
     "one_in": 5404,
     "matches": 4,
     "probability": 0.0001850460940080906
    },
    {
     "label": "3 + SB",
     "super": true,
     "one_in": 2191,
     "matches": 3,
     "probability": 0.0004564470318866235
    },
    {
     "label": "3",
     "super": false,
     "one_in": 146,
     "matches": 3,
     "probability": 0.006846705478299353
    },
    {
     "label": "2 + SB",
     "super": true,
     "one_in": 183,
     "matches": 2,
     "probability": 0.005477364382639482
    },
    {
     "label": "0 + SB",
     "super": true,
     "one_in": 31,
     "matches": 0,
     "probability": 0.03259031807670492
    }
   ],
   "any_prize_one_in": 22,
   "match_distribution": [
    {
     "matches": 0,
     "probability": 0.5214450892272787
    },
    {
     "matches": 1,
     "probability": 0.3834155067847637
    },
    {
     "matches": 2,
     "probability": 0.08763783012223171
    },
    {
     "matches": 3,
     "probability": 0.007303152510185976
    },
    {
     "matches": 4,
     "probability": 0.00019738250027529665
    },
    {
     "matches": 5,
     "probability": 1.0388552646068244e-06
    }
   ],
   "any_prize_probability": 0.045569256325070286,
   "expected_matches_by_chance": 0.5813953488372093
  },
  "suggested": {
   "numbers": [
    10,
    11,
    17,
    25,
    32
   ],
   "super_number": 7
  }
 },
 "evaluation": null,
 "candidates": {
  "main": [
   {
    "rank": 1,
    "number": 10,
    "score": 0.1162790698,
    "reference_prob": 0.1162790698,
    "lift": 1.0,
    "uncertainty": {
     "text": "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar.",
     "range_90": [
      0.081195,
      0.118391
     ],
     "p_value_adjusted": 1.0,
     "compatible_with_chance": true
    },
    "metrics": {
     "draws": 653,
     "share": 0.098009,
     "average_gap": 10.25,
     "times_drawn": 64,
     "recent_times": 10,
     "recent_window": 100,
     "last_seen_date": "2026-10-31",
     "draws_since_last": 5,
     "expected_gap_by_chance": 8.6,
     "expected_times_by_chance": 75.93,
     "recent_expected_by_chance": 11.63
    },
    "factors": {
     "frecuencia_reciente": 0.1048951049,
     "frecuencia_historica": 0.099137931
    },
    "explanation": [
     "Elegido al azar. Su probabilidad real de salir en el próximo sorteo es 11,6 %, exactamente igual que la de cualquier otro número.",
     "El número 10 salió 64 veces en 653 sorteos (9,8 %); por puro azar se esperarían 75,93 veces.",
     "En los últimos 100 sorteos salió 10 veces (azar: 11,63).",
     "No sale desde hace 5 sorteos (en promedio pasan 8,6 sorteos entre apariciones). Que lleve tiempo sin salir no lo hace más probable.",
     "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar."
    ]
   },
   {
    "rank": 2,
    "number": 11,
    "score": 0.1162790698,
    "reference_prob": 0.1162790698,
    "lift": 1.0,
    "uncertainty": {
     "text": "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar.",
     "range_90": [
      0.107691,
      0.149272
     ],
     "p_value_adjusted": 1.0,
     "compatible_with_chance": true
    },
    "metrics": {
     "draws": 653,
     "share": 0.128637,
     "average_gap": 7.36,
     "times_drawn": 84,
     "recent_times": 19,
     "recent_window": 100,
     "last_seen_date": "2026-11-09",
     "draws_since_last": 1,
     "expected_gap_by_chance": 8.6,
     "expected_times_by_chance": 75.93,
     "recent_expected_by_chance": 11.63
    },
    "factors": {
     "frecuencia_reciente": 0.1678321678,
     "frecuencia_historica": 0.1278735632
    },
    "explanation": [
     "Elegido al azar. Su probabilidad real de salir en el próximo sorteo es 11,6 %, exactamente igual que la de cualquier otro número.",
     "El número 11 salió 84 veces en 653 sorteos (12,9 %); por puro azar se esperarían 75,93 veces.",
     "En los últimos 100 sorteos salió 19 veces (azar: 11,63).",
     "No sale desde hace 1 sorteo (en promedio pasan 8,6 sorteos entre apariciones). Que lleve tiempo sin salir no lo hace más probable.",
     "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar."
    ]
   },
   {
    "rank": 3,
    "number": 17,
    "score": 0.1162790698,
    "reference_prob": 0.1162790698,
    "lift": 1.0,
    "uncertainty": {
     "text": "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar.",
     "range_90": [
      0.091744,
      0.130793
     ],
     "p_value_adjusted": 1.0,
     "compatible_with_chance": true
    },
    "metrics": {
     "draws": 653,
     "share": 0.11026,
     "average_gap": 8.49,
     "times_drawn": 72,
     "recent_times": 13,
     "recent_window": 100,
     "last_seen_date": "2026-10-26",
     "draws_since_last": 7,
     "expected_gap_by_chance": 8.6,
     "expected_times_by_chance": 75.93,
     "recent_expected_by_chance": 11.63
    },
    "factors": {
     "frecuencia_reciente": 0.1258741259,
     "frecuencia_historica": 0.1106321839
    },
    "explanation": [
     "Elegido al azar. Su probabilidad real de salir en el próximo sorteo es 11,6 %, exactamente igual que la de cualquier otro número.",
     "El número 17 salió 72 veces en 653 sorteos (11,0 %); por puro azar se esperarían 75,93 veces.",
     "En los últimos 100 sorteos salió 13 veces (azar: 11,63).",
     "No sale desde hace 7 sorteos (en promedio pasan 8,6 sorteos entre apariciones). Que lleve tiempo sin salir no lo hace más probable.",
     "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar."
    ]
   },
   {
    "rank": 4,
    "number": 25,
    "score": 0.1162790698,
    "reference_prob": 0.1162790698,
    "lift": 1.0,
    "uncertainty": {
     "text": "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar.",
     "range_90": [
      0.113036,
      0.155403
     ],
     "p_value_adjusted": 1.0,
     "compatible_with_chance": true
    },
    "metrics": {
     "draws": 653,
     "share": 0.134763,
     "average_gap": 7.37,
     "times_drawn": 88,
     "recent_times": 15,
     "recent_window": 100,
     "last_seen_date": "2026-10-26",
     "draws_since_last": 7,
     "expected_gap_by_chance": 8.6,
     "expected_times_by_chance": 75.93,
     "recent_expected_by_chance": 11.63
    },
    "factors": {
     "frecuencia_reciente": 0.1398601399,
     "frecuencia_historica": 0.1336206897
    },
    "explanation": [
     "Elegido al azar. Su probabilidad real de salir en el próximo sorteo es 11,6 %, exactamente igual que la de cualquier otro número.",
     "El número 25 salió 88 veces en 653 sorteos (13,5 %); por puro azar se esperarían 75,93 veces.",
     "En los últimos 100 sorteos salió 15 veces (azar: 11,63).",
     "No sale desde hace 7 sorteos (en promedio pasan 8,6 sorteos entre apariciones). Que lleve tiempo sin salir no lo hace más probable.",
     "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar."
    ]
   },
   {
    "rank": 5,
    "number": 32,
    "score": 0.1162790698,
    "reference_prob": 0.1162790698,
    "lift": 1.0,
    "uncertainty": {
     "text": "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar.",
     "range_90": [
      0.106357,
      0.147737
     ],
     "p_value_adjusted": 1.0,
     "compatible_with_chance": true
    },
    "metrics": {
     "draws": 653,
     "share": 0.127106,
     "average_gap": 7.66,
     "times_drawn": 83,
     "recent_times": 11,
     "recent_window": 100,
     "last_seen_date": "2026-09-30",
     "draws_since_last": 18,
     "expected_gap_by_chance": 8.6,
     "expected_times_by_chance": 75.93,
     "recent_expected_by_chance": 11.63
    },
    "factors": {
     "frecuencia_reciente": 0.1118881119,
     "frecuencia_historica": 0.1264367816
    },
    "explanation": [
     "Elegido al azar. Su probabilidad real de salir en el próximo sorteo es 11,6 %, exactamente igual que la de cualquier otro número.",
     "El número 32 salió 83 veces en 653 sorteos (12,7 %); por puro azar se esperarían 75,93 veces.",
     "En los últimos 100 sorteos salió 11 veces (azar: 11,63).",
     "No sale desde hace 18 sorteos (en promedio pasan 8,6 sorteos entre apariciones). Que lleve tiempo sin salir no lo hace más probable.",
     "Entre 43 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar."
    ]
   }
  ],
  "sn": [
   {
    "rank": 1,
    "number": 7,
    "score": 0.0625,
    "reference_prob": 0.0625,
    "lift": 1.0,
    "uncertainty": {
     "text": "Entre 16 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar.",
     "range_90": [
      0.049678,
      0.080158
     ],
     "p_value_adjusted": 0.92949,
     "compatible_with_chance": true
    },
    "metrics": {
     "draws": 653,
     "share": 0.064319,
     "average_gap": 15.71,
     "times_drawn": 42,
     "recent_times": 4,
     "recent_window": 100,
     "last_seen_date": "2026-10-26",
     "draws_since_last": 7,
     "expected_gap_by_chance": 16.0,
     "expected_times_by_chance": 40.81,
     "recent_expected_by_chance": 6.25
    },
    "factors": {
     "frecuencia_reciente": 0.0467657343,
     "frecuencia_historica": 0.0642061782
    },
    "explanation": [
     "Elegido al azar. Su probabilidad real de salir en el próximo sorteo es 6,2 %, exactamente igual que la de cualquier otroa superbalota.",
     "El superbalota 7 salió 42 veces en 653 sorteos (6,4 %); por puro azar se esperarían 40,81 veces.",
     "En los últimos 100 sorteos salió 4 veces (azar: 6,25).",
     "No sale desde hace 7 sorteos (en promedio pasan 16,0 sorteos entre apariciones). Que lleve tiempo sin salir no lo hace más probable.",
     "Entre 16 números es normal que algunos salgan más que el promedio por pura suerte; teniendo eso en cuenta, su frecuencia es compatible con el azar."
    ]
   }
  ]
 },
 "params": {
  "format": "numbers_v1",
  "top_main": 10,
  "top_super": 5,
  "data_scope": {
   "n": null,
   "end": null,
   "mode": "all",
   "start": null,
   "years": null,
   "anchor": "last_draw",
   "months": null,
   "weekdays": null
  },
  "recent_window": 100,
  "official_model": "azar",
  "prior_strength": 43.0,
  "backtest_min_train": 100
 }
} as unknown as NumbersPrediction;

export const legacyPrediction = {
 "id": "a6e1552c-d3e2-423a-986d-13d2ae9ee9ea",
 "game_id": 1,
 "format": "positional_v1",
 "kind": "official",
 "status": "superseded",
 "target_date": "2026-11-14",
 "target_weekday": 5,
 "generated_at": "2026-11-13T11:14:53.415927-05:00",
 "published_at": "2026-11-13T11:14:53.415927-05:00",
 "superseded_at": "2026-11-13T14:42:08.299769-05:00",
 "superseded_by_id": "5c53e2c8-16c7-4889-ad38-f09b065955b4",
 "historical_version": {
  "number": 1,
  "draw_count": 653,
  "last_draw_date": "2026-11-11",
  "content_hash": "f09ab711a17817f3696a050dff560f9d6d29c05ee8b1dbacab1b015af4047c05"
 },
 "configuration": {
  "version_number": 1,
  "name": "Configuración por defecto",
  "config_hash": "42aac0440f5e039002f9e6056172385d4d0afb6f1730cf2eb65c82684a900ff9"
 },
 "algorithm_version": "1.0.0",
 "official_model": "ensemble",
 "data_scope": {
  "spec": {
   "n": null,
   "end": null,
   "mode": "all",
   "start": null,
   "years": null,
   "anchor": "last_draw",
   "months": null,
   "weekdays": null
  },
  "n_draws": 653,
  "warnings": [],
  "last_date": "2026-11-11",
  "first_date": "2021-05-01",
  "draw_ids_hash": "7fd90c50851ba5a4",
  "historical_version": 1
 },
 "prediction_hash": "9b03e3e53afd071617b7fbf04a64e6f74ebf530ef7907ddecdc087253d09b5ab",
 "input_hash": "c39a8b4df66da6ad35aef2e9a2e7042f5c2be6cc1059fe4b60b5f8069227b88c",
 "warnings": [],
 "support_metrics": {
  "disclaimer": "Las predicciones son rankings estadísticos basados en el histórico. Si el sorteo es aleatorio e independiente, ningún modelo puede superar al azar de forma consistente. Consulte el backtesting para ver el desempeño real frente a la línea base aleatoria."
 },
 "combinations": {
  "note": "Bajo azar uniforme todas las combinaciones válidas son equiprobables.",
  "items": [
   {
    "numbers": [
     1,
     13,
     25,
     30,
     43
    ],
    "criterion": "log_prob",
    "log_score": -12.57658073785844,
    "super_number": 14,
    "lift_vs_reference": 2.330088755161148,
    "per_position_prob": [
     0.11549074643558362,
     0.06953556514726082,
     0.05480134880506695,
     0.06273109853458432,
     0.12503513482094314
    ],
    "reference_prob_under_uniform": 1.0388552646068244e-06
   },
   {
    "numbers": [
     1,
     13,
     20,
     30,
     43
    ],
    "criterion": "log_prob",
    "log_score": -12.620409719860083,
    "super_number": 14,
    "lift_vs_reference": 2.1768156960619764,
    "per_position_prob": [
     0.11549074643558362,
     0.06953556514726082,
     0.0524513369695469,
     0.06273109853458432,
     0.12503513482094314
    ],
    "reference_prob_under_uniform": 1.0388552646068244e-06
   }
  ],
  "method": "k-best exacto (A*) sobre Σ log puntaje por posición, respetando las reglas",
  "available": true,
  "independent_top1": {
   "valid": true,
   "numbers": [
    1,
    13,
    25,
    30,
    43
   ]
  }
 },
 "evaluation": null
} as unknown as LegacyPrediction;

export const trackRecord = {
 "live": {
  "draws": 0,
  "average_matches": null,
  "expected_average_by_chance": 0.5814,
  "super_hits": 0,
  "with_prize": 0,
  "items": []
 },
 "simulation": {
  "backtest_id": "5f5adef8-dc57-48b3-8471-9f436ed45615",
  "draws": 553,
  "first_date": "2022-04-16",
  "last_date": "2026-11-11",
  "headline": "Jugando una combinación al azar en cada uno de los 553 sorteos, se acertaron en promedio 0,5986 números (lo teórico es 0,58) y la superbalota 43 veces (teórico: 34,56).",
  "conclusion": "Ningún método supera al azar: los aciertos del sistema son los que se esperan por suerte.",
  "strategies": [
   {
    "draws": 553,
    "plain": "En 553 sorteos acertó en promedio 0,5353 números (el azar acierta 0,58) y la superbalota 36 veces (azar: 34,56). La diferencia es la que se espera por pura suerte: no supera al azar.",
    "verdict": "igual_que_el_azar",
    "strategy": "frecuencia_historica",
    "super_hits": 36,
    "p_holm_super": 1.0,
    "p_value_super": 0.42481679819191026,
    "p_holm_matches": 1.0,
    "average_matches": 0.5353,
    "p_value_matches": 0.9488034198624417,
    "draws_with_prize": 32,
    "prize_categories": [
     {
      "label": "5 + SB",
      "times": 0,
      "expected_by_chance": 0.0
     },
     {
      "label": "5",
      "times": 0,
      "expected_by_chance": 0.0
     },
     {
      "label": "4 + SB",
      "times": 0,
      "expected_by_chance": 0.01
     },
     {
      "label": "4",
      "times": 0,
      "expected_by_chance": 0.1
     },
     {
      "label": "3 + SB",
      "times": 0,
      "expected_by_chance": 0.25
     },
     {
      "label": "3",
      "times": 4,
      "expected_by_chance": 3.79
     },
     {
      "label": "2 + SB",
      "times": 3,
      "expected_by_chance": 3.03
     },
     {
      "label": "0 + SB",
      "times": 25,
      "expected_by_chance": 18.02
     }
    ],
    "matches_distribution": [
     306,
     202,
     41,
     4,
     0,
     0
    ],
    "draws_with_prize_expected": 25.2,
    "expected_average_by_chance": 0.5814,
    "matches_distribution_expected": [
     288.36,
     212.03,
     48.46,
     4.04,
     0.11,
     0.0
    ],
    "super_hits_expected_by_chance": 34.56
   },
   {
    "draws": 553,
    "plain": "En 553 sorteos acertó en promedio 0,5425 números (el azar acierta 0,58) y la superbalota 41 veces (azar: 34,56). La diferencia es la que se espera por pura suerte: no supera al azar.",
    "verdict": "igual_que_el_azar",
    "strategy": "frecuencia_reciente",
    "super_hits": 41,
    "p_holm_super": 0.5948531157675049,
    "p_value_super": 0.14871327894187622,
    "p_holm_matches": 1.0,
    "average_matches": 0.5425,
    "p_value_matches": 0.9160281259998688,
    "draws_with_prize": 35,
    "prize_categories": [
     {
      "label": "5 + SB",
      "times": 0,
      "expected_by_chance": 0.0
     },
     {
      "label": "5",
      "times": 0,
      "expected_by_chance": 0.0
     },
     {
      "label": "4 + SB",
      "times": 0,
      "expected_by_chance": 0.01
     },
     {
      "label": "4",
      "times": 0,
      "expected_by_chance": 0.1
     },
     {
      "label": "3 + SB",
      "times": 0,
      "expected_by_chance": 0.25
     },
     {
      "label": "3",
      "times": 2,
      "expected_by_chance": 3.79
     },
     {
      "label": "2 + SB",
      "times": 5,
      "expected_by_chance": 3.03
     },
     {
      "label": "0 + SB",
      "times": 28,
      "expected_by_chance": 18.02
     }
    ],
    "matches_distribution": [
     309,
     190,
     52,
     2,
     0,
     0
    ],
    "draws_with_prize_expected": 25.2,
    "expected_average_by_chance": 0.5814,
    "matches_distribution_expected": [
     288.36,
     212.03,
     48.46,
     4.04,
     0.11,
     0.0
    ],
    "super_hits_expected_by_chance": 34.56
   },
   {
    "draws": 553,
    "plain": "Jugando una combinación al azar en cada uno de los 553 sorteos, se acertaron en promedio 0,5986 números (lo teórico es 0,58) y la superbalota 43 veces (teórico: 34,56).",
    "verdict": "referencia",
    "strategy": "azar",
    "super_hits": 43,
    "p_value_super": 0.08478440781133108,
    "average_matches": 0.5986,
    "p_value_matches": 0.2860372138812296,
    "draws_with_prize": 29,
    "prize_categories": [
     {
      "label": "5 + SB",
      "times": 0,
      "expected_by_chance": 0.0
     },
     {
      "label": "5",
      "times": 0,
      "expected_by_chance": 0.0
     },
     {
      "label": "4 + SB",
      "times": 0,
      "expected_by_chance": 0.01
     },
     {
      "label": "4",
      "times": 0,
      "expected_by_chance": 0.1
     },
     {
      "label": "3 + SB",
      "times": 1,
      "expected_by_chance": 0.25
     },
     {
      "label": "3",
      "times": 3,
      "expected_by_chance": 3.79
     },
     {
      "label": "2 + SB",
      "times": 3,
      "expected_by_chance": 3.03
     },
     {
      "label": "0 + SB",
      "times": 22,
      "expected_by_chance": 18.02
     }
    ],
    "matches_distribution": [
     276,
     227,
     46,
     4,
     0,
     0
    ],
    "draws_with_prize_expected": 25.2,
    "expected_average_by_chance": 0.5814,
    "matches_distribution_expected": [
     288.36,
     212.03,
     48.46,
     4.04,
     0.11,
     0.0
    ],
    "super_hits_expected_by_chance": 34.56
   }
  ],
  "official_strategy": "azar"
 }
} as unknown as TrackRecord;

export const rules = {
 "id": 3,
 "version_number": 2,
 "name": "Reglas verificadas + categorías oficiales de premio",
 "main_min": 1,
 "main_max": 43,
 "super_min": 1,
 "super_max": 16,
 "main_unique": true,
 "main_order": "sorted_asc",
 "draw_weekdays": [
  0,
  2,
  5
 ],
 "notes": "Rangos 1-43 y SB 1-16 verificados con 653 sorteos. Categorías de premio tal como aparecen en la tabla oficial; 1+SB no aparece en esa tabla.",
 "prize_categories": [
  {
   "label": "5 + SB",
   "super": true,
   "matches": 5
  },
  {
   "label": "5",
   "super": false,
   "matches": 5
  },
  {
   "label": "4 + SB",
   "super": true,
   "matches": 4
  },
  {
   "label": "4",
   "super": false,
   "matches": 4
  },
  {
   "label": "3 + SB",
   "super": true,
   "matches": 3
  },
  {
   "label": "3",
   "super": false,
   "matches": 3
  },
  {
   "label": "2 + SB",
   "super": true,
   "matches": 2
  },
  {
   "label": "0 + SB",
   "super": true,
   "matches": 0
  }
 ],
 "prize_source": "https://baloto.com/resultados-baloto/2734 (tabla oficial de premios, consultada 2026-11-13)",
 "created_at": "2026-11-13T14:42:04.765988-05:00",
 "fully_confirmed": true
} as unknown as Rules;
