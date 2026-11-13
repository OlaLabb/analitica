"""Motor estadístico puro: no depende de base de datos, HTTP ni usuarios.

Versión del algoritmo: cualquier cambio que altere resultados numéricos DEBE incrementar
ALGORITHM_VERSION para que las predicciones queden trazables.
"""

ALGORITHM_VERSION = "1.0.0"
VARIABLES = ("p1", "p2", "p3", "p4", "p5", "sn")
MAIN_VARIABLES = ("p1", "p2", "p3", "p4", "p5")
VARIABLE_LABELS = {
    "p1": "Posición 1",
    "p2": "Posición 2",
    "p3": "Posición 3",
    "p4": "Posición 4",
    "p5": "Posición 5",
    "sn": "Súper Número",
}
