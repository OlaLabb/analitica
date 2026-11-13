"""Asistente conversacional (FASE FUTURA — DESACTIVADO).

Contrato previsto: un proveedor de IA recibirá únicamente resultados YA CALCULADOS por el motor
estadístico (p. ej. el JSON de una predicción oficial o de un backtest) y devolverá texto explicativo.
Nunca calculará estadísticas ni generará predicciones. Con ASSISTANT_PROVIDER=none (valor por
defecto) no existe ninguna ruta ni pantalla del asistente y ninguna funcionalidad depende de él.
"""
from __future__ import annotations

from typing import Protocol


class AssistantProvider(Protocol):
    def explain(self, question: str, engine_results: dict) -> str: ...


class DisabledAssistant:
    def explain(self, question: str, engine_results: dict) -> str:  # pragma: no cover
        raise RuntimeError("El asistente de IA no está configurado")


def get_assistant() -> AssistantProvider:
    return DisabledAssistant()
