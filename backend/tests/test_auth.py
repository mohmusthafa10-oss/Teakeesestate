import pytest

def test_login_success(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "admin@test.com", "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "admin@test.com"
    assert data["user"]["role"] == "Admin"

def test_login_invalid_password(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "admin@test.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401

def test_get_me_authorized(client, admin_headers):
    response = client.get("/api/auth/me", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["email"] == "admin@test.com"

def test_get_me_unauthorized(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401

def test_refresh_token(client):
    login_res = client.post(
        "/api/auth/login",
        data={"username": "admin@test.com", "password": "password123"},
    )
    refresh_token = login_res.json()["refresh_token"]

    refresh_res = client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_res.status_code == 200
    assert "access_token" in refresh_res.json()

def test_login_rate_limiting_triggers_429(client):
    from app.core.rate_limiter import login_limiter

    test_user = "rate_limit_target@test.com"
    login_limiter.reset_failures(test_user)
    login_limiter.reset_failures("testclient")

    try:
        # 5 failed attempts
        for _ in range(5):
            res = client.post(
                "/api/auth/login",
                data={"username": test_user, "password": "wrongpassword"},
            )
            assert res.status_code == 401

        # 6th attempt triggers 429 Too Many Requests
        blocked_res = client.post(
            "/api/auth/login",
            data={"username": test_user, "password": "wrongpassword"},
        )
        assert blocked_res.status_code == 429
        assert "Too many failed login attempts" in blocked_res.json()["detail"]
    finally:
        login_limiter.reset_failures(test_user)
        login_limiter.reset_failures("testclient")


def test_multi_worker_shared_rate_limiting(tmp_path):
    """Verify that multiple Uvicorn worker instances share rate limit state via persistent store."""
    from fastapi import HTTPException
    from app.core.rate_limiter import LoginRateLimiter

    shared_db = str(tmp_path / "shared_ratelimit.db")

    # Worker 1 and Worker 2 represent separate Uvicorn worker processes
    worker1_limiter = LoginRateLimiter(max_attempts=5, window_seconds=60, lockout_seconds=300, db_path=shared_db)
    worker2_limiter = LoginRateLimiter(max_attempts=5, window_seconds=60, lockout_seconds=300, db_path=shared_db)

    target_email = "target_shared@testate.in"

    # Worker 1 handles 3 failed login attempts
    for _ in range(3):
        worker1_limiter.record_failure(target_email)

    # Worker 2 handles 2 failed login attempts
    for _ in range(2):
        worker2_limiter.record_failure(target_email)

    # Now total failures across both workers = 5.
    # Worker 1 checking rate limit should now trigger HTTP 429 lockout!
    with pytest.raises(HTTPException) as exc_info1:
        worker1_limiter.check_rate_limit(target_email)
    assert exc_info1.value.status_code == 429

    # Worker 2 checking rate limit should ALSO trigger HTTP 429 lockout!
    with pytest.raises(HTTPException) as exc_info2:
        worker2_limiter.check_rate_limit(target_email)
    assert exc_info2.value.status_code == 429
    assert exc_info2.value.headers.get("Retry-After") is not None

    # Resetting on Worker 1 clears lockout for Worker 2 as well
    worker1_limiter.reset_failures(target_email)
    # Worker 2 should now pass check without exception
    worker2_limiter.check_rate_limit(target_email)

