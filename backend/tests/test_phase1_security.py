import io
import os
import pytest
from datetime import date
from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings
from app.core.security import validate_admin_password_strength
from app.models.models import (
    Deal,
    FollowUp,
    Lead,
    Property,
    PropertyImage,
    PropertyPublication,
    PropertySubmission,
    Seller,
    SiteVisit,
    SubmissionMedia,
)
from app.services.media_storage import MediaStorageService


def test_sec03_production_secret_key_rejection():
    # Production with placeholder secret must fail validation
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="secret-key-2026-production-replace-me-asap-1234567890",
            DATABASE_URL="postgresql://user:pass@localhost:5432/db",
        )

    # Production with short secret (<32 chars) must fail validation
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="too-short-secret",
            DATABASE_URL="postgresql://user:pass@localhost:5432/db",
        )

    # Production with strong 32+ char secret succeeds
    valid_settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="a" * 32,
        DATABASE_URL="postgresql://user:pass@localhost:5432/db",
    )
    assert valid_settings.SECRET_KEY == "a" * 32


def test_sec01_admin_bootstrap_password_strength():
    # Rejects < 12 characters
    with pytest.raises(ValueError, match="at least 12 characters"):
        validate_admin_password_strength("WeakPass1!")

    # Rejects missing uppercase
    with pytest.raises(ValueError, match="uppercase"):
        validate_admin_password_strength("weakpassword123!")

    # Rejects missing lowercase
    with pytest.raises(ValueError, match="lowercase"):
        validate_admin_password_strength("WEAKPASSWORD123!")

    # Rejects missing numbers
    with pytest.raises(ValueError, match="number"):
        validate_admin_password_strength("WeakPasswordWithoutDigits!")

    # Accepts strong password
    assert validate_admin_password_strength("StrongAdminPass2026!") is True


def test_sec02_media_magic_bytes_rejection():
    service = MediaStorageService()
    # Fake executable disguised as jpg
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 200
    upload = UploadFile(filename="malicious.jpg", file=io.BytesIO(fake_exe))
    with pytest.raises(HTTPException) as exc_info:
        service.save_file(upload)
    assert exc_info.value.status_code == 400
    assert "Disallowed file content type" in exc_info.value.detail or "rejected" in exc_info.value.detail


def test_sec02_exif_metadata_stripping():
    service = MediaStorageService()
    # Create an image in memory with dummy EXIF data
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    raw_buffer = io.BytesIO()
    # Save as JPEG
    img.save(raw_buffer, format="JPEG")
    raw_bytes = raw_buffer.getvalue()

    cleaned_bytes = service.strip_image_exif(raw_bytes, "image/jpeg")
    cleaned_img = Image.open(io.BytesIO(cleaned_bytes))
    exif = cleaned_img.getexif()
    assert len(exif) == 0


