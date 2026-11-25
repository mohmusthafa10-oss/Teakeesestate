import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Ensure required test environment variables are set before any test executes
os.environ.setdefault("DATABASE_URL", "sqlite:///./teakees_crm.db")
os.environ.setdefault("SECRET_KEY", "8vdK-jIHsfSNTCXAFjT3-9Lp8-ZSzrpybnTowkSvU6HnXjNZhKKqCy6Vw2kyXjn6")
os.environ.setdefault("ENVIRONMENT", "testing")
os.environ.setdefault("RATE_LIMIT_DB_PATH", os.path.join(os.path.dirname(__file__), "backend", "data", "test_rate_limits.db"))

import pytest

@pytest.fixture(autouse=True)
def clean_rate_limits_around_tests():
    try:
        from app.core.rate_limiter import login_limiter
        login_limiter.reset_all()
    except Exception:
        pass
    yield
    try:
        from app.core.rate_limiter import login_limiter
        login_limiter.reset_all()
    except Exception:
        pass
