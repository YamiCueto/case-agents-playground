"""
Módulo de Identidad Simulada para el Playground de Agentes.
"""
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from src.domain.enums import UserRole
from src.domain.exceptions import EntityNotFoundError, UnauthorizedActionError
from src.infrastructure.repositories.user_repository import UserRepository


@dataclass(frozen=True)
class SimulatedIdentity:
    """
    Representa una identidad simulada de laboratorio resuelta a partir de la base de datos.

    NOTA ARQUITECTONICA DE SEGURIDAD:
    Esta entidad NO es un token de autenticacion criptografica.
    En el entorno de pruebas y pair-programming del Agent Engineering Playground,
    permite vincular el subject_id enviado por el cliente con un usuario real existente
    en MySQL (verificando su ID numerico, rol y estado activo), sin presentar este
    mecanismo como autenticacion criptografica de produccion.
    """
    user_id: int
    username: str
    full_name: str
    role: UserRole
    is_active: bool
    is_lab_simulation: bool = True


class LabSimulatedIdentityResolver:
    """
    Resolvedor de identidad simulada para entornos de laboratorio.

    Verifica que el identificador (user_persona / subject_id) corresponda a un usuario
    existente y activo en la base de datos relacional de laboratorio.
    """

    def __init__(self, session: Session) -> None:
        self.user_repo = UserRepository(session)

    def resolve(self, username_or_persona: str) -> SimulatedIdentity:
        """
        Resuelve y valida la existencia del usuario simulado en MySQL.

        Lanza:
            EntityNotFoundError: si el usuario no existe en la base de datos.
            UnauthorizedActionError: si el usuario existe pero se encuentra inactivo.
        """
        user = self.user_repo.get_by_username(username_or_persona)
        if user is None:
            raise EntityNotFoundError(
                entity_name="User",
                identifier=username_or_persona,
            )
        if not user.is_active:
            raise UnauthorizedActionError(
                user_role=user.role.value,
                action="operate_as_simulated_identity",
            )

        return SimulatedIdentity(
            user_id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            is_lab_simulation=True,
        )
