import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    auth,
    dashboard,
    deals,
    finance,
    followups,
    leads,
    matches,
    properties,
    registration,
    rentals,
    reports,
    sellers,
    settings as settings_route,
    site_visits,
    uploads,
    users,
)
from app.core.config import settings
from app.core.security import get_password_hash
from app.database.base import Base
from app.database.session import SessionLocal, engine, validate_database_connection
from app.models.models import SequenceCounter, User

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate database connection on startup — fails fast with a clear error message
    validate_database_connection()

    # Startup: ensure tables exist
    Base.metadata.create_all(bind=engine)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Seed initial Admin and SequenceCounters if database is empty
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.id == "usr-1").first()
        if not admin_user:
            admin_user = User(
                id="usr-1",
                name="Arjun Menon",
                email="admin@testate.in",
                phone="+91 98470 11220",
                password_hash=get_password_hash("admin123"),
                role="Admin",
                designation="Managing Partner",
                active=True,
            )
            db.add(admin_user)

        agent_user = db.query(User).filter(User.id == "usr-2").first()
        if not agent_user:
            agent_user = User(
                id="usr-2",
                name="Meera Nair",
                email="agent1@testate.in",
                phone="+91 98471 33445",
                password_hash=get_password_hash("agent123"),
                role="Agent",
                designation="Senior Property Advisor",
                active=True,
            )
            db.add(agent_user)

        # Initialize sequence counters if missing
        prefixes = [("TAK", 8), ("SLR", 1004), ("LED", 1008), ("DL", 1006), ("ADV", 1002), ("INV", 1003), ("RNT", 1003)]
        for pfx, val in prefixes:
            cnt = db.query(SequenceCounter).filter(SequenceCounter.prefix == pfx).first()
            if not cnt:
                db.add(SequenceCounter(prefix=pfx, current_value=val))

        db.commit()
    finally:
        db.close()

    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Enterprise Real Estate CRM Backend API with Role-Based Access Control and ACID Workflows",
    lifespan=lifespan,
)

# CORS Middleware - Permissive configuration for hosted & local environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploads
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include all API routers
app.include_router(auth.router)
app.include_router(sellers.router)
app.include_router(properties.router)
app.include_router(registration.router)
app.include_router(leads.router)
app.include_router(matches.router)
app.include_router(followups.router)
app.include_router(site_visits.router)
app.include_router(deals.router)
app.include_router(finance.router)
app.include_router(rentals.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(users.router)
app.include_router(settings_route.router)
app.include_router(uploads.router)

@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    # In production don't expose internal db traceback, but log cleanly
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred.", "type": type(exc).__name__},
    )
