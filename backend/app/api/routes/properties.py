from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_permission
from app.database.session import get_db
from app.models.models import PriceHistory, Property, PropertyMatch, User
from app.schemas.schemas import PaginatedResponse, PriceHistoryResponse, PropertyCreate, PropertyResponse, PropertyUpdate
from app.services.services import (
    calculate_days_listed,
    create_property,
    find_matching_leads,
    get_map_properties,
    get_property,
    list_properties,
    update_property,
)

router = APIRouter(prefix="/api/properties", tags=["Properties"])

@router.get("", response_model=PaginatedResponse[PropertyResponse])
def get_properties(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    category: Optional[str] = None,
    district: Optional[str] = None,
    current_user: User = Depends(require_permission("properties.read")),
    db: Session = Depends(get_db),
):
    agent_id = current_user.id if current_user.role == "Agent" else None
    items, total = list_properties(db, page, page_size, search, status, type, category, district, agent_id)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)

@router.post("", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
def add_property(
    data: PropertyCreate,
    current_user: User = Depends(require_permission("properties.create")),
    db: Session = Depends(get_db),
):
    prop = create_property(db, data, current_user.id)
    prop.days_listed = calculate_days_listed(prop.listed_date, prop.created_at)
    return prop

@router.get("/map", response_model=List[PropertyResponse])
def get_map_view(
    status: Optional[str] = None,
    type: Optional[str] = None,
    district: Optional[str] = None,
    current_user: User = Depends(require_permission("properties.read")),
    db: Session = Depends(get_db),
):
    filters = {}
    if status:
        filters["status"] = status
    if type:
        filters["type"] = type
    if district:
        filters["district"] = district
    return get_map_properties(db, filters)

@router.get("/{id}", response_model=PropertyResponse)
def get_property_by_id(
    id: str,
    current_user: User = Depends(require_permission("properties.read")),
    db: Session = Depends(get_db),
):
    prop = get_property(db, id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.days_listed = calculate_days_listed(prop.listed_date, prop.created_at)
    return prop

@router.put("/{id}", response_model=PropertyResponse)
def update_property_by_id(
    id: str,
    data: PropertyUpdate,
    current_user: User = Depends(require_permission("properties.update")),
    db: Session = Depends(get_db),
):
    prop = update_property(db, id, data, current_user.id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop

@router.get("/{id}/leads")
def get_leads_for_property(
    id: str,
    current_user: User = Depends(require_permission("properties.read")),
    db: Session = Depends(get_db),
):
    return find_matching_leads(db, id)

@router.get("/{id}/history", response_model=List[PriceHistoryResponse])
def get_property_price_history(
    id: str,
    current_user: User = Depends(require_permission("properties.read")),
    db: Session = Depends(get_db),
):
    return db.query(PriceHistory).filter(PriceHistory.property_id == id).order_by(PriceHistory.created_at.desc()).all()

