from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from src.infrastructure.database.connection import get_app_session
from src.application.ticket_service import TicketService
from src.application.dtos import TicketSummaryDTO, TicketDetailDTO
from src.domain.exceptions import EntityNotFoundError, UnauthorizedActionError
from src.api.security import sanitize_payload

router = APIRouter(prefix="/api/tickets", tags=["Tickets Snapshot"])


@router.get("", response_model=List[TicketSummaryDTO])
def list_tickets(
    viewer_username: str = Query(default="usr_carlos"),
    status: Optional[str] = Query(default=None),
    priority: Optional[str] = Query(default=None),
    category_code: Optional[str] = Query(default=None),
    session: Session = Depends(get_app_session),
) -> List[TicketSummaryDTO]:
    service = TicketService(session)
    try:
        return service.list_tickets(
            viewer_username=viewer_username,
            status=status,
            priority=priority,
            category_code=category_code,
        )
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except UnauthorizedActionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.get("/{ticket_code}", response_model=TicketDetailDTO)
def get_ticket(
    ticket_code: str,
    viewer_username: str = Query(default="usr_carlos"),
    session: Session = Depends(get_app_session),
) -> TicketDetailDTO:
    service = TicketService(session)
    try:
        detail = service.get_ticket(ticket_code=ticket_code, viewer_username=viewer_username)
        sanitized_dict = sanitize_payload(detail.model_dump())
        return TicketDetailDTO.model_validate(sanitized_dict)
    except EntityNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except UnauthorizedActionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
