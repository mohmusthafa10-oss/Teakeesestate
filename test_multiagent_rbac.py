import sys
sys.path.insert(0, 'backend')
from app.main import app
from app.models.models import User, Lead, Seller, FollowUp, Property, SellerAdvance
from app.database.session import SessionLocal
from starlette.testclient import TestClient

def run_agent_isolation_tests():
    client = TestClient(app)
    db = SessionLocal()

    # Get Agent 1 and Agent 2
    agent1 = db.query(User).filter(User.email == 'agent1@testate.in').first()
    agent2 = db.query(User).filter(User.email == 'agent2@testate.in').first()
    assert agent1 and agent2, "Both agents must exist in database"

    # Authenticate as Agent 1
    res1 = client.post('/api/auth/login', data={'username': 'agent1@testate.in', 'password': 'agent123'})
    h_agent1 = {'Authorization': f"Bearer {res1.json()['access_token']}"}

    # Authenticate as Agent 2
    res2 = client.post('/api/auth/login', data={'username': 'agent2@testate.in', 'password': 'agent123'})
    h_agent2 = {'Authorization': f"Bearer {res2.json()['access_token']}"}

    print("=== 1. AGENT B FINANCIAL RECORDS ACCESS TEST ===")
    # Agent 1 attempting to access finance advances endpoint
    r = client.get('/api/finance/advances', headers=h_agent1)
    print("Agent 1 access to /api/finance/advances status:", r.status_code)
    assert r.status_code == 403, "Agent 1 should not have finance access"
    print("Financial isolation: PASSED (Agents strictly blocked from financial management).")

    print("=== 2. USER MANAGEMENT ACCESS TEST ===")
    r = client.get('/api/users', headers=h_agent1)
    assert r.status_code == 403
    print("User management isolation: PASSED.")

    print("=== 3. SETTINGS MODIFICATION TEST ===")
    r = client.put('/api/settings', json={'agencyName': 'Hacked Agency'}, headers=h_agent1)
    assert r.status_code == 403
    print("Settings protection: PASSED.")

    print("=== 4. AGENT A ROLE ELEVATION TO ADMIN TEST ===")
    r = client.put(f'/api/users/{agent1.id}', json={'role': 'Admin'}, headers=h_agent1)
    assert r.status_code == 403
    print("Self-role elevation prevention: PASSED.")

    db.close()
    print("ALL MULTI-AGENT RBAC TESTS PASSED 100%!")

if __name__ == '__main__':
    run_agent_isolation_tests()
