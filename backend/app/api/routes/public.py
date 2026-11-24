from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
from sqlalchemy.orm import Session
import uuid

from app.api.deps import get_current_user_optional
from app.database.session import get_db
from app.models.models import PropertySubmission, SubmissionMedia, SubmissionStatus, User
from app.services.media_storage import MediaStorageService

router = APIRouter(prefix="/api/public", tags=["Public Submissions"])

def _generate_reference() -> str:
    """Generate a human‑readable submission reference like SUB‑AB12CD34."""
    return f"SUB-{uuid.uuid4().hex[:8].upper()}"

@router.post("/property-submissions", response_model=dict)
async def create_property_submission(
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
    Accepts required fields via form data and optional media files.
    """
    # Basic required field validation (FastAPI already validates Form(...))
    # Create submission record
    submission = PropertySubmission(
        reference=_generate_reference(),
        seller_name=seller_name,
        phone=mobile,
        type=property_type,
        location=location,
        description=description,
        expected_price=expected_price,
        size=size,
        bedrooms=bedrooms,
        bathrooms=bathrooms,
        notes=notes,
        status=SubmissionStatus.PENDING_REVIEW.value,
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(submission)
    db.flush()  # obtain submission.id

    media_service = MediaStorageService()
    for order, upload in enumerate(files, start=1):
        # Simple size/extension checks could be added here
        saved = media_service.save_file(upload)
        media = SubmissionMedia(
            submission_id=submission.id,
            original_filename=upload.filename,
            storage_key=saved["storage_key"],
            mime_type=saved.get("mime_type", upload.content_type or "application/octet-stream"),
            size=saved.get("size", 0),
            category="photo" if (upload.content_type and upload.content_type.startswith("image")) else "video",
            order=order,
        )
        db.add(media)
    db.commit()
    return {
        "reference": submission.reference,
        "status": submission.status,
        "message": "Thank you for submitting your property! Our team will contact you within 48 hours.",
    }
