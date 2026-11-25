import os
import time
import pytest
from app.core.config import settings
from app.models.models import Property, PropertyDocument, PropertyImage, SubmissionMedia, PropertySubmission
from app.services.cleanup import find_and_clean_orphaned_files


def test_cleanup_dry_run_identifies_orphans_without_deleting(db_session):
    # Create an old orphan file in public upload dir
    pub_orphan = os.path.join(settings.PUBLIC_UPLOAD_DIR, "orphan_dry_run.png")
    with open(pub_orphan, "wb") as f:
        f.write(b"orphan-data")

    # Set mtime to 48 hours ago
    past_time = time.time() - (48 * 3600)
    os.utime(pub_orphan, (past_time, past_time))

    res = find_and_clean_orphaned_files(db=db_session, dry_run=True, min_age_hours=24)
    assert res["dry_run"] is True
    assert res["orphans_found_count"] >= 1
    assert pub_orphan in res["orphans_found"]
    assert res["deleted_count"] == 0

    # Verify file still exists on disk because dry_run was True
    assert os.path.exists(pub_orphan)

    # Cleanup test file
    if os.path.exists(pub_orphan):
        os.remove(pub_orphan)


def test_cleanup_preserves_referenced_files(db_session):
    # Create a file on disk
    ref_file = os.path.join(settings.PUBLIC_UPLOAD_DIR, "referenced_doc.png")
    with open(ref_file, "wb") as f:
        f.write(b"referenced-media")

    # Set mtime to 48 hours ago
    past_time = time.time() - (48 * 3600)
    os.utime(ref_file, (past_time, past_time))

    # Add DB reference in PropertyDocument
    doc = PropertyDocument(
        id="test-doc-cleanup-1",
        entity_type="Property",
        entity_id="prop-test-1",
        name="referenced_doc.png",
    )
    db_session.add(doc)
    db_session.commit()

    try:
        res = find_and_clean_orphaned_files(db=db_session, dry_run=False, min_age_hours=24)
        # The referenced file must NOT be in orphans or deleted
        assert ref_file not in res["deleted_files"]
        assert os.path.exists(ref_file)
    finally:
        db_session.delete(doc)
        db_session.commit()
        if os.path.exists(ref_file):
            os.remove(ref_file)


def test_cleanup_preserves_recent_uploads_under_min_age(db_session):
    # Create an unreferenced file that was created recently (1 hour ago)
    recent_file = os.path.join(settings.PRIVATE_UPLOAD_DIR, "recent_in_flight.png")
    with open(recent_file, "wb") as f:
        f.write(b"recent-data")

    # Set mtime to 1 hour ago (less than 24h min_age)
    one_hour_ago = time.time() - 3600
    os.utime(recent_file, (one_hour_ago, one_hour_ago))

    try:
        res = find_and_clean_orphaned_files(db=db_session, dry_run=False, min_age_hours=24)
        assert res["protected_recent_count"] >= 1
        assert recent_file not in res["deleted_files"]
        assert os.path.exists(recent_file)
    finally:
        if os.path.exists(recent_file):
            os.remove(recent_file)


def test_cleanup_deletes_unreferenced_old_orphans_in_execute_mode(db_session):
    # Create an old unreferenced file in private directory
    old_orphan = os.path.join(settings.PRIVATE_UPLOAD_DIR, "old_orphan_to_delete.png")
    with open(old_orphan, "wb") as f:
        f.write(b"stale-data")

    # Set mtime to 72 hours ago
    stale_time = time.time() - (72 * 3600)
    os.utime(old_orphan, (stale_time, stale_time))

    res = find_and_clean_orphaned_files(db=db_session, dry_run=False, min_age_hours=24)
    assert old_orphan in res["deleted_files"]
    assert not os.path.exists(old_orphan)


def test_cleanup_aborts_on_database_failure_deleting_zero_files(db_session, monkeypatch):
    # Create an old orphan file
    test_orphan = os.path.join(settings.PUBLIC_UPLOAD_DIR, "db_fail_orphan.png")
    with open(test_orphan, "wb") as f:
        f.write(b"db-fail-test")

    past_time = time.time() - (48 * 3600)
    os.utime(test_orphan, (past_time, past_time))

    # Mock database query to simulate a DB outage / exception
    def broken_query(*args, **kwargs):
        raise RuntimeError("Database connection lost during cleanup transaction")

    monkeypatch.setattr(db_session, "query", broken_query)

    try:
        with pytest.raises(RuntimeError, match="Database query failed during orphan cleanup"):
            find_and_clean_orphaned_files(db=db_session, dry_run=False, min_age_hours=24)

        # Fail-closed: The file MUST NOT be deleted when database query fails
        assert os.path.exists(test_orphan)
    finally:
        if os.path.exists(test_orphan):
            os.remove(test_orphan)
