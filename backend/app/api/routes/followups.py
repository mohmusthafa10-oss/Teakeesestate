from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import (
    check_reassignment_permission,
    check_record_access,
    get_current_active_user,
    require_permission,
)
from app.core.permissions import Permission
from app.database.session import get_db
from app.models.models import FollowUp, User
from app.schemas.schemas import (
    FollowUpCompleteRequest,
    FollowUpCreate,
    FollowUpResponse,
    FollowUpUpdate,
    PaginatedResponse,
)
from app.services.services import complete_followup, create_followup, list_followups, log_activity

router = APIRouter(prefix="/api/followups", tags=["Follow-ups"])

@router.get("", response_model=PaginatedResponse[FollowUpResponse])
def get_followups(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    status: Optional[str] = None,
    current_user: User = Depends(require_permission("followups.read")),
    db: Session = Depends(get_db),
):
    agent_id = current_user.id if current_user.role == "Agent" else None
    items, total = list_followups(db, page, page_size, status, agent_id)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)

@router.post("", response_model=FollowUpResponse, status_code=status.HTTP_201_CREATED)
def add_followup(
    data: FollowUpCreate,
    current_user: User = Depends(require_permission("followups.create")),
    db: Session = Depends(get_db),
):
    check_reassignment_permission(data, current_user)
    return create_followup(db, data, current_user.id)

@router.put("/{id}", response_model=FollowUpResponse)
def update_followup(
    id: str,
    data: FollowUpUpdate,
    current_user: User = Depends(require_permission("followups.update")),
    db: Session = Depends(get_db),
):
    fup = db.query(FollowUp).filter(FollowUp.id == id).first()
    if not fup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    check_record_access(fup, current_user, owner_field="assigned_agent_id")
    check_reassignment_permission(data, current_user)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(fup, k, v)
    db.commit()
    db.refresh(fup)
    return fup

@router.post("/{id}/complete", response_model=FollowUpResponse)
def complete_followup_endpoint(
    id: str,
    req: FollowUpCompleteRequest,
    current_user: User = Depends(require_permission("followups.update")),
    db: Session = Depends(get_db),
):
    fup = db.query(FollowUp).filter(FollowUp.id == id).first()
    if not fup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    check_record_access(fup, current_user, owner_field="assigned_agent_id")
    res = complete_followup(db, id, req, current_user.id)
    if not res:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return res


@router.delete("/{id}", response_model=dict)
def delete_followup_endpoint(
    id: str,
    current_user: User = Depends(require_permission(Permission.FOLLOWUPS_DELETE.value)),
    db: Session = Depends(get_db),
):
    fup = db.query(FollowUp).filter(FollowUp.id == id).first()
    if not fup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    check_record_access(fup, current_user, owner_field="assigned_agent_id")
    title = fup.title
    db.delete(fup)
    log_activity(db, "FollowUp", id, "Deleted", f"Follow-up '{title}' deleted", current_user.id)
    db.commit()
    return {"detail": "Follow-up deleted successfully", "id": id}

