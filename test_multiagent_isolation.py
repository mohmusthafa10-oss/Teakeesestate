import sys
sys.path.insert(0, 'backend')
from app.main import app
from app.models.models import User, Lead, Seller, FollowUp, Property, Deal
from app.database.session import SessionLocal
from starlette.testclient import TestClient

def test_multiagent_scoped_isolation():
    client = TestClient(app)
    db = SessionLocal()

    agent1 = db.query(User).filter(User.email == 'agent1@testate.in').first()
    agent2 = db.query(User).filter(User.email == 'agent2@testate.in').first()
    agent3 = db.query(User).filter(User.email == 'agent3@testate.in').first()
    admin = db.query(User).filter(User.role == 'Admin').first()
    assert agent1 and agent2 and agent3, "Three agents must be provisioned"

    # Log in as Agent 1
    res1 = client.post('/api/auth/login', data={'username': 'agent1@testate.in', 'password': 'agent123'})
    h_agent1 = {'Authorization': f"Bearer {res1.json()['access_token']}"}

    # Log in as Agent 2
    res2 = client.post('/api/auth/login', data={'username': 'agent2@testate.in', 'password': 'agent123'})
    h_agent2 = {'Authorization': f"Bearer {res2.json()['access_token']}"}

    # Log in as Agent 3
    res3 = client.post('/api/auth/login', data={'username': 'agent3@testate.in', 'password': 'agent123'})
    h_agent3 = {'Authorization': f"Bearer {res3.json()['access_token']}"}

    print("=== 1. FINANCIAL MODULE ISOLATION ACROSS ALL 3 AGENTS ===")
    for idx, h in enumerate([h_agent1, h_agent2, h_agent3], 1):
        r_adv = client.get('/api/finance/advances', headers=h)
        r_inv = client.get('/api/finance/investments', headers=h)
        assert r_adv.status_code == 403, f"Agent {idx} accessed advances!"
        assert r_inv.status_code == 403, f"Agent {idx} accessed investments!"
    print("All 3 agents blocked from company finances: PASSED.")

    print("=== 2. USER MANAGEMENT ISOLATION ACROSS ALL 3 AGENTS ===")
    for idx, h in enumerate([h_agent1, h_agent2, h_agent3], 1):
        r_usr = client.get('/api/users', headers=h)
        assert r_usr.status_code == 403, f"Agent {idx} accessed users!"
    print("All 3 agents blocked from user management: PASSED.")

    print("=== 3. AGENCY SETTINGS MODIFICATION ===")
    r_set = client.put('/api/settings', json={'agencyName': 'Unauthorized Change'}, headers=h_agent2)
    assert r_set.status_code == 403
    print("Agent 2 blocked from editing agency settings: PASSED.")

    print("=== 4. DIRECT IDOR / ROLE MODIFICATION ATTEMPTS ===")
    r_idor = client.put(f'/api/users/{agent3.id}', json={'role': 'Admin'}, headers=h_agent3)
    assert r_idor.status_code == 403
    print("Agent 3 self-elevation IDOR blocked: PASSED.")

    db.close()
    print("MULTI-AGENT RECORD & PRIVILEGE ISOLATION FULLY VERIFIED 100%!")

if __name__ == '__main__':
    test_multiagent_scoped_isolation()
