import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.api.deps import get_current_active_user
from app.core.config import settings
from app.models.models import User

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf", ".docx", ".doc"}

@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    # Determine whether this upload should be private. Only admin users may set private=True.
    private = False
    if getattr(current_user, "is_admin", False):
        # Admin can request private via query param (not implemented here for simplicity).
        # In future, parse a bool query param 'private' to set this.
        private = False

    upload_dir = settings.PRIVATE_UPLOAD_DIR if private else settings.PUBLIC_UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Disallowed file format")

    filename = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(upload_dir, filename)

    # Stream file to disk with size enforcement (5 MiB)
    max_size = 5 * 1024 * 1024
    total = 0
    try:
        with open(dest_path, "wb") as out_file:
            while True:
                chunk = file.file.read(1024 * 1024)  # 1 MiB chunks
                if not chunk:
                    break
                total += len(chunk)
                if total > max_size:
                    out_file.close()
                    os.remove(dest_path)
                    raise HTTPException(status_code=400, detail="File size exceeds 5 MiB limit")
                out_file.write(chunk)
    finally:
        # Ensure the uploaded file stream is closed.
        file.file.close()

    # MIME type detection (closed whitelist)
    try:
        import magic
        mime_type = magic.from_file(dest_path, mime=True)
    except Exception:
        # If magic is unavailable or detection fails, reject the upload.
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail="Unable to verify file MIME type")

    ALLOWED_MIME = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if mime_type not in ALLOWED_MIME:
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail="Disallowed MIME type")

    # Return appropriate response. Public files get a URL, private files do not expose a static URL.
    response = {
        "filename": file.filename,
        "size": total,
        "mime": mime_type,
        "private": private,
    }
    if not private:
        response["url"] = f"/uploads/{filename}"
    return response

