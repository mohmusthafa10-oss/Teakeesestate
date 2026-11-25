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
from app.models.models import User
from app.schemas.schemas import LeadCreate, LeadResponse, LeadUpdate, PaginatedResponse
from app.services.services import create_lead, find_matching_properties, get_lead, list_leads, update_lead

router = APIRouter(prefix="/api/leads", tags=["Leads"])

@router.get("", response_model=PaginatedResponse[LeadResponse])
def get_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    current_user: User = Depends(require_permission("leads.read")),
    db: Session = Depends(get_db),
):
    agent_id = current_user.id if current_user.role == "Agent" else None
    items, total = list_leads(db, page, page_size, search, status, source, agent_id)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)

@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def add_lead(
    data: LeadCreate,
    current_user: User = Depends(require_permission("leads.create")),
    db: Session = Depends(get_db),
):
    return create_lead(db, data, current_user.id)

@router.get("/{id}", response_model=LeadResponse)
def get_lead_by_id(
    id: str,
    current_user: User = Depends(require_permission("leads.read")),
    db: Session = Depends(get_db),
):
    lead = get_lead(db, id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    check_record_access(lead, current_user)
    return lead

@router.put("/{id}", response_model=LeadResponse)
def update_lead_by_id(
    id: str,
    data: LeadUpdate,
    current_user: User = Depends(require_permission("leads.update")),
    db: Session = Depends(get_db),
):
    lead = get_lead(db, id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    check_record_access(lead, current_user)
    check_reassignment_permission(data, current_user)
    lead = update_lead(db, id, data, current_user.id)
    return lead

@router.get("/{id}/matches")
def get_matches_for_lead(
    id: str,
    current_user: User = Depends(require_permission("leads.read")),
    db: Session = Depends(get_db),
):
    lead = get_lead(db, id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    check_record_access(lead, current_user)
    return find_matching_properties(db, id)

