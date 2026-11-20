import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_permission
from app.database.session import get_db
from app.models.models import PropertyMatch, User
from app.schemas.schemas import PropertyMatchCreate, PropertyMatchResponse, PropertyMatchUpdate

router = APIRouter(prefix="/api/matches", tags=["Matches"])

@router.get("", response_model=List[PropertyMatchResponse])
def get_matches(
    lead_id: Optional[str] = None,
    property_id: Optional[str] = None,
    current_user: User = Depends(require_permission("leads.read")),
    db: Session = Depends(get_db),
):
    query = db.query(PropertyMatch)
    if lead_id:
        query = query.filter(PropertyMatch.lead_id == lead_id)
    if property_id:
        query = query.filter(PropertyMatch.property_id == property_id)
    return query.all()

@router.post("", response_model=PropertyMatchResponse, status_code=status.HTTP_201_CREATED)
def create_match_record(
    data: PropertyMatchCreate,
    current_user: User = Depends(require_permission("leads.update")),
    db: Session = Depends(get_db),
):
    existing = db.query(PropertyMatch).filter(
        PropertyMatch.lead_id == data.lead_id,
        PropertyMatch.property_id == data.property_id,
    ).first()
    if existing:
        return existing

    match = PropertyMatch(
        id=str(uuid.uuid4()),
        lead_id=data.lead_id,
        property_id=data.property_id,
        match_score=data.match_score,
        match_reasons=data.match_reasons,
        buyer_interest=data.buyer_interest,
        outcome=data.outcome,
        notes=data.notes or "",
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return match

@router.put("/{id}", response_model=PropertyMatchResponse)
def update_match_record(
    id: str,
    data: PropertyMatchUpdate,
    current_user: User = Depends(require_permission("leads.update")),
    db: Session = Depends(get_db),
):
    match = db.query(PropertyMatch).filter(PropertyMatch.id == id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(match, k, v)
    db.commit()
    db.refresh(match)
    return match

