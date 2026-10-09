from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.orm import Session
from src.domain.entities import User, TicketCategory
from src.domain.enums import UserRole
from src.infrastructure.database.models import UserModel, TicketCategoryModel


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, user_id: int) -> Optional[User]:
        stmt = select(UserModel).where(UserModel.id == user_id)
        model = self.session.scalar(stmt)
        if model is None:
            return None
        return self._to_user_entity(model)

    def get_by_username(self, username: str) -> Optional[User]:
        stmt = select(UserModel).where(UserModel.username == username)
        model = self.session.scalar(stmt)
        if model is None:
            return None
        return self._to_user_entity(model)

    def create(self, user: User) -> User:
        model = UserModel(
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role.value,
            is_active=user.is_active,
        )
        self.session.add(model)
        self.session.flush()
        return self._to_user_entity(model)

    def list_active(self) -> List[User]:
        stmt = select(UserModel).where(UserModel.is_active == True)
        models = self.session.scalars(stmt).all()
        return [self._to_user_entity(m) for m in models]

    def get_category_by_id(self, category_id: int) -> Optional[TicketCategory]:
        stmt = select(TicketCategoryModel).where(TicketCategoryModel.id == category_id)
        model = self.session.scalar(stmt)
        if model is None:
            return None
        return self._to_category_entity(model)

    def get_category_by_code(self, code: str) -> Optional[TicketCategory]:
        stmt = select(TicketCategoryModel).where(TicketCategoryModel.code == code)
        model = self.session.scalar(stmt)
        if model is None:
            return None
        return self._to_category_entity(model)

    def create_category(self, category: TicketCategory) -> TicketCategory:
        model = TicketCategoryModel(
            code=category.code,
            name=category.name,
            description=category.description,
            is_active=category.is_active,
        )
        self.session.add(model)
        self.session.flush()
        return self._to_category_entity(model)

    def list_categories(self) -> List[TicketCategory]:
        stmt = select(TicketCategoryModel).where(TicketCategoryModel.is_active == True)
        models = self.session.scalars(stmt).all()
        return [self._to_category_entity(m) for m in models]

    def _to_user_entity(self, model: UserModel) -> User:
        return User(
            id=model.id,
            username=model.username,
            email=model.email,
            full_name=model.full_name,
            role=UserRole(model.role),
            is_active=model.is_active,
            created_at=model.created_at,
        )

    def _to_category_entity(self, model: TicketCategoryModel) -> TicketCategory:
        return TicketCategory(
            id=model.id,
            code=model.code,
            name=model.name,
            description=model.description,
            is_active=model.is_active,
        )
