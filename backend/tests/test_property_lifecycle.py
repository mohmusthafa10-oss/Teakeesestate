import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.models import Property, PropertyPublication, PropertySubmission, SubmissionStatus, User


@pytest.fixture
def auth_headers(db_session: Session):
    admin = db_session.query(User).filter(User.email == "admin@testate.in").first()
    agent1 = db_session.query(User).filter(User.email == "agent1@testate.in").first()
    agent2 = db_session.query(User).filter(User.email == "agent2@testate.in").first()

    return {
        "admin": {"Authorization": f"Bearer {create_access_token(subject=admin.id, extra_claims={'role': admin.role, 'email': admin.email})}"},
        "agent1": {"Authorization": f"Bearer {create_access_token(subject=agent1.id, extra_claims={'role': agent1.role, 'email': agent1.email})}"},
        "agent2": {"Authorization": f"Bearer {create_access_token(subject=agent2.id, extra_claims={'role': agent2.role, 'email': agent2.email})}"},
        "admin_user": admin,
        "agent1_user": agent1,
        "agent2_user": agent2,
    }


def test_complete_property_lifecycle(client: TestClient, db_session: Session, auth_headers: dict):
    admin_hdr = auth_headers["admin"]
    agent1_hdr = auth_headers["agent1"]
    agent2_hdr = auth_headers["agent2"]
    agent1_id = auth_headers["agent1_user"].id

    # --------------------------------------------------------------------------
    # Step 1: Public user submits a property
    # --------------------------------------------------------------------------
    sample_img = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    submit_data = {
        "seller_name": "Test Seller George",
        "mobile": "+919876543210",
        "property_type": "House",
        "location": "Kalpetta",
        "description": "3 BHK Luxury Villa in Kalpetta with scenic coffee plantation views",
        "expected_price": "8500000",
        "size": "25",
        "bedrooms": "3",
        "bathrooms": "3",
        "notes": "Urgent sale required",
    }
    resp = client.post(
        "/api/public/property-submissions",
        data=submit_data,
        files=[("files", ("villa_exterior.png", sample_img, "image/png"))],
    )
    assert resp.status_code == 200, resp.text
    submit_res = resp.json()
    assert submit_res["reference"].startswith("SUB-")
    assert submit_res["status"] == SubmissionStatus.PENDING_REVIEW.value
    sub_ref = submit_res["reference"]

    # --------------------------------------------------------------------------
    # Step 2: Admin reviews submission list and details
    # --------------------------------------------------------------------------
    list_resp = client.get("/api/admin/property-submissions/", headers=admin_hdr)
    assert list_resp.status_code == 200
    submissions = list_resp.json()
    matched = [s for s in submissions if s["reference"] == sub_ref]
    assert len(matched) == 1
    sub_id = matched[0]["id"]

    detail_resp = client.get(f"/api/admin/property-submissions/{sub_id}", headers=admin_hdr)
    assert detail_resp.status_code == 200
    sub_detail = detail_resp.json()
    assert sub_detail["seller_name"] == "Test Seller George"
    assert len(sub_detail["media"]) == 1
    assert "villa_exterior.png" in sub_detail["media"][0]["original_filename"]

    # --------------------------------------------------------------------------
    # Step 3: Admin approves the submission
    # --------------------------------------------------------------------------
    # Agent cannot approve (no permission)
    agent_approve = client.post(f"/api/admin/property-submissions/{sub_id}/approve", headers=agent1_hdr)
    assert agent_approve.status_code == 403

    # Admin approves
    admin_approve = client.post(f"/api/admin/property-submissions/{sub_id}/approve", headers=admin_hdr)
    assert admin_approve.status_code == 200
    assert admin_approve.json()["detail"] == "Submission approved"

    # Verify status changed to APPROVED
    check_sub = client.get(f"/api/admin/property-submissions/{sub_id}", headers=admin_hdr).json()
    assert check_sub["status"] == SubmissionStatus.APPROVED.value

    # --------------------------------------------------------------------------
    # Step 4: Admin converts submission into Property
    # --------------------------------------------------------------------------
    conv_resp = client.post(f"/api/admin/property-submissions/{sub_id}/convert", headers=admin_hdr)
    assert conv_resp.status_code == 200
    conv_data = conv_resp.json()
    prop_id = conv_data["property_id"]
    prop_code = conv_data["property_code"]
    assert prop_code.startswith("TAK")

    # Duplicate conversion must fail with 400
    dup_conv = client.post(f"/api/admin/property-submissions/{sub_id}/convert", headers=admin_hdr)
    assert dup_conv.status_code == 400
    assert "already been converted" in dup_conv.json()["detail"].lower()

    # --------------------------------------------------------------------------
    # Step 5: Verify Property created & initially unpublished
    # --------------------------------------------------------------------------
    prop_check = client.get(f"/api/properties/{prop_id}", headers=admin_hdr)
    assert prop_check.status_code == 200
    prop_json = prop_check.json()
    assert prop_json["code"] == prop_code
    assert prop_json["locality"] == "Kalpetta"
    assert len(prop_json["images"]) == 1

    # Initially unpublished: public listing must NOT include it
    pub_list_before = client.get("/api/public/properties").json()
    assert not any(p["id"] == prop_id for p in pub_list_before["items"])

    # Public direct detail access must return 404 while unpublished
    pub_detail_before = client.get(f"/api/public/properties/{prop_id}")
    assert pub_detail_before.status_code == 404

    # --------------------------------------------------------------------------
    # Step 6: Agent Assignment & Multi-Agent Scoped Isolation
    # --------------------------------------------------------------------------
    # Non-admin agent cannot assign property
    agent_assign = client.patch(
        f"/api/properties/{prop_id}/assign",
        headers=agent1_hdr,
        json={"assigned_agent_id": agent1_id},
    )
    assert agent_assign.status_code == 403

    # Admin assigns to Agent 1
    admin_assign = client.patch(
        f"/api/properties/{prop_id}/assign",
        headers=admin_hdr,
        json={"assigned_agent_id": agent1_id},
    )
    assert admin_assign.status_code == 200
    assert admin_assign.json()["assigned_agent_id"] == agent1_id

    # Agent 1 can view the assigned property
    agent1_view = client.get(f"/api/properties/{prop_id}", headers=agent1_hdr)
    assert agent1_view.status_code == 200
    assert agent1_view.json()["id"] == prop_id

    # Agent 2 CANNOT view Agent 1's assigned property (multi-agent isolation)
    agent2_view = client.get(f"/api/properties/{prop_id}", headers=agent2_hdr)
    assert agent2_view.status_code == 403

    # Agent 2 cannot modify Agent 1's property
    agent2_update = client.put(
        f"/api/properties/{prop_id}",
        headers=agent2_hdr,
        json={"title": "Unauthorized modification attempt"},
    )
    assert agent2_update.status_code == 403

    # In paginated list: Agent 1 sees the property; Agent 2 does not
    agent1_props = client.get("/api/properties", headers=agent1_hdr).json()
    assert any(p["id"] == prop_id for p in agent1_props["items"])

    agent2_props = client.get("/api/properties", headers=agent2_hdr).json()
    assert not any(p["id"] == prop_id for p in agent2_props["items"])

    # --------------------------------------------------------------------------
    # Step 7: Publication and Public Visibility
    # --------------------------------------------------------------------------
    # Agent 1 cannot publish (requires properties.publish)
    agent1_publish = client.post(f"/api/properties/{prop_id}/publish", headers=agent1_hdr)
    assert agent1_publish.status_code == 403

    # Admin publishes property
    admin_publish = client.post(f"/api/properties/{prop_id}/publish", headers=admin_hdr)
    assert admin_publish.status_code == 200
    assert admin_publish.json()["is_published"] is True

    # Now property appears in public list
    pub_list_after = client.get("/api/public/properties").json()
    pub_match = next((p for p in pub_list_after["items"] if p["id"] == prop_id), None)
    assert pub_match is not None
    assert pub_match["code"] == prop_code
    assert pub_match["locality"] == "Kalpetta"
    assert pub_match["primary_image"] is not None

    # Public detail endpoint returns 200 with property data and images
    pub_detail_after = client.get(f"/api/public/properties/{prop_id}")
    assert pub_detail_after.status_code == 200
    pub_data = pub_detail_after.json()
    assert pub_data["code"] == prop_code
    assert pub_data["expected_price"] == 8500000.0

    # --------------------------------------------------------------------------
    # Step 8: Public Enquiry Submission
    # --------------------------------------------------------------------------
    enquiry_resp = client.post(
        f"/api/public/properties/{prop_id}/enquiry",
        json={
            "name": "Buyer Rajesh Kumar",
            "phone": "+919447123456",
            "email": "rajesh@example.com",
            "message": "Interested in site visit this weekend. Please call back.",
        },
    )
    assert enquiry_resp.status_code == 201
    enquiry_data = enquiry_resp.json()
    assert enquiry_data["enquiry_reference"].startswith("LED-")

    # Verify enquiry created a Lead assigned to Agent 1
    agent1_leads = client.get(f"/api/properties/{prop_id}/leads", headers=admin_hdr)
    assert agent1_leads.status_code == 200

    # --------------------------------------------------------------------------
    # Step 9: Admin unpublishes property
    # --------------------------------------------------------------------------
    admin_unpublish = client.post(f"/api/properties/{prop_id}/unpublish", headers=admin_hdr)
    assert admin_unpublish.status_code == 200
    assert admin_unpublish.json()["is_published"] is False

    # Property is hidden from public again
    pub_list_unpub = client.get("/api/public/properties").json()
    assert not any(p["id"] == prop_id for p in pub_list_unpub["items"])

    pub_detail_unpub = client.get(f"/api/public/properties/{prop_id}")
    assert pub_detail_unpub.status_code == 404


