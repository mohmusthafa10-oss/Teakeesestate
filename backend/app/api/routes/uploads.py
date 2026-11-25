import os
import re
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_user_optional
from app.core.config import settings
from app.database.session import get_db
from app.models.models import (
    Property,
    PropertyDocument,
    PropertyImage,
    PropertyPublication,
    PropertySubmission,
    Seller,
    SubmissionMedia,
    User,
)

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".docx", ".doc"}
ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
EXTENSION_TO_MIME = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".pdf": {"application/pdf"},
    ".doc": {"application/msword"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
}

SAFE_FILENAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def ensure_upload_dirs() -> tuple[str, str]:
    """
    Explicit storage directory initialization.
    Validates that public and private directories exist, are absolute,
    and do not overlap.
    """
    public_dir = os.path.realpath(os.path.abspath(settings.PUBLIC_UPLOAD_DIR))
    private_dir = os.path.realpath(os.path.abspath(settings.PRIVATE_UPLOAD_DIR))

    if public_dir == private_dir:
        raise ValueError("PUBLIC_UPLOAD_DIR and PRIVATE_UPLOAD_DIR cannot be the same directory")
    if public_dir.startswith(private_dir + os.sep) or private_dir.startswith(public_dir + os.sep):
        raise ValueError("PUBLIC_UPLOAD_DIR and PRIVATE_UPLOAD_DIR cannot overlap")

    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(private_dir, exist_ok=True)
    return public_dir, private_dir


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    private: bool = Query(False),
    current_user: User = Depends(get_current_active_user),
):
    """
    Upload a media file (up to 5 MiB) with strict server-side MIME detection.
    Public uploads receive a static URL. Private uploads are stored in an isolated
    directory and accessed only via the authenticated, authorized private download endpoint.
    """
    public_dir, private_dir = ensure_upload_dirs()
    upload_dir = private_dir if private else public_dir

    # Validate file extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Disallowed file format")

    if private:
        # Encode uploader id for reliable ownership verification on private downloads
        filename = f"{current_user.id}__{uuid.uuid4()}{ext}"
    else:
        filename = f"{uuid.uuid4()}{ext}"

    dest_path = os.path.join(upload_dir, filename)

    # Stream the upload to disk while enforcing size limit (5 MiB)
    max_size = 5 * 1024 * 1024
    total = 0
    try:
        with open(dest_path, "wb") as out_file:
            while True:
                chunk = file.file.read(1024 * 1024)  # 1 MiB chunks
                if not chunk:
                    break
                total += len(chunk)
                if total > max_size:
                    out_file.close()
                    if os.path.exists(dest_path):
                        os.remove(dest_path)
                    raise HTTPException(status_code=400, detail="File size exceeds 5 MiB limit")
                out_file.write(chunk)
    finally:
        file.file.close()

    # Server-side MIME detection using python-magic (fail-closed)
    try:
        import magic
        mime_type = magic.from_file(dest_path, mime=True)
    except Exception:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(status_code=400, detail="Unable to verify file MIME type")

    # Closed whitelist check
    if mime_type not in ALLOWED_MIME:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(status_code=400, detail="Disallowed MIME type")

    # Extension-to-MIME consistency check
    if mime_type not in EXTENSION_TO_MIME.get(ext, set()):
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(status_code=400, detail="MIME type does not match file extension")

    response = {
        "filename": file.filename,
        "storage_key": filename,
        "size": total,
        "mime": mime_type,
        "private": private,
    }
    if not private:
        response["url"] = f"/uploads/{filename}"
    else:
        response["url"] = f"/api/uploads/private/{filename}"
    return response


