import pytest

def test_admin_can_access_users(client, admin_headers):
    response = client.get("/api/users", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_agent_cannot_access_users(client, agent_headers):
    response = client.get("/api/users", headers=agent_headers)
    assert response.status_code == 403

def test_agent_can_access_sellers(client, agent_headers):
    response = client.get("/api/sellers", headers=agent_headers)
    assert response.status_code == 200

def test_agent_can_create_lead(client, agent_headers):
    lead_payload = {
        "name": "RBAC Test Lead",
        "phone": "+91 99999 88888",
        "lead_source": "Website",
        "min_budget": 1000000,
        "max_budget": 2000000,
        "property_type": "Land",
        "status": "New",
    }
    response = client.post("/api/leads", json=lead_payload, headers=agent_headers)
    assert response.status_code == 201
    assert response.json()["name"] == "RBAC Test Lead"

