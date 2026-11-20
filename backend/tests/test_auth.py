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

