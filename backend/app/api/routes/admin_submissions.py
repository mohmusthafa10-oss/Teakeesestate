from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional
from sqlalchemy.orm import Session

from app.api.deps import require_permission
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
    permission: Permission = Depends(require_permission(Permission.SUBMISSIONS_READ.value)),
):
    """List submissions with optional filters (admin view)."""
    query = db.query(PropertySubmission)
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
    permission: Permission = Depends(require_permission(Permission.SUBMISSIONS_READ.value)),
):
    sub = _get_submission(db, submission_id)
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
    permission: Permission = Depends(require_permission(Permission.SUBMISSIONS_UPDATE.value)),
):
    """Partial update of mutable fields (notes, assigned agent, etc.)."""
    sub = _get_submission(db, submission_id)
    allowed_fields = {"notes", "assigned_agent_id"}
    for key, value in updates.items():
        if key in allowed_fields:
            setattr(sub, key, value)
    db.commit()
    return {"detail": "Submission updated"}

def _transition_status(db: Session, sub: PropertySubmission, new_status: str, actor: User, comment: Optional[str] = None):
    # Record status change in an audit log later – placeholder here
    sub.status = new_status
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
    # Store rejection reason in notes (simple implementation)
    sub.notes = f"Rejection reason: {reason}\n" + (sub.notes or "")
    _transition_status(db, sub, SubmissionStatus.REJECTED.value, current_user)
    return {"detail": "Submission rejected"}

@router.post("/{submission_id}/convert", response_model=dict)
def convert_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.SUBMISSIONS_APPROVE.value)),
):
    sub = _get_submission(db, submission_id)
    if sub.status == SubmissionStatus.CONVERTED.value:
        raise HTTPException(status_code=400, detail="Submission has already been converted")
    if sub.status != SubmissionStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="Only approved submissions can be converted")

    from decimal import Decimal
    from app.models.models import Property, PropertyImage, PropertyPublication
    from app.services.services import generate_sequential_code, log_activity

    try:
        prop_code = generate_sequential_code(db, "TAK", pad=3, start=1)
    except Exception:
        import uuid
        prop_code = f"TAK{uuid.uuid4().hex[:4].upper()}"

    area_val = Decimal(str(sub.size)) if sub.size is not None else Decimal("0")
    price_val = Decimal(str(sub.expected_price)) if sub.expected_price is not None else Decimal("0")

    prop = Property(
        code=prop_code,
        title=sub.description[:100] if sub.description else f"{sub.type} in {sub.location}",
        type=sub.type or "House",
        category="Residential",
        district=sub.location or "Wayanad",
        panchayath=sub.location or "Kalpetta",
        locality=sub.location,
        area_value=area_val,
        area_unit="Cents",
        expected_price=price_val,
        description=sub.description or "",
        status="Active",
        assigned_agent_id=sub.assigned_agent_id,
        seller_id=None,
    )
    db.add(prop)
    db.flush()

    # Move media entries: link them as PropertyImage records
    media_items = db.query(SubmissionMedia).filter(SubmissionMedia.submission_id == sub.id).order_by(SubmissionMedia.order).all()
    for idx, m in enumerate(media_items):
        img = PropertyImage(
            property_id=prop.id,
            url=f"/uploads/{m.storage_key}",
            caption=m.original_filename or f"Image {idx + 1}",
            is_primary=(idx == 0),
        )
        db.add(img)

    # Initialize PropertyPublication record
    publication = PropertyPublication(
        property_id=prop.id,
        is_published=False,
    )
    db.add(publication)

    # Mark submission as converted
    _transition_status(db, sub, SubmissionStatus.CONVERTED.value, current_user)
    log_activity(db, "Property", prop.id, "Converted", f"Property {prop.code} converted from submission {sub.reference}", current_user.id)
    db.commit()
    db.refresh(prop)

    return {
        "detail": "Submission converted to property",
        "property_id": prop.id,
        "property_code": prop.code,
    }
