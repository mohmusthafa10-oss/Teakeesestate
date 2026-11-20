import sys
import time
import psutil
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, 'backend')
from app.main import app
from starlette.testclient import TestClient

def run_performance_benchmarks():
    client = TestClient(app)
    res = client.post('/api/auth/login', data={'username': 'admin@testate.in', 'password': 'admin123'})
    token = res.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    print("=== HIGH-THROUGHPUT PERFORMANCE BENCHMARKS (10, 30, 50 USERS) ===")
    
    endpoints = [
        ('/api/properties', 'GET', None),
        ('/api/leads', 'GET', None),
        ('/api/sellers', 'GET', None),
        ('/api/dashboard/summary', 'GET', None),
        ('/api/properties/map', 'GET', None),
        ('/api/followups', 'GET', None),
        ('/api/leads', 'POST', {'name': 'Perf Lead', 'phone': '+91 99999 11111', 'property_type': 'House', 'status': 'New'}),
    ]

    for users in [10, 30, 50]:
        total_requests = users * 15
        tasks = [endpoints[i % len(endpoints)] for i in range(total_requests)]
        
        cpu_before = psutil.cpu_percent(interval=None)
        mem_before = psutil.virtual_memory().percent
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
        elapsed = t_end - t_start
        cpu_after = psutil.cpu_percent(interval=None)
        mem_after = psutil.virtual_memory().percent

        latencies = [lat for status, lat in results if status in (200, 201)]
        errors = sum(1 for status, _ in results if status not in (200, 201))

        rps = len(tasks) / elapsed
        avg_lat = sum(latencies) / len(latencies) if latencies else 0
        sorted_lat = sorted(latencies)
        p95 = sorted_lat[int(len(sorted_lat) * 0.95)] if sorted_lat else 0
        p99 = sorted_lat[int(len(sorted_lat) * 0.99)] if sorted_lat else 0
        err_pct = (errors / len(tasks)) * 100

        print(f"Users: {users:2} | Requests: {total_requests:4} | RPS: {rps:5.1f} | Avg: {avg_lat:6.2f}ms | P95: {p95:6.2f}ms | P99: {p99:6.2f}ms | Errors: {err_pct:.1f}% | CPU: {cpu_after}% | RAM: {mem_after}% | Elapsed: {elapsed:5.2f}s")

if __name__ == '__main__':
    run_performance_benchmarks()