def test_sec02_public_submission_limits(client):
    # Test submission over 10 files
    files = [("files", (f"file_{i}.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 100, "image/jpeg")) for i in range(11)]
    data = {
        "seller_name": "Test Seller",
        "mobile": "+91 98470 12345",
        "property_type": "Land",
        "location": "Wayanad",
        "description": "Test submission with 11 files",
        "expected_price": "5000000",
    }
    res = client.post("/api/public/property-submissions", data=data, files=files)
    assert res.status_code == 400
    assert "Maximum 10 media files allowed" in res.json()["detail"]


def test_sec02_duplicate_submission_detection(client):
    # First valid submission
    data = {
        "seller_name": "Duplicate Tester",
        "mobile": "+91 98470 99999",
        "property_type": "Villa",
        "location": "Meppadi",
        "description": "Beautiful coffee estate villa",
        "expected_price": "7500000",
    }
    res1 = client.post("/api/public/property-submissions", data=data)
    assert res1.status_code in (200, 201)

    # Second immediate submission with same phone, location, and price
    res2 = client.post("/api/public/property-submissions", data=data)
    assert res2.status_code == 400
    assert "recently received" in res2.json()["detail"] or "Duplicate submission" in res2.json()["detail"]


def test_sec08_state_aware_media_delivery(client, db_session, admin_headers, agent_headers, agent2_headers):
    from app.core.config import settings

    # Write a test image file into public upload directory
    test_filename = "test_state_aware_image.jpg"
    test_file_path = os.path.join(settings.PUBLIC_UPLOAD_DIR, test_filename)
    with open(test_file_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00")

    # 1. Unattached file requires authentication
    res_unauth = client.get(f"/uploads/{test_filename}")
    assert res_unauth.status_code == 401

    res_auth = client.get(f"/uploads/{test_filename}", headers=agent_headers)
    assert res_auth.status_code == 200

    # 2. Attach image to an unpublished property assigned to test-agent-1
    prop = Property(
        id="prop-sec08-test",
        code="TAK998",
        title="Sec08 Unpublished Property",
        type="Land",
        category="Commercial",
        district="Wayanad",
        panchayath="Kalpetta",
        area_value=10.0,
        area_unit="Cents",
        expected_price=1000000,
        status="Available",
        assigned_agent_id="test-agent-1",
    )
    db_session.add(prop)
    db_session.flush()

    prop_img = PropertyImage(
        id="img-sec08-test",
        property_id=prop.id,
        url=f"/uploads/{test_filename}",
        is_primary=True,
    )
    db_session.add(prop_img)

    pub = PropertyPublication(
        property_id=prop.id,
        is_published=False,
    )
    db_session.add(pub)
    db_session.commit()

    # Unauthenticated request to unpublished property image returns 401
    res_unauth_unpublished = client.get(f"/uploads/{test_filename}")
    assert res_unauth_unpublished.status_code == 401

    # Agent 2 (different agent) gets 403 Forbidden
    res_agent2 = client.get(f"/uploads/{test_filename}", headers=agent2_headers)
    assert res_agent2.status_code == 403
    assert "assigned to another advisor" in res_agent2.json()["detail"]

    # Agent 1 (assigned agent) gets 200 OK
    res_agent1 = client.get(f"/uploads/{test_filename}", headers=agent_headers)
    assert res_agent1.status_code == 200

    # Admin gets 200 OK
    res_admin = client.get(f"/uploads/{test_filename}", headers=admin_headers)
    assert res_admin.status_code == 200

    # 3. Publish the property: now it must be publicly accessible without authentication
    pub.is_published = True
    db_session.commit()

    res_public = client.get(f"/uploads/{test_filename}")
    assert res_public.status_code == 200
    assert "public" in res_public.headers.get("Cache-Control", "")

    # 4. Path traversal attempt is rejected
    res_traversal = client.get("/uploads/..%2Fprivate%2Fsecret.pdf")
    assert res_traversal.status_code in (400, 404)


def test_sec04_07_record_level_authorization(client, db_session, admin_headers, agent_headers, agent2_headers, telecaller_headers):
    # 1. Lead isolation: Agent 1 creates a lead
    create_res = client.post(
        "/api/leads",
        json={
            "name": "Confidential Buyer",
            "phone": "+91 99999 55555",
            "lead_source": "Website",
            "preferred_district": "Wayanad",
            "min_budget": 5000000,
            "max_budget": 10000000,
            "property_type": "Land",
            "property_category": "Commercial",
            "requirement_description": "Prime roadside land",
        },
        headers=agent_headers,
    )
    assert create_res.status_code == 201
    lead_id = create_res.json()["id"]

    # Agent 2 cannot access Lead created by Agent 1
    res_agent2_get = client.get(f"/api/leads/{lead_id}", headers=agent2_headers)
    assert res_agent2_get.status_code == 403

    # Agent 2 cannot update Lead created by Agent 1
    res_agent2_put = client.put(
        f"/api/leads/{lead_id}",
        json={"notes": "Snooped notes"},
        headers=agent2_headers,
    )
    assert res_agent2_put.status_code == 403

    # Agent 1 cannot reassign assigned_agent_id
    res_agent1_reassign = client.put(
        f"/api/leads/{lead_id}",
        json={"assigned_agent_id": "test-agent-2"},
        headers=agent_headers,
    )
    assert res_agent1_reassign.status_code == 403
    assert "Only administrators can assign or reassign" in res_agent1_reassign.json()["detail"]

    # Admin CAN reassign assigned_agent_id
    res_admin_reassign = client.put(
        f"/api/leads/{lead_id}",
        json={"assigned_agent_id": "test-agent-2"},
        headers=admin_headers,
    )
    assert res_admin_reassign.status_code == 200
    assert res_admin_reassign.json()["assigned_agent_id"] == "test-agent-2"

    # Now Agent 2 has access because it was assigned to them
    res_agent2_get_after = client.get(f"/api/leads/{lead_id}", headers=agent2_headers)
    assert res_agent2_get_after.status_code == 200

    # 2. Property isolation: create property assigned to Agent 1
    prop = Property(
        id="prop-iso-1",
        code="TAK997",
        title="Agent 1 Exclusive Villa",
        type="House",
        category="Residential",
        district="Wayanad",
        panchayath="Vythiri",
        area_value=25.0,
        area_unit="Cents",
        expected_price=8000000,
        status="Available",
        assigned_agent_id="test-agent-1",
    )
    db_session.add(prop)
    db_session.commit()

    # Agent 2 cannot view property details
    res_p_get = client.get(f"/api/properties/{prop.id}", headers=agent2_headers)
    assert res_p_get.status_code == 403

    # Agent 2 cannot view property leads
    res_p_leads = client.get(f"/api/properties/{prop.id}/leads", headers=agent2_headers)
    assert res_p_leads.status_code == 403

    # Agent 1 cannot reassign property agent
    res_p_reassign = client.put(
        f"/api/properties/{prop.id}",
        json={"assigned_agent_id": "test-agent-2"},
        headers=agent_headers,
    )
    assert res_p_reassign.status_code == 403

    # 3. Reports sales isolation:
    seller = Seller(
        id="seller-iso-1",
        code="SLR999",
        name="Iso Seller",
        phone="+91 99999 88888",
        relationship_with_property="Owner",
        assigned_agent_id="test-agent-1",
    )
    db_session.add(seller)
    db_session.commit()

    deal1 = Deal(
        id="deal-iso-1",
        code="DL1001",
        property_id=prop.id,
        lead_id=lead_id,
        seller_id=seller.id,
        assigned_agent_id="test-agent-1",
        agreed_price=5000000,
        commission_amount=100000,
        deal_type="Sale",
        deal_date=date(2026, 11, 25),
        status="Closed",
    )
    deal2 = Deal(
        id="deal-iso-2",
        code="DL1002",
        property_id=prop.id,
        lead_id=lead_id,
        seller_id=seller.id,
        assigned_agent_id="test-agent-2",
        agreed_price=8000000,
        commission_amount=160000,
        deal_type="Sale",
        deal_date=date(2026, 11, 25),
        status="Closed",
    )
    db_session.add(deal1)
    db_session.add(deal2)
    db_session.commit()

    # Agent 1 only sees deal1
    sales_agent1 = client.get("/api/reports/sales", headers=agent_headers).json()
    assert sales_agent1["closed_deals_count"] == 1
    assert sales_agent1["total_sales_volume"] == 5000000

    # Admin sees both deals
    sales_admin = client.get("/api/reports/sales", headers=admin_headers).json()
    assert sales_admin["closed_deals_count"] >= 2

    # 4. Telecaller submission isolation:
    sub1 = PropertySubmission(
        id="sub-tele-1",
        reference="SUB-2026-0001",
        seller_name="Telecaller Seller 1",
        phone="+91 98470 11111",
        type="Land",
        location="Mananthavady",
        created_by_user_id="test-telecaller-1",
        status="Pending Review",
    )
    sub2 = PropertySubmission(
        id="sub-tele-2",
        reference="SUB-2026-0002",
        seller_name="Other Seller",
        phone="+91 98470 22222",
        type="Villa",
        location="Sulthan Bathery",
        created_by_user_id="other-telecaller-user",
        status="Pending Review",
    )
    db_session.add(sub1)
    db_session.add(sub2)
    db_session.commit()

    # Telecaller 1 only lists sub1
    tele_subs = client.get("/api/admin/property-submissions/", headers=telecaller_headers).json()
    tele_ids = [s["id"] for s in tele_subs]
    assert "sub-tele-1" in tele_ids
    assert "sub-tele-2" not in tele_ids
