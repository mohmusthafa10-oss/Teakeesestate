# Teakees Estate — Audit & Fixes Tracking Log

This document tracks all remediation items, their architectural rationale, code changes, associated commits, and verification evidence.

---

## Baseline Status (Step 0 & Step 1)

- **Canonical Architecture:** FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL 16+ (Hostinger VPS / Render target).
- **Frontend Architecture:** React 18 + TypeScript + Vite + Tailwind CSS.
- **Git State:** 
  - Working branch: `fix/production-readiness` (created from local `main`).
  - Reference branch for Express/Firebase: `reference/express-firebase` (commit `c14df52`).
  - Backup branch: `backup/origin-express` (commit `c14df52`).
  - Full working tree backup created outside repo: `D:\Takees\Teakeesestate_backup_step0`.
- **Backend Baseline:**
  - Registered Routes: 78 routes mapped in FastAPI.
  - Registered Database Models: 24 tables registered in `Base.metadata`.
  - Alembic Migrations: Revisions `be4c25d2b067` -> `pg_compat_0002` -> `43c5f0cc7276`.
  - Automated Tests: 36 passed / 0 failed in `pytest`.
- **Frontend Baseline:**
  - TypeScript Type Check: `tsc --noEmit` passed with 0 errors.
  - Production Build: `vite build` completed in 1.00s.
- **Identified Schema Drift:**
  - `password_reset_tokens` table exists in `models.models.py` but is not yet in an Alembic revision (scheduled for Phase 2 DB-01).

---

## Remediation Log

| Issue ID | Category | Summary of Problem | Remediation Plan & Changes | Commit Hash | Verification Evidence |
|---|---|---|---|---|---|
| **SEC-01** | Security | Hardcoded credentials in seed logic | Removed hardcoded admin/agent credentials from lifespan seed and `seed.py`; implemented environment variable bootstrap (`FIRST_ADMIN_EMAIL`/`PASSWORD`) with password strength validation (>=12 chars, upper, lower, digit); created `bootstrap_admin.py` CLI; added production guard against accidental test seeding | `2d793ce` | `test_phase1_security.py::test_sec01_admin_bootstrap_password_strength` |
| **SEC-02** | Upload Security | File upload validation & metadata stripping | Content-based magic-byte validation (fail-closed); strict MIME whitelist; EXIF/GPS metadata stripping using Pillow; IP rate limiting; max 10 files limit per submission; 15-minute duplicate submission detection | `2d793ce` | `test_phase1_security.py::test_sec02_*`, `test_upload_limits.py` |
| **SEC-03** | Configuration | SECRET_KEY validation bypass | Upgraded to Pydantic v2 `@model_validator(mode="after")`; strictly blocks default secrets, weak words ("secret", "admin123", "replace"), and keys < 32 characters when `ENVIRONMENT=production` | `2d793ce` | `test_phase1_security.py::test_sec03_production_secret_key_rejection` |
| **SEC-04..07** | Authorization | Per-record IDOR vulnerabilities | Enforced central `check_record_access` and `check_reassignment_permission` across properties, leads, follow-ups, matches, site visits, deals, reports, dashboard, and submissions; non-admin reassignment blocked | `2d793ce` | `test_phase1_security.py::test_sec04_07_record_level_authorization` |
| **SEC-08** | Media Security | Static upload exposure | Removed open `StaticFiles` mount `/uploads`; implemented state-aware media delivery endpoint `GET /uploads/{filename}` and `/api/uploads/public/{filename}`: serves publicly only if property is published; unpublished media strictly requires authenticated Admin or assigned Agent | `2d793ce` | `test_phase1_security.py::test_sec08_state_aware_media_delivery` |
| **REPO-01** | Repository | Code duplication in models | Verified single canonical `User` model in `app.models.models`; removed duplicate definitions | `2d793ce` | Python model metadata inspection (1 User class) |
| **WF-01** | Business Workflow | Property submission conversion gaps | Map all non-null Property fields, link/create Seller, link media atomically | Verified (ISS-002) | `test_property_lifecycle.py` |
| **WF-02** | Business Workflow | Explicit publication & public DTO | Implement publish/unpublish with audit history; sanitize public listing DTO | Verified (ISS-002) | `test_property_lifecycle.py` |
| **WF-03** | Workflow SLA | Submission status history & 48h SLA | Record reviewer, timestamps, contact deadline (48h), reject reason | Pending Phase 2 | Submission SLA tests |
| **DB-01** | Database | Alembic drift & schema manager | Remove `create_all` from startup; create migration for `password_reset_tokens`; verify `alembic check` | Pending Phase 2 | `alembic check` |
| **INT-01** | Integration | Frontend CRM API connection | Connect all CRM pages to real backend endpoints; add submission queues | Verified (ISS-008) | `tsc --noEmit`, `npm run build` |
