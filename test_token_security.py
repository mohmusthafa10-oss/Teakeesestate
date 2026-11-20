import sys
sys.path.insert(0, 'backend')
from app.main import app
from starlette.testclient import TestClient

def test_token_family_rotation_and_theft():
    client = TestClient(app)

    print("=== 1. TOKEN ROTATION TEST ===")
    res_login = client.post('/api/auth/login', data={'username': 'admin@testate.in', 'password': 'admin123'})
    assert res_login.status_code == 200
    token1 = res_login.json()['refresh_token']

    # Refresh 1: Should succeed and return token2
    res_ref1 = client.post('/api/auth/refresh', json={'refresh_token': token1})
    assert res_ref1.status_code == 200, f"Refresh 1 failed: {res_ref1.text}"
    token2 = res_ref1.json()['refresh_token']
    assert token2 != token1, "Refresh token must rotate upon issuance!"
    print("Refresh 1: PASSED (New token issued, old token invalidated).")

    # Refresh 2 with new token2: Should succeed and return token3
    res_ref2 = client.post('/api/auth/refresh', json={'refresh_token': token2})
    assert res_ref2.status_code == 200
    token3 = res_ref2.json()['refresh_token']
    assert token3 != token2
    print("Refresh 2: PASSED.")

    print("=== 2. TOKEN THEFT / REUSE DETECTION TEST ===")
    # Attacker attempts to use old token1 which was already rotated
    res_reuse = client.post('/api/auth/refresh', json={'refresh_token': token1})
    print("Attacker reuse status:", res_reuse.status_code, res_reuse.json().get('detail'))
    assert res_reuse.status_code == 401
    assert "reused" in res_reuse.json().get('detail', '').lower()
    print("Theft detection: PASSED (Reused token identified and rejected).")

    # Legitimate user's token3 should now also be revoked because the entire family is compromised
    res_fam_revoked = client.post('/api/auth/refresh', json={'refresh_token': token3})
    print("Legitimate user next refresh after theft:", res_fam_revoked.status_code)
    assert res_fam_revoked.status_code == 401
    print("Family revocation: PASSED (Entire compromised session family terminated).")

if __name__ == '__main__':
    test_token_family_rotation_and_theft()
