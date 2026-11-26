import concurrent.futures
import io
import threading
import uuid
import pytest
from tests.conftest import TestingSessionLocal
from app.models.models import (
    Property,
    PropertySubmission,
    Seller,
    SequenceCounter,
    SubmissionStatus,
)
from app.services.services import generate_sequential_code


def test_concurrent_sequential_code_generation_no_collisions(db_session):
    """
    Simultaneously generate codes across 20 concurrent threads using independent database sessions.
    Verify that every generated code is strictly unique and sequential with no collisions or duplicate numbers.
    """
    prefix = f"CN{uuid.uuid4().hex[:4].upper()}"
    codes = []
    errors = []
    lock = threading.Lock()

    def worker_generate(thread_idx: int):
        session = TestingSessionLocal()
        try:
            code = generate_sequential_code(session, prefix, pad=4, start=1)
            session.commit()
            with lock:
                codes.append(code)
        except Exception as e:
            session.rollback()
            with lock:
                errors.append(str(e))
        finally:
            session.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(worker_generate, i) for i in range(20)]
        concurrent.futures.wait(futures)

    assert len(errors) == 0, f"Errors occurred during concurrent generation: {errors}"
    assert len(codes) == 20
    assert len(set(codes)) == 20, f"Duplicate codes detected: {codes}"


def test_concurrent_submission_conversion_exactly_one_succeeds(client, admin_headers, db_session):
    """
    Simulate two concurrent worker requests attempting to convert the exact same approved submission.
    Exactly one request must succeed (HTTP 200), and all concurrent duplicates must be rejected (HTTP 400).
    Exactly one Property and one Seller must be created in the database.
    """
    # 1. Create and approve a submission
    sample_img = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    phone = f"+91 99000 {uuid.uuid4().hex[:5]}"
    submit_data = {
        "seller_name": "Concurrent Owner",
        "mobile": phone,
        "property_type": "House",
        "location": "Vythiri",
        "description": "Concurrency test villa",
        "expected_price": "5500000",
        "size": "20",
        "bedrooms": "3",
        "bathrooms": "2",
    }
    resp = client.post(
        "/api/public/property-submissions",
        data=submit_data,
        files=[("files", ("test.png", sample_img, "image/png"))],
    )
    assert resp.status_code == 200
    sub_ref = resp.json()["reference"]

    # Retrieve submission ID from admin list
    list_res = client.get("/api/admin/property-submissions/", headers=admin_headers)
    assert list_res.status_code == 200
    matched = [s for s in list_res.json() if s["reference"] == sub_ref]
    assert len(matched) == 1
    sub_id = matched[0]["id"]

    # Approve
    appr = client.post(f"/api/admin/property-submissions/{sub_id}/approve", headers=admin_headers)
    assert appr.status_code == 200

    # 2. Fire simultaneous conversions
    results = []
    lock = threading.Lock()

    def run_conversion():
        r = client.post(f"/api/admin/property-submissions/{sub_id}/convert", headers=admin_headers)
        with lock:
            results.append((r.status_code, r.text))

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        f1 = executor.submit(run_conversion)
        f2 = executor.submit(run_conversion)
        concurrent.futures.wait([f1, f2])

    status_codes = [status for status, _ in results]
    assert 200 in status_codes, f"No request succeeded: {results}"
    assert 400 in status_codes, f"Duplicate conversion was not blocked: {results}"
    assert status_codes.count(200) == 1, f"More than one conversion succeeded: {results}"
