import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import (
    check_reassignment_permission,
    check_record_access,
    get_current_active_user,
    require_permission,
)
from app.database.session import get_db
from app.models.models import SiteVisit, User
from app.schemas.schemas import SiteVisitCreate, SiteVisitResponse, SiteVisitUpdate

router = APIRouter(prefix="/api/site-visits", tags=["Site Visits"])

@router.get("", response_model=List[SiteVisitResponse])
def get_site_visits(
    property_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    current_user: User = Depends(require_permission("site_visits.manage")),
    db: Session = Depends(get_db),
):
    query = db.query(SiteVisit)
    if current_user.role == "Agent":
        query = query.filter(SiteVisit.agent_id == current_user.id)
    if property_id:
        query = query.filter(SiteVisit.property_id == property_id)
    if lead_id:
        query = query.filter(SiteVisit.lead_id == lead_id)
    return query.order_by(SiteVisit.scheduled_date.desc()).all()

@router.post("", response_model=SiteVisitResponse, status_code=status.HTTP_201_CREATED)
def create_visit(
    data: SiteVisitCreate,
    current_user: User = Depends(require_permission("site_visits.manage")),
    db: Session = Depends(get_db),
):
    if current_user.role == "Agent" and data.agent_id and data.agent_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot assign visit to another agent",
        )
    visit = SiteVisit(
        id=str(uuid.uuid4()),
        property_id=data.property_id,
        lead_id=data.lead_id,
        agent_id=data.agent_id or current_user.id,
        scheduled_date=data.scheduled_date,
        scheduled_time=data.scheduled_time,
        meeting_location=data.meeting_location,
        status=data.status,
        feedback=data.feedback or "",
        visit_outcome=data.visit_outcome,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit

@router.put("/{id}", response_model=SiteVisitResponse)
def update_visit(
    id: str,
    data: SiteVisitUpdate,
    current_user: User = Depends(require_permission("site_visits.manage")),
    db: Session = Depends(get_db),
):
    visit = db.query(SiteVisit).filter(SiteVisit.id == id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Site visit not found")
    check_record_access(visit, current_user, owner_field="agent_id")
    check_reassignment_permission(data, current_user)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(visit, k, v)
    db.commit()
    db.refresh(visit)
    return visit

