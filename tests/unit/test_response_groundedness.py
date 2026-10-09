import pytest
from typing import Any, Dict, List


def evaluate_response_faithfulness(
    response_text: str,
    observed_tool_data: Dict[str, Any],
    require_code: bool = False,
) -> List[str]:
    violations: List[str] = []
    text_upper = response_text.upper()

    if require_code and "code" in observed_tool_data:
        expected_code = observed_tool_data["code"]
        if expected_code not in response_text:
            violations.append(f"Falta código de ticket esperado: {expected_code}")

    if "status" in observed_tool_data:
        expected_status = observed_tool_data["status"]
        other_statuses = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"} - {expected_status}
        for wrong_status in other_statuses:
            if f"ESTADO: {wrong_status}" in text_upper or f"ESTADO ES {wrong_status}" in text_upper:
                violations.append(f"Estado erróneo detectado en respuesta: {wrong_status}")

    if "comments" not in observed_tool_data or not observed_tool_data["comments"]:
        suspicious_terms = ["MANTENIMIENTO NOCTURNO", "ÍNDICES", "INDICES", "REINICIO DE SERVIDOR"]
        for term in suspicious_terms:
            if term in text_upper:
                violations.append(f"Afirmación no respaldada en los datos observados: {term}")

    return violations


def test_evaluator_accepts_grounded_response() -> None:
    tool_data = {
        "code": "TICK-1001",
        "status": "OPEN",
        "priority": "HIGH",
        "comments": [],
    }
    response = "El ticket TICK-1001 tiene un estado de OPEN con prioridad HIGH."
    violations = evaluate_response_faithfulness(response, tool_data)
    assert len(violations) == 0


def test_evaluator_flags_hallucinated_maintenance() -> None:
    tool_data = {
        "code": "TICK-1001",
        "status": "OPEN",
        "priority": "HIGH",
        "comments": [],
    }
    hallucinated_response = (
        "El ticket TICK-1001 está OPEN. Se programa mantenimiento nocturno de índices para resolverlo."
    )
    violations = evaluate_response_faithfulness(hallucinated_response, tool_data)
    assert len(violations) > 0
    assert any("MANTENIMIENTO NOCTURNO" in v for v in violations)


def test_evaluator_flags_wrong_status() -> None:
    tool_data = {
        "code": "TICK-1001",
        "status": "OPEN",
    }
    wrong_status_response = "El ticket TICK-1001 tiene estado: CLOSED."
    violations = evaluate_response_faithfulness(wrong_status_response, tool_data)
    assert len(violations) > 0
    assert any("CLOSED" in v for v in violations)


def evaluate_communicative_quality(
    response_text: str,
    expected_code: str = "",
    expected_status: str = "",
) -> List[str]:
    violations: List[str] = []
    trimmed = response_text.strip()
    words = trimmed.split()

    if len(words) < 4:
        violations.append(f"Respuesta telegráfica o monosilábica: '{trimmed}'")

    if expected_code and expected_code not in response_text:
        violations.append(f"Falta el código de ticket {expected_code}")

    if expected_status:
        if expected_status not in response_text:
            violations.append(f"Falta el estado técnico {expected_status}")
        friendly_terms = {
            "OPEN": ["ABIERTO", "ABIERTA"],
            "IN_PROGRESS": ["EN PROGRESO", "EN CURSO", "EN TRÁMITE", "EN TRAMITE"],
            "RESOLVED": ["RESUELTO", "RESUELTA", "SOLUCIONADO", "SOLUCIONADA"],
            "CLOSED": ["CERRADO", "CERRADA"],
        }
        if expected_status in friendly_terms:
            text_upper = response_text.upper()
            has_friendly = any(term in text_upper for term in friendly_terms[expected_status])
            if not has_friendly:
                violations.append(f"Falta traducción o significado amigable en español para {expected_status}")

    return violations


def test_communicative_quality_rejects_bare_monosyllable() -> None:
    violations = evaluate_communicative_quality("OPEN", "TICK-1001", "OPEN")
    assert len(violations) >= 2
    assert any("telegráfica" in v for v in violations)
    assert any("Falta el código" in v for v in violations)


def test_communicative_quality_flags_missing_spanish_translation() -> None:
    violations = evaluate_communicative_quality(
        "El ticket TICK-1001 se encuentra actualmente en estado OPEN.",
        "TICK-1001",
        "OPEN",
    )
    assert len(violations) == 1
    assert any("traducción" in v for v in violations)


def test_communicative_quality_accepts_natural_response() -> None:
    natural_text = "El estado del ticket TICK-1001 es OPEN (Abierto)."
    violations = evaluate_communicative_quality(natural_text, "TICK-1001", "OPEN")
    assert len(violations) == 0

