from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_permission
from app.database.session import get_db
from app.models.models import Property, Seller, User
from app.schemas.schemas import PaginatedResponse, PropertyResponse, SellerCreate, SellerResponse, SellerUpdate
from app.services.services import create_seller, get_seller, list_sellers, update_seller

router = APIRouter(prefix="/api/sellers", tags=["Sellers"])

@router.get("", response_model=PaginatedResponse[SellerResponse])
def get_sellers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    current_user: User = Depends(require_permission("sellers.read")),
    db: Session = Depends(get_db),
):
    agent_id = current_user.id if current_user.role == "Agent" else None
    items, total = list_sellers(db, page, page_size, search, agent_id)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)

@router.post("", response_model=SellerResponse, status_code=status.HTTP_201_CREATED)
def add_seller(
    data: SellerCreate,
    current_user: User = Depends(require_permission("sellers.create")),
    db: Session = Depends(get_db),
):
    return create_seller(db, data, current_user.id)

@router.get("/{id}", response_model=SellerResponse)
def get_seller_by_id(
    id: str,
    current_user: User = Depends(require_permission("sellers.read")),
    db: Session = Depends(get_db),
):
    seller = get_seller(db, id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    if current_user.role == "Agent" and seller.assigned_agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this seller")
    return seller

@router.put("/{id}", response_model=SellerResponse)
def update_seller_by_id(
    id: str,
    data: SellerUpdate,
    current_user: User = Depends(require_permission("sellers.update")),
    db: Session = Depends(get_db),
):
    seller = get_seller(db, id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    if current_user.role == "Agent" and seller.assigned_agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this seller")
    return update_seller(db, id, data, current_user.id)

@router.get("/{id}/properties", response_model=List[PropertyResponse])
def get_seller_properties(
    id: str,
    current_user: User = Depends(require_permission("sellers.read")),
    db: Session = Depends(get_db),
):
    seller = get_seller(db, id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    props = db.query(Property).filter(Property.seller_id == id).all()
    from app.services.services import calculate_days_listed
    for p in props:
        p.days_listed = calculate_days_listed(p.listed_date, p.created_at)
    return props

