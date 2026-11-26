import uuid
from datetime import date, datetime, timedelta
import pytest
from app.core.security import create_access_token, get_password_hash
from app.models.models import FollowUp, Lead, PasswordResetToken, User
from app.bootstrap_admin import bootstrap_admin


def test_followup_authorization_agent_can_update_and_complete(client, db_session, agent_headers, agent2_headers, admin_headers):
    # Setup: create a Lead and a FollowUp assigned to Agent 1
    lead = Lead(
        id=f"lead-fup-{uuid.uuid4().hex[:6]}",
        code=f"LED-{uuid.uuid4().hex[:4]}",
        name="FollowUp Test Lead",
        phone="+91 98888 11111",
        lead_source="Website",
        preferred_district="Wayanad",
        assigned_agent_id="test-agent-1",
    )
    db_session.add(lead)
    db_session.commit()

    fup = FollowUp(
        id=f"fup-{uuid.uuid4().hex[:6]}",
        title="Site discussion",
        related_type="Lead",
        related_id=lead.id,
        assigned_agent_id="test-agent-1",
        date=date.today(),
        time="11:00",
        activity_type="Call",
        status="Pending",
    )
    db_session.add(fup)
    db_session.commit()

    # Agent 1 updates their own follow-up (previously failed with 403 due to owner_field="agent_id")
    update_res = client.put(
        f"/api/followups/{fup.id}",
        json={"notes": "Client requested call back at 3 PM"},
        headers=agent_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["notes"] == "Client requested call back at 3 PM"

    # Agent 2 CANNOT update Agent 1's follow-up
    cross_res = client.put(
        f"/api/followups/{fup.id}",
        json={"notes": "Snooping"},
        headers=agent2_headers,
    )
    assert cross_res.status_code == 403

    # Agent 1 completes their own follow-up
    complete_res = client.post(
        f"/api/followups/{fup.id}/complete",
        json={"notes": "Call finished", "next_date": str(date.today() + timedelta(days=2))},
        headers=agent_headers,
    )
    assert complete_res.status_code == 200
    assert complete_res.json()["status"] == "Completed"


def test_inactive_user_access_blocked(client, db_session):
    inactive_user = User(
        id=f"usr-inact-{uuid.uuid4().hex[:6]}",
        name="Deactivated Employee",
        email=f"inactive-{uuid.uuid4().hex[:6]}@test.com",
        phone="+91 99999 00000",
        password_hash=get_password_hash("password123"),
        role="Agent",
        designation="Former Advisor",
        active=False,
    )
    db_session.add(inactive_user)
    db_session.commit()

    token = create_access_token(
        subject=inactive_user.id,
        extra_claims={"role": inactive_user.role, "email": inactive_user.email},
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Inactive user cannot fetch /api/auth/me
    res = client.get("/api/auth/me", headers=headers)
    assert res.status_code == 401
    assert "Inactive" in res.json()["detail"]


def test_admin_bootstrap_security_refuses_promotion_and_requires_flag(db_session):
    # 1. Existing non-admin user cannot be silently promoted
    agent_email = "bootstrap_test_agent@test.com"
    existing_agent = User(
        id=f"usr-boot-{uuid.uuid4().hex[:6]}",
        name="Regular Agent",
        email=agent_email,
        phone="+91 98765 00001",
        password_hash=get_password_hash("AgentPass123!"),
        role="Agent",
        designation="Advisor",
        active=True,
    )
    db_session.add(existing_agent)
    db_session.commit()

    with pytest.raises(ValueError) as excinfo:
        bootstrap_admin(
            email=agent_email,
            password="StrongAdminPassword123!",
        )
    assert "Cannot promote existing non-admin user to Admin" in str(excinfo.value)

    # 2. Existing Admin cannot have password reset without --reset-password
    admin_email = "bootstrap_test_admin@test.com"
    existing_admin = User(
        id=f"usr-boot-{uuid.uuid4().hex[:6]}",
        name="Existing Admin",
        email=admin_email,
        phone="+91 98765 00002",
        password_hash=get_password_hash("OldAdminPass123!"),
        role="Admin",
        designation="Managing Partner",
        active=True,
    )
    db_session.add(existing_admin)
    db_session.commit()

    with pytest.raises(ValueError) as excinfo2:
        bootstrap_admin(
            email=admin_email,
            password="NewStrongAdminPassword123!",
            allow_reset=False,
        )
    assert "Pass --reset-password flag" in str(excinfo2.value)

    # 3. With allow_reset=True, existing Admin password can be reset
    bootstrap_admin(
        email=admin_email,
        password="NewStrongAdminPassword123!",
        allow_reset=True,
    )
    db_session.refresh(existing_admin)
    assert existing_admin.role == "Admin"


def test_password_reset_flow_and_invalidation(client, db_session):
    test_user = User(
        id=f"usr-pwd-{uuid.uuid4().hex[:6]}",
        name="Reset Test User",
        email=f"pwdtest-{uuid.uuid4().hex[:6]}@test.com",
        phone="+91 99999 77777",
        password_hash=get_password_hash("OldPassword123!"),
        role="Agent",
        designation="Advisor",
        active=True,
    )
    db_session.add(test_user)
    db_session.commit()

    # Request password reset
    forgot_res = client.post("/api/auth/forgot-password", json={"email": test_user.email})
    assert forgot_res.status_code == 200

    token_record = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == test_user.id,
        PasswordResetToken.used.is_(False),
    ).first()
    assert token_record is not None
    assert len(token_record.token_hash) == 64

    # Requesting another reset invalidates the first one
    forgot_res_2 = client.post("/api/auth/forgot-password", json={"email": test_user.email})
    assert forgot_res_2.status_code == 200

    db_session.refresh(token_record)
    assert token_record.used is True  # previous token was invalidated


def test_telecaller_crm_direct_creation_and_restrictions(client, db_session, telecaller_headers, admin_headers):
    # 1. Telecaller directly creates a Seller
    seller_res = client.post(
        "/api/sellers",
        json={
            "name": "Direct Telecaller Seller",
            "phone": "+91 98471 99999",
            "whatsapp": "+91 98471 99999",
            "address": "Meenangadi, Wayanad",
            "relationship_with_property": "Owner",
        },
        headers=telecaller_headers,
    )
    assert seller_res.status_code == 201
    seller_id = seller_res.json()["id"]

    # 2. Telecaller directly creates a Property
    prop_res = client.post(
        "/api/properties",
        json={
            "title": "Telecaller Registered Coffee Estate",
            "type": "Land",
            "category": "Plantation",
            "district": "Wayanad",
            "panchayath": "Meenangadi",
            "locality": "Kolagappara",
            "area_value": 50.0,
            "area_unit": "Cents",
            "expected_price": 4500000,
            "description": "50 cents prime coffee and pepper plantation",
            "seller_id": seller_id,
            "status": "Available",
        },
        headers=telecaller_headers,
    )
    assert prop_res.status_code == 201
    prop_id = prop_res.json()["id"]

    # 3. Telecaller can update the seller
    update_seller = client.put(
        f"/api/sellers/{seller_id}",
        json={"notes": "Called and verified ownership documents."},
        headers=telecaller_headers,
    )
    assert update_seller.status_code == 200

    # 4. Telecaller CANNOT access system users
    users_res = client.get("/api/users", headers=telecaller_headers)
    assert users_res.status_code == 403

    # 5. Telecaller CANNOT approve or convert submissions
    from app.models.models import PropertySubmission
    sub = PropertySubmission(
        id=f"sub-tst-{uuid.uuid4().hex[:6]}",
        reference="SUB-TC-001",
        seller_name="Test Seller",
        phone="+91 98472 88888",
        type="House",
        location="Kalpetta",
        status="Pending Review",
    )
    db_session.add(sub)
    db_session.commit()

    approve_attempt = client.post(
        f"/api/admin/property-submissions/{sub.id}/approve",
        headers=telecaller_headers,
    )
    assert approve_attempt.status_code == 403

    convert_attempt = client.post(
        f"/api/admin/property-submissions/{sub.id}/convert",
        headers=telecaller_headers,
    )
    assert convert_attempt.status_code == 403


def test_submission_conversion_links_seller_and_enforces_sla(client, db_session, admin_headers, agent_headers):
    from datetime import datetime, timezone
    from app.models.models import ActivityLog, Property, PropertySubmission, Seller

    # 1. Public submission with SLA deadline
    unique_phone = f"+91 98473 {uuid.uuid4().hex[:5]}"
    pub_res = client.post(
        "/api/public/property-submissions",
        data={
            "seller_name": "SLA Owner",
            "mobile": unique_phone,
            "property_type": "House",
            "location": "Vythiri, Wayanad",
            "description": "Scenic hill view villa with modern amenities",
            "expected_price": 9500000,
            "size": 20,
            "bedrooms": 3,
            "bathrooms": 3,
        },
    )
    assert pub_res.status_code == 200
    res_data = pub_res.json()
    assert "reference" in res_data
    assert "contact_deadline_at" in res_data
    deadline = datetime.fromisoformat(res_data["contact_deadline_at"])
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    now_utc = datetime.now(timezone.utc)
    diff_hours = (deadline - now_utc).total_seconds() / 3600
    assert 47.5 <= diff_hours <= 48.5

    sub_ref = res_data["reference"]
    sub_record = db_session.query(PropertySubmission).filter(PropertySubmission.reference == sub_ref).first()
    assert sub_record is not None

    # 2. Agent cannot approve or convert
    agent_convert = client.post(
        f"/api/admin/property-submissions/{sub_record.id}/convert",
        headers=agent_headers,
    )
    assert agent_convert.status_code == 403

    # 3. Admin approves submission
    approve_res = client.post(
        f"/api/admin/property-submissions/{sub_record.id}/approve",
        headers=admin_headers,
    )
    assert approve_res.status_code == 200

    # 4. Admin converts submission
    convert_res = client.post(
        f"/api/admin/property-submissions/{sub_record.id}/convert",
        headers=admin_headers,
    )
    assert convert_res.status_code == 200
    conv_data = convert_res.json()
    assert "property_id" in conv_data
    assert "seller_id" in conv_data

    # Verify Property created and linked to Seller
    created_prop = db_session.query(Property).filter(Property.id == conv_data["property_id"]).first()
    assert created_prop is not None
    assert created_prop.seller_id == conv_data["seller_id"]
    assert "3 BHK" in created_prop.other_features
    assert created_prop.category == "Residential"

    # Verify Seller created with code
    created_seller = db_session.query(Seller).filter(Seller.id == conv_data["seller_id"]).first()
    assert created_seller is not None
    assert created_seller.phone == unique_phone
    assert created_seller.code.startswith("SLR")

    # Verify ActivityLog entry
    audit_entry = db_session.query(ActivityLog).filter(
        ActivityLog.entity_id == created_prop.id,
        ActivityLog.action == "Converted",
    ).first()
    assert audit_entry is not None

    # 5. Duplicate conversion attempt is blocked with 400
    dup_res = client.post(
        f"/api/admin/property-submissions/{sub_record.id}/convert",
        headers=admin_headers,
    )
    assert dup_res.status_code == 400
    assert "already been converted" in dup_res.json()["detail"]