def test_submission_rejection_and_validation(client: TestClient, db_session: Session, auth_headers: dict):
    admin_hdr = auth_headers["admin"]
    agent1_hdr = auth_headers["agent1"]

    # 1. Create a submission to reject
    resp = client.post(
        "/api/public/property-submissions",
        data={
            "seller_name": "Reject Candidate",
            "mobile": "+919999988888",
            "property_type": "Commercial",
            "location": "Sulthan Bathery",
            "description": "Incomplete documentation property",
            "expected_price": "20000000",
        },
    )
    assert resp.status_code == 200
    sub_ref = resp.json()["reference"]

    list_resp = client.get(f"/api/admin/property-submissions/?reference={sub_ref}", headers=admin_hdr)
    assert list_resp.status_code == 200
    sub_id = list_resp.json()[0]["id"]

    # 2. Reject submission with reason
    rej_resp = client.post(
        f"/api/admin/property-submissions/{sub_id}/reject?reason=Title+deed+unclear",
        headers=admin_hdr,
    )
    assert rej_resp.status_code == 200
    assert rej_resp.json()["detail"] == "Submission rejected"

    # 3. Check status is REJECTED
    detail = client.get(f"/api/admin/property-submissions/{sub_id}", headers=admin_hdr).json()
    assert detail["status"] == SubmissionStatus.REJECTED.value
    assert "Title deed unclear" in (detail.get("notes") or "")

    # 4. Attempt to convert rejected submission fails with 400
    conv_fail = client.post(f"/api/admin/property-submissions/{sub_id}/convert", headers=admin_hdr)
    assert conv_fail.status_code == 400
    assert "only approved submissions" in conv_fail.json()["detail"].lower()
