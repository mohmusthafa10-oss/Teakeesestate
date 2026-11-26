import threading
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
from sqlalchemy.orm import Session

from app.api.deps import (
    check_reassignment_permission,
    check_record_access,
    require_permission,
)
from app.core.permissions import Permission
from app.database.session import get_db
from app.models.models import (
    PropertySubmission,
    SubmissionMedia,
    SubmissionStatus,
    User,
)

router = APIRouter(prefix="/api/admin/property-submissions", tags=["Admin Submissions"])

# Helper to fetch a submission or raise 404
def _get_submission(db: Session, submission_id: str) -> PropertySubmission:
    sub = db.query(PropertySubmission).filter(PropertySubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub

@router.get("/", response_model=List[dict])
def list_submissions(
    status_filter: Optional[str] = Query(None, description="Filter by submission status"),
    reference: Optional[str] = Query(None, description="Search by reference"),
    seller_name: Optional[str] = Query(None, description="Search by seller name"),
    phone: Optional[str] = Query(None, description="Search by phone"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_READ.value)),
):
    """List submissions with optional filters (admin view or scoped to agent/telecaller)."""
    query = db.query(PropertySubmission)
    if current_user.role == "Telecaller":
        query = query.filter(PropertySubmission.created_by_user_id == current_user.id)
    elif current_user.role == "Agent":
        query = query.filter(PropertySubmission.assigned_agent_id == current_user.id)

    if status_filter:
        query = query.filter(PropertySubmission.status == status_filter)
    if reference:
        query = query.filter(PropertySubmission.reference.ilike(f"%{reference}%"))
    if seller_name:
        query = query.filter(PropertySubmission.seller_name.ilike(f"%{seller_name}%"))
    if phone:
        query = query.filter(PropertySubmission.phone.ilike(f"%{phone}%"))
    subs = query.order_by(PropertySubmission.created_at.desc()).limit(100).all()
    # Minimal dict representation – can be expanded to a Pydantic schema later
    return [
        {
            "id": s.id,
            "reference": s.reference,
            "seller_name": s.seller_name,
            "phone": s.phone,
            "type": s.type,
            "location": s.location,
            "status": s.status,
            "created_at": s.created_at,
        }
        for s in subs
    ]

@router.get("/{submission_id}", response_model=dict)
def get_submission_detail(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_READ.value)),
):
    sub = _get_submission(db, submission_id)
    check_record_access(sub, current_user, owner_field="assigned_agent_id", creator_field="created_by_user_id")
    media = (
        db.query(SubmissionMedia)
        .filter(SubmissionMedia.submission_id == submission_id)
        .order_by(SubmissionMedia.order)
        .all()
    )
    return {
        "id": sub.id,
        "reference": sub.reference,
        "seller_name": sub.seller_name,
        "phone": sub.phone,
        "type": sub.type,
        "location": sub.location,
        "description": sub.description,
        "expected_price": sub.expected_price,
        "size": sub.size,
        "bedrooms": sub.bedrooms,
        "bathrooms": sub.bathrooms,
        "notes": sub.notes,
        "status": sub.status,
        "media": [
            {
                "id": m.id,
                "original_filename": m.original_filename,
                "url": f"/uploads/{m.storage_key}",
                "mime_type": m.mime_type,
                "size": m.size,
                "category": m.category,
                "order": m.order,
            }
            for m in media
        ],
    }

@router.patch("/{submission_id}", response_model=dict)
def update_submission(
    submission_id: str,
    updates: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_UPDATE.value)),
):
    """Partial update of mutable fields (notes, assigned agent, etc.)."""
    sub = _get_submission(db, submission_id)
    check_record_access(sub, current_user, owner_field="assigned_agent_id", creator_field="created_by_user_id")
    check_reassignment_permission(updates, current_user)
    allowed_fields = {"notes", "assigned_agent_id"}
    for key, value in updates.items():
        if key in allowed_fields:
            setattr(sub, key, value)
    db.commit()
    return {"detail": "Submission updated"}

def _transition_status(db: Session, sub: PropertySubmission, new_status: str, actor: User, comment: Optional[str] = None):
    from app.services.services import log_activity
    old_status = sub.status
    sub.status = new_status
    db.flush()
    summary = f"Submission status transitioned from '{old_status}' to '{new_status}' by {actor.name}"
    if comment:
        summary += f". Notes: {comment}"
    log_activity(db, "PropertySubmission", sub.id, f"Status: {new_status}", summary, actor.id)
    db.commit()

@router.post("/{submission_id}/approve", response_model=dict)
def approve_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_APPROVE.value)),
):
    sub = _get_submission(db, submission_id)
    if sub.status not in {SubmissionStatus.PENDING_REVIEW.value, SubmissionStatus.UNDER_REVIEW.value}:
        raise HTTPException(status_code=400, detail="Only pending/under-review submissions can be approved")
    _transition_status(db, sub, SubmissionStatus.APPROVED.value, current_user)
    return {"detail": "Submission approved"}

@router.post("/{submission_id}/reject", response_model=dict)
def reject_submission(
    submission_id: str,
    reason: str = Query(..., description="Reason for rejection"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_APPROVE.value)),
):
    sub = _get_submission(db, submission_id)
    if sub.status not in {SubmissionStatus.PENDING_REVIEW.value, SubmissionStatus.UNDER_REVIEW.value}:
        raise HTTPException(status_code=400, detail="Only pending/under-review submissions can be rejected")
    sub.notes = f"Rejection reason: {reason}\n" + (sub.notes or "")
    _transition_status(db, sub, SubmissionStatus.REJECTED.value, current_user, f"Rejection reason: {reason}")
    return {"detail": "Submission rejected"}

