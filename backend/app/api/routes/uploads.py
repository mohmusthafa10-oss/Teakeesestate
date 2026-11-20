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
def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Disallowed file format")

    filename = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(settings.UPLOAD_DIR, filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "url": f"/uploads/{filename}",
        "filename": file.filename,
        "size": os.path.getsize(dest_path),
    }

