"""
Orphan Media Cleanup Service

Safely scans managed storage directories (PUBLIC_UPLOAD_DIR and PRIVATE_UPLOAD_DIR),
reconciles physical files on disk against active database records, and safely removes
unreferenced files that exceed the minimum age threshold.

Safety guarantees:
1. Database failure is fail-closed: If the database cannot be queried, zero files are unlinked.
2. Grace period / In-flight protection: Files younger than min_age_hours (default 24h) are preserved.
3. Path traversal & symlink prevention: Only canonical realpaths strictly within managed roots are inspected.
4. Dry-run mode: Enabled by default; no files deleted unless dry_run is explicitly False.
5. Idempotent: Safe to execute repeatedly on scheduled cron or systemd timer.
"""

import argparse
import logging
import os
import sys
import time
from typing import Dict, List, Set, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import SessionLocal
from app.models.models import PropertyDocument, PropertyImage, SubmissionMedia

logger = logging.getLogger(__name__)


def get_all_referenced_storage_keys(db: Session) -> Set[str]:
    """
    Query all database models that hold media or document storage keys/filenames.
    Fails closed: Any database exception will bubble up and abort cleanup.
    """
    referenced = set()

    # 1. Property Images (url field may be "/uploads/{key}" or raw "{key}")
    for (url,) in db.query(PropertyImage.url).all():
        if url:
            referenced.add(os.path.basename(url.strip()))

    # 2. Property Documents (name field holds the filename / storage key)
    for (name,) in db.query(PropertyDocument.name).all():
        if name:
            referenced.add(os.path.basename(name.strip()))

    # 3. Submission Media (storage_key and thumbnail_key)
    for storage_key, thumbnail_key in db.query(SubmissionMedia.storage_key, SubmissionMedia.thumbnail_key).all():
        if storage_key:
            referenced.add(os.path.basename(storage_key.strip()))
        if thumbnail_key:
            referenced.add(os.path.basename(thumbnail_key.strip()))

    return referenced


def find_and_clean_orphaned_files(
    db: Session,
    dry_run: bool = True,
    min_age_hours: int = 24,
) -> Dict[str, object]:
    """
    Reconciles disk storage against database records and safely cleans unreferenced files.
    """
    # Fail-closed database query
    try:
        referenced_keys = get_all_referenced_storage_keys(db)
    except Exception as exc:
        logger.error("Failed to query database for referenced media: %s", exc)
        raise RuntimeError(f"Database query failed during orphan cleanup; aborting: {exc}") from exc

    cutoff_time = time.time() - (min_age_hours * 3600)
    scanned_count = 0
    protected_recent_count = 0
    orphans_found: List[str] = []
    deleted_files: List[str] = []
    errors: List[str] = []

    managed_dirs = [
        os.path.realpath(os.path.abspath(settings.PUBLIC_UPLOAD_DIR)),
        os.path.realpath(os.path.abspath(settings.PRIVATE_UPLOAD_DIR)),
    ]

    for root_dir in managed_dirs:
        if not os.path.exists(root_dir):
            continue

        for entry in os.listdir(root_dir):
            file_path = os.path.join(root_dir, entry)

            # Security: Skip symlinks to prevent target manipulation
            if os.path.islink(file_path):
                logger.warning("Skipping symlink during cleanup: %s", file_path)
                continue

            # Security: Verify path cannot escape managed root directory
            canonical_path = os.path.realpath(file_path)
            if not canonical_path.startswith(root_dir + os.sep):
                logger.warning("Skipping file outside managed storage root: %s", file_path)
                continue

            if not os.path.isfile(canonical_path):
                continue

            scanned_count += 1
            filename = os.path.basename(canonical_path)

            # Check if referenced in database
            if filename in referenced_keys:
                continue

            # Check age threshold (protect in-flight uploads)
            try:
                mtime = os.path.getmtime(canonical_path)
            except OSError as err:
                errors.append(f"Failed to read mtime for {filename}: {err}")
                continue

            if mtime > cutoff_time:
                protected_recent_count += 1
                continue

            # Identified as an orphan past the age threshold
            orphans_found.append(canonical_path)

            if not dry_run:
                try:
                    os.remove(canonical_path)
                    deleted_files.append(canonical_path)
                    logger.info("Deleted orphan file: %s", canonical_path)
                except OSError as err:
                    errors.append(f"Failed to delete {canonical_path}: {err}")

    return {
        "dry_run": dry_run,
        "scanned_count": scanned_count,
        "referenced_count": len(referenced_keys),
        "protected_recent_count": protected_recent_count,
        "orphans_found_count": len(orphans_found),
        "orphans_found": orphans_found,
        "deleted_count": len(deleted_files),
        "deleted_files": deleted_files,
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description="Teakees Estate Orphan Media Cleanup")
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete orphaned files. If omitted, runs in safe dry-run mode.",
    )
    parser.add_argument(
        "--min-age-hours",
        type=int,
        default=24,
        help="Minimum age in hours for a file to be eligible for cleanup (default: 24).",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = find_and_clean_orphaned_files(
            db=db,
            dry_run=not args.execute,
            min_age_hours=args.min_age_hours,
        )
        print(f"Cleanup Run Complete (dry_run={result['dry_run']}):")
        print(f"  Scanned: {result['scanned_count']} files")
        print(f"  Protected (< {args.min_age_hours}h old): {result['protected_recent_count']} files")
        print(f"  Orphans found: {result['orphans_found_count']} files")
        print(f"  Deleted: {result['deleted_count']} files")
        if result['errors']:
            print(f"  Errors: {result['errors']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
