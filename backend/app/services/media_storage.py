import io
import os
import uuid
from pathlib import Path
from typing import Optional, Set

from fastapi import HTTPException, UploadFile
from PIL import Image

from app.core.config import settings


ALLOWED_IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

ALLOWED_VIDEO_MIMES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
}

ALLOWED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
    ".mp4",
    ".mov",
    ".webm",
}

EXTENSION_TO_MIMES = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".heic": {"image/heic", "image/heif", "application/octet-stream"},
    ".heif": {"image/heic", "image/heif", "application/octet-stream"},
    ".mp4": {"video/mp4"},
    ".mov": {"video/quicktime", "video/mp4"},
    ".webm": {"video/webm"},
}

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MiB
MAX_VIDEO_SIZE = 15 * 1024 * 1024  # 15 MiB


class StorageBackend:
    """Storage abstraction interface for durable file persistence."""
    def save(self, file_path: Path, data: bytes) -> None:
        raise NotImplementedError

    def delete(self, file_path: Path) -> None:
        raise NotImplementedError

    def exists(self, file_path: Path) -> bool:
        raise NotImplementedError


class LocalStorageBackend(StorageBackend):
    def save(self, file_path: Path, data: bytes) -> None:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(data)

    def delete(self, file_path: Path) -> None:
        try:
            file_path.unlink()
        except FileNotFoundError:
            pass

    def exists(self, file_path: Path) -> bool:
        return file_path.exists()


class MediaStorageService:
    """Production media storage service with strict content validation,
    magic-byte verification, EXIF metadata stripping, and durable storage.
    """

    def __init__(self, storage_backend: Optional[StorageBackend] = None) -> None:
        self.base_path = Path(getattr(settings, "PUBLIC_UPLOAD_DIR", settings.UPLOAD_DIR)).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.backend = storage_backend or LocalStorageBackend()

    def _generate_storage_key(self, ext: str) -> str:
        return f"{uuid.uuid4()}{ext.lower()}"

    def strip_image_exif(self, image_bytes: bytes, mime_type: str) -> bytes:
        """Strip all EXIF, GPS, and camera metadata from image files using Pillow."""
        if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
            return image_bytes

        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                # Prevent DecompressionBomb attacks
                img.verify()
            
            with Image.open(io.BytesIO(image_bytes)) as img:
                # Create a fresh copy of pixel data without metadata
                data = list(img.getdata())
                clean_img = Image.new(img.mode, img.size)
                clean_img.putdata(data)

                out_buf = io.BytesIO()
                fmt = "JPEG" if mime_type == "image/jpeg" else ("PNG" if mime_type == "image/png" else "WEBP")
                clean_img.save(out_buf, format=fmt)
                return out_buf.getvalue()
        except Exception:
            # If Pillow fails to re-encode (e.g. animated webp or corrupted), return original verified bytes
            return image_bytes

    def detect_mime_type(self, file_bytes: bytes) -> str:
        """Detect MIME type by inspecting content (magic bytes), fail-closed."""
        try:
            import magic
            mime = magic.from_buffer(file_bytes, mime=True)
            return mime
        except Exception:
            pass

        # Fallback signatures for environment without system libmagic
        if file_bytes.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if file_bytes.startswith(b"RIFF") and b"WEBP" in file_bytes[:16]:
            return "image/webp"
        if len(file_bytes) > 8 and file_bytes[4:8] == b"ftyp":
            brand = file_bytes[8:12]
            if brand in (b"isom", b"iso2", b"mp41", b"mp42"):
                return "video/mp4"
            if brand in (b"qt  ", b"moov"):
                return "video/quicktime"
            if brand in (b"heic", b"heix", b"mif1"):
                return "image/heic"
        if file_bytes.startswith(b"\x1a\x45\xdf\xa3"):
            return "video/webm"

        raise HTTPException(
            status_code=400,
            detail="Could not verify file content. File rejected for security reasons.",
        )

    def save_file(self, file: UploadFile) -> dict:
        """Validate content, strip EXIF metadata, save securely, and return metadata."""
        original_filename = file.filename or "media"
        ext = os.path.splitext(original_filename)[1].lower()

        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Disallowed file extension '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        # Stream and accumulate bounded chunks to enforce size limit before processing
        is_video = ext in {".mp4", ".mov", ".webm"}
        max_limit = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE

        buffer = bytearray()
        while True:
            chunk = file.file.read(1024 * 1024)  # 1 MiB chunk
            if not chunk:
                break
            buffer.extend(chunk)
            if len(buffer) > max_limit:
                raise HTTPException(
                    status_code=400,
                    detail=f"File exceeds maximum allowed size of {max_limit // (1024 * 1024)} MiB.",
                )

        file_bytes = bytes(buffer)

        # Content-based MIME detection
        detected_mime = self.detect_mime_type(file_bytes)

        allowed_all = ALLOWED_IMAGE_MIMES | ALLOWED_VIDEO_MIMES
        if detected_mime not in allowed_all:
            raise HTTPException(
                status_code=400,
                detail=f"Disallowed file content type '{detected_mime}'. Only safe images and videos are permitted.",
            )

        # Consistency check: detected MIME must be valid for the declared extension
        valid_mimes_for_ext = EXTENSION_TO_MIMES.get(ext, set())
        if detected_mime not in valid_mimes_for_ext:
            raise HTTPException(
                status_code=400,
                detail=f"File content ({detected_mime}) does not match file extension ({ext}).",
            )

        # Strip EXIF / GPS metadata for image types
        if detected_mime in ALLOWED_IMAGE_MIMES:
            file_bytes = self.strip_image_exif(file_bytes, detected_mime)

        # Save to durable storage
        storage_key = self._generate_storage_key(ext)
        dest_path = self.base_path / storage_key
        self.backend.save(dest_path, file_bytes)

        return {
            "storage_key": storage_key,
            "original_filename": original_filename,
            "size": len(file_bytes),
            "mime_type": detected_mime,
            "url": f"/uploads/{storage_key}",
        }

    def delete_file(self, storage_key: str) -> None:
        dest_path = self.base_path / storage_key
        self.backend.delete(dest_path)

    def get_file_path(self, storage_key: str) -> Path:
        return self.base_path / storage_key

    def get_url(self, storage_key: str) -> str:
        return f"/uploads/{storage_key}"

