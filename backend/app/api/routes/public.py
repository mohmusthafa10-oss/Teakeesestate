from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_optional
from app.core.rate_limiter import login_limiter
from app.database.session import get_db
from app.models.models import Lead, Property, PropertyImage, PropertyPublication, PropertySubmission, SubmissionMedia, SubmissionStatus, User
from app.services.media_storage import MediaStorageService
from app.services.services import calculate_days_listed, generate_sequential_code

router = APIRouter(prefix="/api/public", tags=["Public Submissions & Listings"])


class PublicPropertyEnquiry(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=7, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    message: Optional[str] = Field(None, max_length=1000)


def _generate_reference() -> str:
    """Generate a human‑readable submission reference like SUB‑AB12CD34."""
    return f"SUB-{uuid.uuid4().hex[:8].upper()}"


@router.post("/property-submissions", response_model=dict)
async def create_property_submission(
    request: Request,
    seller_name: str = Form(...),
    mobile: str = Form(...),
    property_type: str = Form(...),
    location: str = Form(...),
    description: str = Form(...),
    expected_price: Optional[float] = Form(None),
    size: Optional[float] = Form(None),
    bedrooms: Optional[int] = Form(None),
    bathrooms: Optional[int] = Form(None),
    notes: Optional[str] = Form(None),
    files: List[UploadFile] = File([]),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Public endpoint for property submission.
    Enforces file count limits, magic-byte validation, EXIF stripping, IP rate limiting,
    and duplicate submission detection.
    """
    # 1. IP rate limiting on public submission endpoint
    client_ip = login_limiter.get_client_ip(request)
    submission_ip_key = f"pub_submit_{client_ip}"
    login_limiter.check_rate_limit(submission_ip_key)

    # 2. File count enforcement
    if len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 media files allowed per property submission.",
        )

    # 3. Basic duplicate submission detection (same phone & location within 15 minutes)
    clean_phone = mobile.strip()
    fifteen_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=15)
    existing_dup = (
        db.query(PropertySubmission)
        .filter(
            PropertySubmission.phone == clean_phone,
            PropertySubmission.location.ilike(location.strip()),
            PropertySubmission.created_at >= fifteen_mins_ago,
        )
        .first()
    )
    if existing_dup:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A property submission for this location was recently received. Reference: {existing_dup.reference}",
        )

    # 4. Create submission record
    now_utc = datetime.now(timezone.utc)
    submission = PropertySubmission(
        reference=_generate_reference(),
        seller_name=seller_name.strip(),
        phone=clean_phone,
        type=property_type,
        location=location.strip(),
        description=description.strip(),
        expected_price=expected_price,
        size=size,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        notes=notes,
        status=SubmissionStatus.PENDING_REVIEW.value,
        contact_deadline_at=now_utc + timedelta(hours=48),
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(submission)
    db.flush()

    # 5. Process media files through validation and EXIF stripping with cleanup on error
    media_service = MediaStorageService()
    saved_storage_keys: List[str] = []
    try:
        for order, upload in enumerate(files, start=1):
            saved = media_service.save_file(upload)
            saved_storage_keys.append(saved["storage_key"])
            media = SubmissionMedia(
                submission_id=submission.id,
                original_filename=upload.filename or "media",
                storage_key=saved["storage_key"],
                mime_type=saved["mime_type"],
                size=saved["size"],
                category="video" if "video" in saved["mime_type"] else "photo",
                order=order,
            )
            db.add(media)
        db.commit()
    except Exception:
        db.rollback()
        for key in saved_storage_keys:
            try:
                media_service.delete_file(key)
            except Exception:
                pass
        raise

    return {
        "reference": submission.reference,
        "status": submission.status,
        "contact_deadline_at": submission.contact_deadline_at.isoformat() if submission.contact_deadline_at else None,
        "message": "Thank you for submitting your property! Our team will contact you within 48 hours.",
    }


# ==================== PUBLIC PROPERTIES & ENQUIRIES ====================

@router.get("/properties", response_model=dict)
def list_public_properties(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by title, location, district"),
    property_type: Optional[str] = Query(None, alias="type"),
    category: Optional[str] = None,
    district: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """List publicly published properties only."""
    query = (
        db.query(Property)
        .join(PropertyPublication, Property.id == PropertyPublication.property_id)
        .filter(PropertyPublication.is_published == True)
    )

    if property_type:
        query = query.filter(Property.type == property_type)
    if category:
        query = query.filter(Property.category == category)
    if district:
        query = query.filter(Property.district.ilike(f"%{district}%"))
    if min_price is not None:
        query = query.filter(Property.expected_price >= min_price)
    if max_price is not None:
        query = query.filter(Property.expected_price <= max_price)
    if search:
        search_filter = or_(
            Property.title.ilike(f"%{search}%"),
            Property.locality.ilike(f"%{search}%"),
            Property.panchayath.ilike(f"%{search}%"),
            Property.district.ilike(f"%{search}%"),
            Property.description.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)

    total = query.count()
    properties = query.order_by(desc(Property.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for p in properties:
        primary_img = None
        images = []
        for img in p.images:
            img_data = {
                "id": img.id,
                "url": img.url,
                "caption": img.caption,
                "is_primary": img.is_primary,
            }
            images.append(img_data)
            if img.is_primary and not primary_img:
                primary_img = img.url
        if not primary_img and images:
            primary_img = images[0]["url"]

        items.append({
            "id": p.id,
            "code": p.code,
            "title": p.title,
            "type": p.type,
            "category": p.category,
            "district": p.district,
            "panchayath": p.panchayath,
            "locality": p.locality,
            "area_value": float(p.area_value) if p.area_value is not None else 0.0,
            "area_unit": p.area_unit,
            "expected_price": float(p.expected_price) if p.expected_price is not None else 0.0,
            "description": p.description,
            "primary_image": primary_img,
            "images": images,
            "days_listed": calculate_days_listed(p.listed_date.isoformat() if p.listed_date else None, p.created_at),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/properties/{property_id}", response_model=dict)
def get_public_property(
    property_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve details for a single published property. Returns 404 if unpublished or not found."""
    pub = (
        db.query(PropertyPublication)
        .filter(PropertyPublication.property_id == property_id, PropertyPublication.is_published == True)
        .first()
    )
    if not pub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found or not publicly available")

    p = db.query(Property).filter(Property.id == property_id).first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    images = [
        {"id": img.id, "url": img.url, "caption": img.caption, "is_primary": img.is_primary}
        for img in p.images
    ]
    primary_img = next((img["url"] for img in images if img["is_primary"]), images[0]["url"] if images else None)

    return {
        "id": p.id,
        "code": p.code,
        "title": p.title,
        "type": p.type,
        "category": p.category,
        "district": p.district,
        "panchayath": p.panchayath,
        "locality": p.locality,
        "full_address": p.full_address,
        "area_value": float(p.area_value) if p.area_value is not None else 0.0,
        "area_unit": p.area_unit,
        "expected_price": float(p.expected_price) if p.expected_price is not None else 0.0,
        "road_connectivity": p.road_connectivity,
        "distance_to_highway": p.distance_to_highway,
        "nearby_landmarks": p.nearby_landmarks,
        "water_availability": p.water_availability,
        "terrain": p.terrain,
        "frontage": p.frontage,
        "electricity": p.electricity,
        "boundary_details": p.boundary_details,
        "other_features": p.other_features,
        "description": p.description,
        "primary_image": primary_img,
        "images": images,
        "days_listed": calculate_days_listed(p.listed_date.isoformat() if p.listed_date else None, p.created_at),
    }


@router.post("/properties/{property_id}/enquiry", response_model=dict, status_code=status.HTTP_201_CREATED)
def submit_property_enquiry(
    property_id: str,
    data: PublicPropertyEnquiry,
    db: Session = Depends(get_db),
):
    """Submit a public inquiry for a published property, generating a Lead."""
    pub = (
        db.query(PropertyPublication)
        .filter(PropertyPublication.property_id == property_id, PropertyPublication.is_published == True)
        .first()
    )
    if not pub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found or not available for enquiry")

    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    try:
        lead_code = generate_sequential_code(db, "LED", pad=4, start=1001)
    except Exception:
        lead_code = f"LED-{uuid.uuid4().hex[:6].upper()}"

    lead = Lead(
        id=str(uuid.uuid4()),
        code=lead_code,
        name=data.name,
        phone=data.phone,
        email=data.email,
        lead_source="Website",
        property_type=prop.type,
        property_category=prop.category,
        preferred_district=prop.district,
        preferred_locality=prop.locality,
        min_budget=prop.expected_price,
        max_budget=prop.expected_price,
        requirement_description=f"Public enquiry for {prop.title} ({prop.code}): {data.message or 'Interested in this property'}",
        status="New",
        assigned_agent_id=prop.assigned_agent_id,
        notes=f"Generated from website property enquiry for {prop.code}",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    return {
        "detail": "Thank you for your enquiry! Our representative will contact you shortly.",
        "enquiry_reference": lead.code,
        "property_code": prop.code,
    }
