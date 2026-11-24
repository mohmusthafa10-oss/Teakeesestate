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
    if sub.status != SubmissionStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="Only approved submissions can be converted")
    # Create a Property record based on submission data (simplified)
    from app.models.models import Property, PropertyImage
    # Generate a unique property code – using same logic as existing seed
    import uuid
    prop_code = f"PROP-{uuid.uuid4().hex[:6].upper()}"
    prop = Property(
        code=prop_code,
        title=sub.description or "Untitled Property",
        type=sub.type,
        category="Residential",  # default – could be derived later
        district=sub.location,
        expected_price=sub.expected_price or 0,
        seller_id=None,  # No actual seller record yet; could be linked later
    )
    db.add(prop)
    db.flush()  # obtain prop.id
    # Move media entries: link them as PropertyImage records (reuse storage_key as url)
    media_items = db.query(SubmissionMedia).filter(SubmissionMedia.submission_id == sub.id).all()
    for m in media_items:
        img = PropertyImage(
            property_id=prop.id,
            url=f"/uploads/{m.storage_key}",
            caption=m.original_filename,
            is_primary=False,
        )
        db.add(img)
    # Mark submission as converted
    _transition_status(db, sub, SubmissionStatus.CONVERTED.value, current_user)
    db.commit()
    return {"detail": "Submission converted to property", "property_id": prop.id, "property_code": prop.code}