_conversion_lock = threading.Lock()

@router.post("/{submission_id}/convert", response_model=dict)
def convert_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_APPROVE.value)),
):
    with _conversion_lock:
        # Lock submission row for concurrency protection
        sub = (
            db.query(PropertySubmission)
            .filter(PropertySubmission.id == submission_id)
            .with_for_update()
            .first()
        )
        if not sub:
            raise HTTPException(status_code=404, detail="Submission not found")
        if sub.status == SubmissionStatus.CONVERTED.value:
            raise HTTPException(status_code=400, detail="Submission has already been converted")
        if sub.status != SubmissionStatus.APPROVED.value:
            raise HTTPException(status_code=400, detail="Only approved submissions can be converted")

        from decimal import Decimal
        from app.models.models import Property, PropertyImage, PropertyPublication, Seller
        from app.services.services import generate_sequential_code, log_activity

        clean_phone = sub.phone.strip()
        # Find existing seller by phone or create a new normalized seller record
        existing_seller = db.query(Seller).filter(Seller.phone == clean_phone).first()
        if existing_seller:
            seller_id = existing_seller.id
        else:
            try:
                seller_code = generate_sequential_code(db, "SLR", pad=4, start=1001)
            except Exception:
                import uuid
                seller_code = f"SLR{uuid.uuid4().hex[:4].upper()}"

            new_seller = Seller(
                code=seller_code,
                name=sub.seller_name.strip(),
                phone=clean_phone,
                relationship_with_property="Owner",
                address=sub.location.strip() if sub.location else None,
                notes=f"Auto-created during property submission {sub.reference} conversion",
                assigned_agent_id=sub.assigned_agent_id,
            )
            db.add(new_seller)
            db.flush()
            seller_id = new_seller.id
            log_activity(
                db,
                "Seller",
                new_seller.id,
                "Created",
                f"Seller {new_seller.code} ({new_seller.name}) created from submission {sub.reference}",
                current_user.id,
            )

        # Sequential property code
        try:
            prop_code = generate_sequential_code(db, "TAK", pad=3, start=1)
        except Exception:
            import uuid
            prop_code = f"TAK{uuid.uuid4().hex[:4].upper()}"

        area_val = Decimal(str(sub.size)) if sub.size is not None else Decimal("0")
        price_val = Decimal(str(sub.expected_price)) if sub.expected_price is not None else Decimal("0")

        # Map category based on property type
        raw_type = (sub.type or "").strip().lower()
        if any(k in raw_type for k in ("commercial", "shop", "office", "retail")):
            category = "Commercial"
        elif any(k in raw_type for k in ("plantation", "estate", "agriculture", "farm")):
            category = "Plantation"
        elif any(k in raw_type for k in ("resort", "hotel", "homestay")):
            category = "Resort"
        else:
            category = "Residential"

        # Preserve bedrooms and bathrooms in description and features
        features_list = []
        if sub.bedrooms:
            features_list.append(f"{sub.bedrooms} BHK")
        if sub.bathrooms:
            features_list.append(f"{sub.bathrooms} Bathrooms")
        features_text = ", ".join(features_list)

        full_desc = sub.description or ""
        if features_text and features_text not in full_desc:
            full_desc = f"{features_text}. {full_desc}".strip()

        prop = Property(
            code=prop_code,
            title=sub.description[:100] if sub.description else f"{sub.type} in {sub.location}",
            type=sub.type or "House",
            category=category,
            district=sub.location or "Wayanad",
            panchayath=sub.location or "Kalpetta",
            locality=sub.location,
            area_value=area_val,
            area_unit="Cents",
            bedrooms=sub.bedrooms,
            bathrooms=sub.bathrooms,
            other_features=features_text if features_text else None,
            expected_price=price_val,
            description=full_desc,
            status="Active",
            assigned_agent_id=sub.assigned_agent_id,
            seller_id=seller_id,
        )
        db.add(prop)
        db.flush()

        # Move media entries: link them as PropertyImage records with media_type and mime_type
        media_items = db.query(SubmissionMedia).filter(SubmissionMedia.submission_id == sub.id).order_by(SubmissionMedia.order).all()
        for idx, m in enumerate(media_items):
            m_type = m.category or ("video" if "video" in (m.mime_type or "").lower() else "photo")
            img = PropertyImage(
                property_id=prop.id,
                url=f"/uploads/{m.storage_key}",
                caption=m.original_filename or f"Media {idx + 1}",
                is_primary=(idx == 0 and m_type != "video"),
                media_type=m_type,
                mime_type=m.mime_type,
            )
            db.add(img)

        # Initialize PropertyPublication record (unpublished by default)
        publication = PropertyPublication(
            property_id=prop.id,
            is_published=False,
        )
        db.add(publication)

        # Mark submission as converted
        _transition_status(db, sub, SubmissionStatus.CONVERTED.value, current_user, f"Converted to Property {prop.code}")
        log_activity(db, "Property", prop.id, "Converted", f"Property {prop.code} converted from submission {sub.reference}", current_user.id)
        db.commit()
        db.refresh(prop)

        return {
            "detail": "Submission converted to property",
            "property_id": prop.id,
            "property_code": prop.code,
            "seller_id": seller_id,
        }
