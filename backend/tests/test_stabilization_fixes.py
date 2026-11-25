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
