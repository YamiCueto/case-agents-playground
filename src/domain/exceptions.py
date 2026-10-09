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
