import sys
import time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, 'backend')
from app.main import app
from starlette.testclient import TestClient

def run_sustained_load():
    client = TestClient(app)
    res = client.post('/api/auth/login', data={'username': 'admin@testate.in', 'password': 'admin123'})
    token = res.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    print("=== SUSTAINED LOAD TESTING (10, 30, 50 SIMULATED USERS) ===")
    endpoints = [
        ('/api/properties', 'GET', None),
        ('/api/leads', 'GET', None),
        ('/api/sellers', 'GET', None),
        ('/api/dashboard/summary', 'GET', None),
        ('/api/properties/map', 'GET', None),
        ('/api/followups', 'GET', None),
    ]

    for users in [10, 30, 50]:
        # Sustained load: each user sends 10 requests (total users * 10 requests)
        total_requests = users * 10
        tasks = []
        for i in range(total_requests):
            ep, method, body = endpoints[i % len(endpoints)]
            tasks.append((ep, method, body))

        latencies = []
        errors = 0
        t_start = time.perf_counter()

        def execute_task(task):
            ep, method, body = task
            t0 = time.perf_counter()
            try:
                if method == 'GET':
                    r = client.get(ep, headers=headers)
                else:
                    r = client.post(ep, json=body, headers=headers)
                t1 = time.perf_counter()
                return r.status_code, (t1 - t0) * 1000
            except Exception:
                return 500, 0.0

        with ThreadPoolExecutor(max_workers=users) as executor:
            results = list(executor.map(execute_task, tasks))

        t_end = time.perf_counter()
        elapsed_sec = t_end - t_start

        for status_code, lat in results:
            if status_code in (200, 201):
                latencies.append(lat)
            else:
                errors += 1

        rps = len(tasks) / elapsed_sec
        avg_lat = sum(latencies) / len(latencies) if latencies else 0
        sorted_lat = sorted(latencies)
        p95 = sorted_lat[int(len(sorted_lat) * 0.95)] if sorted_lat else 0
        p99 = sorted_lat[int(len(sorted_lat) * 0.99)] if sorted_lat else 0
        error_rate = (errors / len(tasks)) * 100

        print(f"Users: {users:2} | Requests: {total_requests:3} | RPS: {rps:.1f} | Avg: {avg_lat:.2f}ms | P95: {p95:.2f}ms | P99: {p99:.2f}ms | Error: {error_rate:.1f}% | Elapsed: {elapsed_sec:.2f}s")

if __name__ == '__main__':
    run_sustained_load()
