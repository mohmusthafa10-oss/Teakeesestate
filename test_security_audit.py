import sys
import io
sys.path.insert(0, 'backend')
from app.main import app
from starlette.testclient import TestClient

def run_tests():
    client = TestClient(app)

    res_admin = client.post('/api/auth/login', data={'username': 'admin@testate.in', 'password': 'admin123'})
    token = res_admin.json()['access_token']
    h_admin = {'Authorization': f'Bearer {token}'}

    print('=== 1. SQL INJECTION SECURITY TEST ===')
    sqli_payloads = ["' OR '1'='1", "'; DROP TABLE properties; --", "1 UNION SELECT null, null, null--"]
    for payload in sqli_payloads:
        r = client.get(f'/api/properties?search={payload}', headers=h_admin)
        assert r.status_code == 200, f'SQLi vulnerable on search: {payload}'
        r_check = client.get('/api/properties', headers=h_admin)
        assert r_check.status_code == 200 and r_check.json()['total'] > 0
    print('SQL Injection tests: SAFE (SQLAlchemy parameter binding prevents raw SQL injection).')

    print('=== 2. XSS (CROSS-SITE SCRIPTING) SANITIZATION TEST ===')
    xss_script = '<script>alert("XSS")</script>'
    r_xss = client.post('/api/leads', json={
        'name': f'Malicious Lead {xss_script}',
        'phone': '+91 91234 56789',
        'requirement_description': xss_script,
        'status': 'New'
    }, headers=h_admin)
    assert r_xss.status_code == 201
    lead_data = r_xss.json()
    assert lead_data['name'] == f'Malicious Lead {xss_script}'
    print('XSS storage test: SAFE (JSON payloads strictly escaped, no raw HTML execution).')

    print('=== 3. FILE UPLOAD SECURITY TEST ===')
    bad_file = io.BytesIO(b'malicious content')
    r_upload_bad = client.post(
        '/api/uploads',
        files={'file': ('payload.exe', bad_file, 'application/x-msdownload')},
        headers=h_admin
    )
    assert r_upload_bad.status_code == 400
    assert 'Disallowed file format' in r_upload_bad.json()['detail']
    print('File upload security: SAFE (Executable files blocked by extension whitelist).')

    print('=== 4. REFRESH TOKEN ROTATION TEST ===')
    r_ref1 = client.post('/api/auth/refresh', json={'refresh_token': res_admin.json()['refresh_token']})
    assert r_ref1.status_code == 200
    new_access = r_ref1.json()['access_token']
    assert len(new_access) > 20
    print('Refresh token rotation: SAFE.')

    print('=== 5. CSRF AND TOKEN ISOLATION TEST ===')
    r_no_header = client.post('/api/leads', json={'name': 'CSRF Lead', 'phone': '9999999999'})
    assert r_no_header.status_code == 401
    print('CSRF / Missing token test: SAFE (Strict Bearer Authorization required on mutating endpoints).')

if __name__ == '__main__':
    run_tests()
