import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from app.core.config import settings


class MediaStorageService:
    """Simple storage abstraction for local disk files.

    The service respects the ``MEDIA_ROOT`` (or ``UPLOAD_DIR``) environment variable.
    It stores files with a random UUID filename to avoid collisions and retains the
    original filename only in metadata.
    """

    def __init__(self) -> None:
        # Use MEDIA_ROOT if defined, otherwise fall back to UPLOAD_DIR.
        self.base_path = Path(getattr(settings, "MEDIA_ROOT", settings.UPLOAD_DIR))
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _generate_storage_key(self, original_filename: str) -> str:
        ext = os.path.splitext(original_filename)[1].lower()
        return f"{uuid.uuid4()}{ext}"

    def save_file(self, file: UploadFile) -> dict:
        """Save an uploaded file and return metadata.

        Returns a dict containing ``storage_key``, ``original_filename``, ``size`` and ``url``.
        """
        storage_key = self._generate_storage_key(file.filename)
        dest_path = self.base_path / storage_key
        # Write file to disk in 1 MiB chunks
        with dest_path.open("wb") as buffer:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                buffer.write(chunk)
        size = dest_path.stat().st_size
        url = f"/uploads/{storage_key}"
        return {
            "storage_key": storage_key,
            "original_filename": file.filename,
            "size": size,
            "url": url,
        }

    def delete_file(self, storage_key: str) -> None:
        """Delete a stored file by its storage key (filename)."""
        try:
            (self.base_path / storage_key).unlink()
        except FileNotFoundError:
            pass

    def get_file_path(self, storage_key: str) -> Path:
        """Return the absolute Path for a given storage key."""
        return self.base_path / storage_key

    def get_url(self, storage_key: str) -> str:
        """Return the public URL for a stored file."""
        return f"/uploads/{storage_key}"

    def generate_thumbnail(self, storage_key: str) -> Optional[str]:
        """Placeholder for thumbnail generation – can be implemented later."""
        return None
