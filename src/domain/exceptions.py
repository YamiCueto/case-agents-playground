class DomainError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidStatusTransitionError(DomainError):
    def __init__(self, current_status: str, target_status: str, reason: str = ""):
        message = f"Transición de estado no permitida: {current_status} -> {target_status}."
        if reason:
            message = f"{message} Motivo: {reason}"
        super().__init__(message)
        self.current_status = current_status
        self.target_status = target_status


class UnauthorizedActionError(DomainError):
    def __init__(self, user_role: str, action: str):
        message = f"El rol '{user_role}' no está autorizado para ejecutar la acción: '{action}'."
        super().__init__(message)
        self.user_role = user_role
        self.action = action


class EntityNotFoundError(DomainError):
    def __init__(self, entity_name: str, identifier: str):
        message = f"{entity_name} con identificador '{identifier}' no fue encontrado."
        super().__init__(message)
        self.entity_name = entity_name
        self.identifier = identifier


class ValidationError(DomainError):
    def __init__(self, message: str):
        super().__init__(message)


class QueryExceedsTokenBudgetError(DomainError):
    def __init__(self, query_length: int, estimated_tokens: int, max_tokens: int):
        message = (
            f"La consulta del usuario ({query_length} caracteres, ~{estimated_tokens} tokens) "
            f"excede el presupuesto máximo asignado de {max_tokens} tokens. "
            "Por favor sintetice o divida su solicitud."
        )
        super().__init__(message)
        self.query_length = query_length
        self.estimated_tokens = estimated_tokens
        self.max_tokens = max_tokens


class SensitiveDataPolicyError(DomainError):
    def __init__(self, pattern_detected: str, field_name: str = ""):
        message = (
            f"Se detectó información sensible o credenciales ({pattern_detected}) en '{field_name}'. "
            "La política de seguridad prohíbe persistir o propagar datos sensibles."
        )
        super().__init__(message)
        self.pattern_detected = pattern_detected
        self.field_name = field_name

