from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import (
    check_reassignment_permission,
    check_record_access,
    get_current_active_user,
    require_permission,
)
from app.database.session import get_db
from app.models.models import Deal, User
from app.schemas.schemas import DealCreate, DealResponse, DealUpdate, PaginatedResponse
from app.services.services import create_deal, update_deal

router = APIRouter(prefix="/api/deals", tags=["Deals"])

@router.get("", response_model=PaginatedResponse[DealResponse])
def get_deals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    current_user: User = Depends(require_permission("deals.read")),
    db: Session = Depends(get_db),
):
    query = db.query(Deal)
    if current_user.role == "Agent":
        query = query.filter(Deal.assigned_agent_id == current_user.id)
    if status:
        query = query.filter(Deal.status == status)
    total = query.count()
    items = query.order_by(Deal.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)

@router.post("", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
def add_deal(
    data: DealCreate,
    current_user: User = Depends(require_permission("deals.create")),
    db: Session = Depends(get_db),
):
    # Prevent duplicate active sale deals on same property
    existing = db.query(Deal).filter(
        Deal.property_id == data.property_id,
        Deal.deal_type == "Sale",
        Deal.status.notin_(["Closed", "Cancelled", "Lost"]),
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"An active sale deal ({existing.code}) already exists for this property."
        )
    return create_deal(db, data, current_user.id)

@router.put("/{id}", response_model=DealResponse)
def update_deal_status(
    id: str,
    data: DealUpdate,
    current_user: User = Depends(require_permission("deals.update")),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    check_record_access(deal, current_user, owner_field="assigned_agent_id")
    check_reassignment_permission(data, current_user)
    deal = update_deal(db, id, data, current_user.id)
    return deal

