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
from app.core.security import get_password_hash, validate_admin_password_strength
from app.database.base import Base
from app.database.session import SessionLocal, engine, validate_database_connection
from app.models.models import SequenceCounter, User

import logging
import re
import uuid

logger = logging.getLogger("teakees.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate database connection on startup — fails fast with a clear error message
    validate_database_connection()

    # Ensure public and private upload directories exist safely and do not overlap
    from app.api.routes.uploads import ensure_upload_dirs
    ensure_upload_dirs()

    # Bootstrap initial admin user from environment variables if no admin exists
    from os import getenv
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.role == "Admin").first()
        if not admin_user:
            admin_email = getenv("FIRST_ADMIN_EMAIL") or getenv("ADMIN_SEED_EMAIL")
            admin_password = getenv("FIRST_ADMIN_PASSWORD") or getenv("ADMIN_SEED_PASSWORD")

            if admin_email and admin_password:
                try:
                    validate_admin_password_strength(admin_password)
                    new_admin = User(
                        id=f"usr-{uuid.uuid4().hex[:8]}",
                        name="System Administrator",
                        email=admin_email.strip(),
                        phone=getenv("FIRST_ADMIN_PHONE", "+91 98470 00000"),
                        password_hash=get_password_hash(admin_password),
                        role="Admin",
                        designation="Managing Partner",
                        active=True,
                    )
                    db.add(new_admin)
                    db.commit()
                    logger.info("Successfully bootstrapped initial admin account: %s", admin_email)
                except ValueError as ve:
                    if settings.is_production:
                        raise RuntimeError(f"FATAL: Initial admin bootstrap password rejected: {ve}")
                    else:
                        logger.warning("Initial admin bootstrap password rejected: %s", ve)
            else:
                if settings.is_production:
                    logger.warning("No Admin user found in database and FIRST_ADMIN_EMAIL/PASSWORD not set. Run `python -m app.bootstrap_admin` to create an admin.")

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

# State-aware media delivery router (replaces unauthenticated static mount)
from app.api.routes.uploads import media_router
app.include_router(media_router)

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
