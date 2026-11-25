import os
import sys

# Ensure test environment uses SQLite test database before loading application settings
os.environ["DATABASE_URL"] = "sqlite:///./test_crm.db"
os.environ["ENVIRONMENT"] = "testing"
os.environ["SECRET_KEY"] = "test-secret-key-for-automated-pytest-suite-32chars"

from typing import Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.security import create_access_token, get_password_hash
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models.models import SequenceCounter, User

TEST_DB_URL = "sqlite:///./test_crm.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        # Seed test admin & agent if not already inserted
        admin = db.query(User).filter(User.id == "test-admin-1").first()
        if not admin:
            admin = User(
                id="test-admin-1",
                name="Test Admin",
                email="admin@test.com",
                phone="+91 99999 11111",
                password_hash=get_password_hash("password123"),
                role="Admin",
                designation="Administrator",
                active=True,
            )
            db.add(admin)

        agent = db.query(User).filter(User.id == "test-agent-1").first()
        if not agent:
            agent = User(
                id="test-agent-1",
                name="Test Agent",
                email="agent@test.com",
                phone="+91 99999 22222",
                password_hash=get_password_hash("password123"),
                role="Agent",
                designation="Advisor",
                active=True,
            )
            db.add(agent)

        agent2 = db.query(User).filter(User.id == "test-agent-2").first()
        if not agent2:
            agent2 = User(
                id="test-agent-2",
                name="Test Agent Two",
                email="agent2@test.com",
                phone="+91 99999 33333",
                password_hash=get_password_hash("password123"),
                role="Agent",
                designation="Advisor",
                active=True,
            )
            db.add(agent2)

        # Standard testate.in multi-agent accounts for isolation test suites
        testate_accounts = [
            ("usr-admin-testate", "Admin Testate", "admin@testate.in", "admin123", "Admin"),
            ("usr-agent1-testate", "Agent One", "agent1@testate.in", "agent123", "Agent"),
            ("usr-agent2-testate", "Agent Two", "agent2@testate.in", "agent123", "Agent"),
            ("usr-agent3-testate", "Agent Three", "agent3@testate.in", "agent123", "Agent"),
        ]
        for uid, uname, uemail, upass, urole in testate_accounts:
            existing = db.query(User).filter(User.email == uemail).first()
            if not existing:
                db.add(User(
                    id=uid,
                    name=uname,
                    email=uemail,
                    phone="+91 98470 00000",
                    password_hash=get_password_hash(upass),
                    role=urole,
                    designation=urole,
                    active=True,
                ))

        counters = [
            ("TAK", 0),
            ("SLR", 1000),
            ("LED", 1000),
            ("DL", 1000),
            ("ADV", 1000),
            ("INV", 1000),
            ("RNT", 1000),
        ]
        for pfx, val in counters:
            cnt = db.query(SequenceCounter).filter(SequenceCounter.prefix == pfx).first()
            if not cnt:
                db.add(SequenceCounter(prefix=pfx, current_value=val))

        db.commit()
    finally:
        db.close()

    yield

    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists("./test_crm.db"):
        try:
            os.remove("./test_crm.db")
        except Exception:
            pass

    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists("./test_crm.db"):
        try:
            os.remove("./test_crm.db")
        except Exception:
            pass

@pytest.fixture
def db_session() -> Generator:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def client(db_session) -> Generator:
    from app.core.rate_limiter import login_limiter
    login_limiter.reset_all()

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    login_limiter.reset_all()

@pytest.fixture
def admin_token() -> str:
    return create_access_token(subject="test-admin-1", extra_claims={"role": "Admin", "email": "admin@test.com"})

@pytest.fixture
def agent_token() -> str:
    return create_access_token(subject="test-agent-1", extra_claims={"role": "Agent", "email": "agent@test.com"})

@pytest.fixture
def admin_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def agent_headers(agent_token) -> dict:
    return {"Authorization": f"Bearer {agent_token}"}

@pytest.fixture
def agent2_token() -> str:
    return create_access_token(subject="test-agent-2", extra_claims={"role": "Agent", "email": "agent2@test.com"})

@pytest.fixture
def agent2_headers(agent2_token) -> dict:
    return {"Authorization": f"Bearer {agent2_token}"}

@pytest.fixture(scope="session", autouse=True)
def setup_test_uploads():
    import tempfile
    import shutil
    from app.core.config import settings

    temp_base = tempfile.mkdtemp(prefix="test_uploads_")
    test_pub = os.path.join(temp_base, "public")
    test_priv = os.path.join(temp_base, "private")
    os.makedirs(test_pub, exist_ok=True)
    os.makedirs(test_priv, exist_ok=True)

    orig_pub = settings.PUBLIC_UPLOAD_DIR
    orig_priv = settings.PRIVATE_UPLOAD_DIR

    settings.PUBLIC_UPLOAD_DIR = test_pub
    settings.PRIVATE_UPLOAD_DIR = test_priv

    yield test_pub, test_priv

    settings.PUBLIC_UPLOAD_DIR = orig_pub
    settings.PRIVATE_UPLOAD_DIR = orig_priv
    shutil.rmtree(temp_base, ignore_errors=True)
