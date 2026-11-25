from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_permission
from app.core.permissions import Permission
from app.database.session import get_db
from app.models.models import PriceHistory, Property, PropertyMatch, PropertyPublication, User
from app.schemas.schemas import PaginatedResponse, PriceHistoryResponse, PropertyCreate, PropertyResponse, PropertyUpdate
from app.services.services import (
    calculate_days_listed,
    create_property,
    find_matching_leads,
    get_map_properties,
    get_property,
    list_properties,
    log_activity,
    update_property,
)

router = APIRouter(prefix="/api/properties", tags=["Properties"])


class PropertyAssignRequest(BaseModel):
    assigned_agent_id: str = Field(..., description="User ID of the agent to assign")


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
    if current_user.role == "Agent" and prop.assigned_agent_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access properties assigned to other agents",
        )
    prop.days_listed = calculate_days_listed(prop.listed_date, prop.created_at)
    return prop


@router.put("/{id}", response_model=PropertyResponse)
def update_property_by_id(
    id: str,
    data: PropertyUpdate,
    current_user: User = Depends(require_permission("properties.update")),
    db: Session = Depends(get_db),
):
    prop = get_property(db, id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    if current_user.role == "Agent" and prop.assigned_agent_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify properties assigned to other agents",
        )
    prop = update_property(db, id, data, current_user.id)
    return prop


@router.patch("/{id}/assign", response_model=dict)
def assign_property(
    id: str,
    data: PropertyAssignRequest,
    current_user: User = Depends(require_permission(Permission.PROPERTIES_ASSIGN.value)),
    db: Session = Depends(get_db),
):
    prop = get_property(db, id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    target_agent = db.query(User).filter(User.id == data.assigned_agent_id).first()
    if not target_agent or not target_agent.active:
        raise HTTPException(status_code=400, detail="Target agent not found or inactive")

    prop.assigned_agent_id = target_agent.id
    log_activity(db, "Property", prop.id, "Assigned", f"Property {prop.code} assigned to {target_agent.name}", current_user.id)
    db.commit()
    return {
        "detail": "Property assigned successfully",
        "property_id": id,
        "assigned_agent_id": target_agent.id,
        "agent_name": target_agent.name,
    }


@router.post("/{id}/publish", response_model=dict)
def publish_property(
    id: str,
    current_user: User = Depends(require_permission(Permission.PROPERTIES_PUBLISH.value)),
    db: Session = Depends(get_db),
):
    prop = get_property(db, id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    pub = db.query(PropertyPublication).filter(PropertyPublication.property_id == id).first()
    now = datetime.now(timezone.utc)
    if not pub:
        pub = PropertyPublication(
            property_id=id,
            is_published=True,
            published_at=now,
            published_by_id=current_user.id,
        )
        db.add(pub)
    else:
        pub.is_published = True
        pub.published_at = now
        pub.published_by_id = current_user.id
        pub.unpublished_at = None
        pub.unpublished_by_id = None

    prop.status = "Active"
    log_activity(db, "Property", prop.id, "Published", f"Property {prop.code} published publicly", current_user.id)
    db.commit()
    return {"detail": "Property published successfully", "property_id": id, "is_published": True}


@router.post("/{id}/unpublish", response_model=dict)
def unpublish_property(
    id: str,
    current_user: User = Depends(require_permission(Permission.PROPERTIES_PUBLISH.value)),
    db: Session = Depends(get_db),
):
    prop = get_property(db, id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    pub = db.query(PropertyPublication).filter(PropertyPublication.property_id == id).first()
    now = datetime.now(timezone.utc)
    if not pub:
        pub = PropertyPublication(
            property_id=id,
            is_published=False,
            unpublished_at=now,
            unpublished_by_id=current_user.id,
        )
        db.add(pub)
    else:
        pub.is_published = False
        pub.unpublished_at = now
        pub.unpublished_by_id = current_user.id

    log_activity(db, "Property", prop.id, "Unpublished", f"Property {prop.code} unpublished from public site", current_user.id)
    db.commit()
    return {"detail": "Property unpublished successfully", "property_id": id, "is_published": False}


@router.get("/{id}/publication", response_model=dict)
def get_property_publication_status(
    id: str,
    current_user: User = Depends(require_permission("properties.read")),
    db: Session = Depends(get_db),
):
    prop = get_property(db, id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    pub = db.query(PropertyPublication).filter(PropertyPublication.property_id == id).first()
    return {
        "property_id": id,
        "is_published": pub.is_published if pub else False,
        "published_at": pub.published_at if pub else None,
        "unpublished_at": pub.unpublished_at if pub else None,
    }


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

