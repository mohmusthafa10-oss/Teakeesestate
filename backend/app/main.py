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
    from sqlalchemy import func
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.role == "Admin").first()
        if not admin_user:
            admin_email = getenv("FIRST_ADMIN_EMAIL") or getenv("ADMIN_SEED_EMAIL")
            admin_password = getenv("FIRST_ADMIN_PASSWORD") or getenv("ADMIN_SEED_PASSWORD")

            if admin_email and admin_password:
                clean_email = admin_email.strip().lower()
                try:
                    validate_admin_password_strength(admin_password)
                    existing_user = db.query(User).filter(func.lower(User.email) == clean_email).first()
                    if existing_user:
                        if existing_user.role != "Admin":
                            logger.error(
                                "Cannot bootstrap initial Admin: email '%s' is already registered to a '%s' user. "
                                "Promotion of existing non-admin accounts during startup is strictly prohibited.",
                                clean_email, existing_user.role
                            )
                        else:
                            logger.info("Admin user '%s' already exists.", clean_email)
                    else:
                        new_admin = User(
                            id=f"usr-{uuid.uuid4().hex[:8]}",
                            name=getenv("FIRST_ADMIN_NAME", "System Administrator"),
                            email=clean_email,
                            phone=getenv("FIRST_ADMIN_PHONE", None),
                            password_hash=get_password_hash(admin_password),
                            role="Admin",
                            designation="Managing Partner",
                            active=True,
                        )
                        db.add(new_admin)
                        db.commit()
                        logger.info("Successfully bootstrapped initial admin account: %s", clean_email)
                except ValueError as ve:
                    db.rollback()
                    if settings.is_production:
                        raise RuntimeError(f"FATAL: Initial admin bootstrap password rejected: {ve}")
                    else:
                        logger.warning("Initial admin bootstrap password rejected: %s", ve)
                except Exception as e:
                    db.rollback()
                    logger.error("Failed to bootstrap initial admin account: %s", e)
            else:
                if settings.is_production:
                    logger.warning("No Admin user found in database and FIRST_ADMIN_EMAIL/PASSWORD not set. Run `python -m app.bootstrap_admin` to create an admin.")
    except Exception as e:
        db.rollback()
        logger.error("Database error during startup bootstrap: %s", e)
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
