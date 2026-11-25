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
# New routers for property submission workflow
from app.api.routes.public import router as public_router
from app.api.routes.admin_submissions import router as admin_submissions_router
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
    # Ensure public upload directory exists (static files are served only from PUBLIC_UPLOAD_DIR)
    os.makedirs(settings.PUBLIC_UPLOAD_DIR, exist_ok=True)

    # Seed initial admin and agent users from environment variables (only in development)
    # This avoids hard‑coded credentials in production. The seeding runs only when the
    # database is empty and the required environment variables are present.
    from os import getenv
    db = SessionLocal()
    try:
        # Helper to create a user if not existing
        def create_user_if_missing(user_id: str, name: str, email_env: str, phone: str, password_env: str, role: str, designation: str):
            existing = db.query(User).filter(User.id == user_id).first()
            if existing:
                return
            email = getenv(email_env)
            password = getenv(password_env)
            if not email or not password:
                # In production we abort seeding; in development we can skip silently.
                if settings.ENVIRONMENT == "production":
                    raise RuntimeError(
                        f"Missing environment variables for seeding user {user_id}: {email_env} and/or {password_env}"
                    )
                return
            user = User(
                id=user_id,
                name=name,
                email=email,
                phone=phone,
                password_hash=get_password_hash(password),
                role=role,
                designation=designation,
                active=True,
            )
            db.add(user)

        # Only seed when in non‑production environments
        if settings.ENVIRONMENT != "production":
            create_user_if_missing(
                user_id="usr-1",
                name="Arjun Menon",
                email_env="ADMIN_SEED_EMAIL",
                phone="+91 98470 11220",
                password_env="ADMIN_SEED_PASSWORD",
                role="Admin",
                designation="Managing Partner",
            )
            create_user_if_missing(
                user_id="usr-2",
                name="Meera Nair",
                email_env="AGENT_SEED_EMAIL",
                phone="+91 98471 33445",
                password_env="AGENT_SEED_PASSWORD",
                role="Agent",
                designation="Senior Property Advisor",
            )

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
# Ensure public upload directory exists (static files are served only from PUBLIC_UPLOAD_DIR)
os.makedirs(settings.PUBLIC_UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.PUBLIC_UPLOAD_DIR), name="uploads")

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

# Property submission workflow routers
app.include_router(public_router)
app.include_router(admin_submissions_router)

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