@router.get("/private/{filename}")
async def download_private_file(
    filename: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Download a private media file with strict authentication and database record authorization.
    Protects against path traversal, symlink attacks, and cross-agent document snooping.
    """
    if not SAFE_FILENAME_PATTERN.match(filename) or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename format")

    public_dir, private_dir = ensure_upload_dirs()
    canonical_private_dir = os.path.realpath(private_dir)

    target_path = os.path.join(private_dir, filename)
    canonical_target_path = os.path.realpath(target_path)

    # Ensure target path does not escape private upload directory
    if not (canonical_target_path == canonical_private_dir or canonical_target_path.startswith(canonical_private_dir + os.sep)):
        raise HTTPException(status_code=400, detail="Access denied: Invalid file path")

    # Symlink protection
    if os.path.islink(target_path):
        raise HTTPException(status_code=400, detail="Access denied: Symlinks not permitted")

    if not os.path.exists(canonical_target_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Database-backed authorization check: Admin has global access; Agents require verified record assignment
    is_admin = getattr(current_user, "role", "") == "Admin"
    if not is_admin:
        # 1. Check PropertyDocument records
        doc = db.query(PropertyDocument).filter(PropertyDocument.name == filename).first()
        if doc:
            if doc.entity_type == "Property":
                prop = db.query(Property).filter(Property.id == doc.entity_id).first()
                if prop and prop.assigned_agent_id and prop.assigned_agent_id != current_user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: Private property document is assigned to another advisor",
                    )
            elif doc.entity_type == "Seller":
                seller = db.query(Seller).filter(Seller.id == doc.entity_id).first()
                if seller and seller.assigned_agent_id and seller.assigned_agent_id != current_user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: Private seller document is assigned to another advisor",
                    )

        # 2. Check SubmissionMedia records
        media = db.query(SubmissionMedia).filter(SubmissionMedia.storage_key == filename).first()
        if media:
            sub = media.submission
            assigned_id = getattr(sub, "assigned_agent_id", None)
            creator_id = getattr(sub, "created_by_user_id", None)
            uploader_id = media.uploaded_by
            allowed_ids = {uid for uid in (assigned_id, creator_id, uploader_id) if uid}
            if allowed_ids and current_user.id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Submission media is assigned to another advisor",
                )

        # 3. Unattached / Staged private file check
        if not doc and not media:
            if "__" in filename:
                owner_id = filename.split("__", 1)[0]
                if owner_id != current_user.id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: Cannot access another agent's private documents",
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Unattached private document",
                )

    return FileResponse(canonical_target_path, filename=filename)


media_router = APIRouter(tags=["Media Delivery"])


@media_router.get("/uploads/{filename}")
@media_router.get("/api/uploads/public/{filename}")
async def serve_upload_file(
    filename: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    State-aware media serving endpoint:
    - Protects against directory traversal and symlinks.
    - If associated with a published Property (PropertyImage / PropertyPublication.is_published=True),
      serves publicly with cache headers.
    - If associated with an unpublished Property, requires authentication (Admin or assigned Agent).
    - If associated with a Submission (SubmissionMedia), requires authentication (Admin, assigned Agent, or creator Telecaller).
    - If unattached, requires an authenticated user.
    """
    if not SAFE_FILENAME_PATTERN.match(filename) or ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename format")

    public_dir, _ = ensure_upload_dirs()
    canonical_public_dir = os.path.realpath(public_dir)

    target_path = os.path.join(public_dir, filename)
    canonical_target_path = os.path.realpath(target_path)

    if not (canonical_target_path == canonical_public_dir or canonical_target_path.startswith(canonical_public_dir + os.sep)):
        raise HTTPException(status_code=400, detail="Access denied: Invalid file path")

    if os.path.islink(target_path):
        raise HTTPException(status_code=400, detail="Access denied: Symlinks not permitted")

    if not os.path.exists(canonical_target_path):
        raise HTTPException(status_code=404, detail="File not found")

    # 1. Check if associated with a Property via PropertyImage
    img = db.query(PropertyImage).filter(
        (PropertyImage.url == f"/uploads/{filename}")
        | (PropertyImage.url == filename)
        | (PropertyImage.url.endswith(f"/{filename}"))
    ).first()

    if img:
        prop = db.query(Property).filter(Property.id == img.property_id).first()
        pub = db.query(PropertyPublication).filter(
            PropertyPublication.property_id == img.property_id,
            PropertyPublication.is_published == True,
        ).first()

        if pub and pub.is_published:
            return FileResponse(
                canonical_target_path,
                filename=filename,
                headers={"Cache-Control": "public, max-age=86400, immutable"},
            )

        # Unpublished: requires authentication
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to view unpublished property media",
            )
        if current_user.role == "Admin" or (prop and prop.assigned_agent_id == current_user.id):
            return FileResponse(
                canonical_target_path,
                filename=filename,
                headers={"Cache-Control": "private, no-cache, no-store, must-revalidate"},
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Unpublished media is assigned to another advisor",
        )

    # 2. Check if associated with a SubmissionMedia
    media = db.query(SubmissionMedia).filter(
        (SubmissionMedia.storage_key == filename) | (SubmissionMedia.thumbnail_key == filename)
    ).first()

    if media:
        # Check if submission was converted to a property that is published
        pub_img = (
            db.query(PropertyImage)
            .join(PropertyPublication, PropertyPublication.property_id == PropertyImage.property_id)
            .filter(
                (PropertyImage.url.endswith(filename))
                & (PropertyPublication.is_published == True)
            )
            .first()
        )
        if pub_img:
            return FileResponse(
                canonical_target_path,
                filename=filename,
                headers={"Cache-Control": "public, max-age=86400, immutable"},
            )

        # Submissions media not yet published: require authentication
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to view submission media",
            )
        sub = db.query(PropertySubmission).filter(PropertySubmission.id == media.submission_id).first()
        if current_user.role == "Admin":
            return FileResponse(
                canonical_target_path,
                filename=filename,
                headers={"Cache-Control": "private, no-cache, no-store, must-revalidate"},
            )
        if sub:
            assigned_id = getattr(sub, "assigned_agent_id", None)
            creator_id = getattr(sub, "created_by_user_id", None)
            uploader_id = media.uploaded_by
            if current_user.id in {uid for uid in (assigned_id, creator_id, uploader_id) if uid}:
                return FileResponse(
                    canonical_target_path,
                    filename=filename,
                    headers={"Cache-Control": "private, no-cache, no-store, must-revalidate"},
                )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Submission media is not accessible",
        )

    # 3. Unattached file in public upload dir: require authenticated user
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required to access unattached media",
        )

    return FileResponse(
        canonical_target_path,
        filename=filename,
        headers={"Cache-Control": "private, no-cache, no-store, must-revalidate"},
    )
