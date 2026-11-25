# Teakees Estate — Production Readiness & Architecture Implementation Plan

## 1. Executive Summary & Production Target Architecture
The authoritative production deployment target for Teakees Estate is a **Hostinger VPS running Ubuntu 24.04 LTS**:
- **Reverse Proxy / Edge:** Nginx (`deploy/nginx/teakees.conf`) handling SSL termination, static serving of public media, security headers, and request rate limiting.
- **Backend Application Server:** FastAPI running on Python 3.13 via Uvicorn, managed by systemd (`uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4`).
- **Persistence:** Local PostgreSQL 16+ on the VPS instance with connection pooling (`pre-ping`, pool recycle) and automated encrypted off-site backups (`backend/backup_service.py`).
- **Media Pipeline:** Bounded streaming file ingestion, fail-closed MIME validation using `python-magic`, strict extension-to-MIME verification, segregated public/private storage, and database record-backed authorization for private media.
- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite built to static files (`/var/www/teakees-frontend/dist`) served directly by Nginx.

---

## 2. Media Upload & Storage Security Architecture

### 2.1 Public vs Private Storage Segregation
- **Public Uploads (`PUBLIC_UPLOAD_DIR`):** Stored under `/var/data/uploads/public`. Served directly via Nginx alias `/uploads/` as static assets (property photos, marketing videos).
- **Private Uploads (`PRIVATE_UPLOAD_DIR`):** Stored under `/var/data/uploads/private`. **NEVER** mounted or aliased as static files. Accessible exclusively through the authenticated, database-authorized API endpoint:
  ```http
  GET /api/uploads/private/{filename}
  ```
- **Non-Overlap Invariant:** Application startup validates that `PUBLIC_UPLOAD_DIR` and `PRIVATE_UPLOAD_DIR` are separate, absolute directories that do not match or nest within each other.

### 2.2 Upload Size Limits & Request Overhead Accounting
- **Application Limit:** 5 MiB (5,242,880 bytes) per file.
- **Streaming Ingestion:** Files are read in bounded 1 MiB chunks. The moment cumulative bytes exceed 5 MiB, the write handle is closed, the partial file is unlinked immediately, and HTTP 400 is returned.
- **Reverse Proxy Overhead Accounting (Nginx):**
  - Form-data multipart boundaries (`--boundary`), Content-Disposition headers, and form metadata fields add approximately 1 KiB to 64 KiB of frame wrapping overhead per request.
  - Setting Nginx `client_max_body_size` to exactly `5m` causes any exact 5 MiB upload to be rejected with Nginx HTTP 413 (Request Entity Too Large).
  - **Production Requirement:** Set `client_max_body_size 8M` in Nginx. This accommodates the 5 MiB binary payload plus multipart headers while firmly rejecting unbounded payload attacks.

### 2.3 Server-Side MIME Validation (Fail-Closed)
- **Zero Trust on Client Headers:** `UploadFile.content_type` is never trusted.
- **Content Inspection:** The server inspects initial bytes using `python-magic` (`magic.from_file`).
- **Closed Whitelist:** Only explicit, sanctioned MIME types are accepted (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
- **Extension-MIME Consistency:** The detected MIME type must strictly match the filename extension (e.g., an ELF executable disguised as `.png` or plain text disguised as `.pdf` is rejected and immediately deleted).
- **Dependency / Inspection Failures:** If `libmagic` is missing or raises any exception, the upload is rejected with HTTP 400 (`Unable to verify file MIME type`) and the partial file is unlinked immediately.

### 2.4 Private Media Authorization Against Database Records
Private media authorization is **NOT** based solely on filenames or client-supplied parameters:
1. **Database Record Linkage:** When `GET /api/uploads/private/{filename}` is called:
   - The system checks `PropertyDocument` where `name == filename`. If attached to a `Property`, access is checked against `Property.assigned_agent_id`. If attached to a `Seller`, access is checked against `Seller.assigned_agent_id`.
   - The system checks `SubmissionMedia` where `storage_key == filename`. Access is checked against `PropertySubmission.assigned_agent_id`, `created_by_user_id`, or `SubmissionMedia.uploaded_by`.
   - For newly uploaded staging files not yet attached to an entity, access is restricted to the uploading agent via the initial staging identifier.
2. **Dynamic Reassignment & Revocation:**
   - If an Administrator reassigns a property to Agent B (`property.assigned_agent_id = agent_b.id`), Agent A immediately loses access (HTTP 403 Forbidden) and Agent B gains access.
   - If a `PropertyDocument` record is deleted or unlinked in the database, access is immediately revoked (HTTP 403 / 404).
3. **Administrator Access:**
   - Users with `role == "Admin"` possess global access across all private records.
4. **Traversal & Symlink Defense:**
   - Strict filename regex (`^[a-zA-Z0-9_\-\.]+$`), path canonicalization (`os.path.realpath`), directory boundary enforcement, and symlink rejection (`os.path.islink`).

---

## 3. Production Nginx Configuration
A production configuration template is located at `deploy/nginx/teakees.conf`.

Key directives:
```nginx
# Multipart upload body limit (5 MiB payload + envelope margin)
client_max_body_size 8M;

# Serve ONLY public uploads statically
location /uploads/ {
    alias /var/data/uploads/public/;
    expires 30d;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'none'; img-src 'self' data:; media-src 'self';" always;

    # Prohibit script execution
    location ~ \.(php|py|sh|pl|cgi|exe|bat|cmd)$ {
        deny all;
    }
    try_files $uri =404;
}

# Proxy all API and private media downloads to FastAPI
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_request_buffering off;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

*Note on SSL & Domain:* The configuration in `deploy/nginx/teakees.conf` uses server name `crm.testate.in` with commented Let's Encrypt certificate paths (`/etc/letsencrypt/live/crm.testate.in/...`). When deploying to the Hostinger VPS, Certbot (`certbot --nginx -d crm.testate.in`) must be run to generate production certificates.

---

## 4. Housekeeping & Orphan Media Cleanup
The cleanup engine is implemented at `backend/app/services/cleanup.py`:
- **Fail-Closed Database Query:** Queries all active records across `PropertyImage`, `PropertyDocument`, and `SubmissionMedia`. If the database query raises an exception, the run aborts immediately with zero file deletions.
- **In-Flight / Grace Period Protection:** Files younger than `min_age_hours` (default 24h) are preserved regardless of reference status to prevent race conditions with active multi-step user uploads.
- **Path Traversal & Symlink Safety:** Evaluates only canonical realpaths within managed directories; symlinks are rejected.
- **Dry-Run Mode:** Supports `--execute` CLI flag and programmatic invocation (`dry_run=True` by default).
- **Scheduled Cron / Systemd Timer:**
  ```bash
  # Daily cron run on Hostinger VPS (3:00 AM)
  0 3 * * * cd /var/www/teakees/backend && /var/www/teakees/backend/venv/bin/python -m app.services.cleanup --execute --min-age-hours 24 >> /var/log/teakees/cleanup.log 2>&1
  ```

---

## 5. Database Migrations Consolidation
- **Authoritative Migration Directory:** `backend/migrations` is the single source of truth for Alembic migrations.
- `backend/alembic.ini` explicitly specifies `script_location = migrations`.
- The legacy `backend/alembic` folder does not exist on disk and has been removed from references.

---

## 6. Login Rate Limiting (Multi-Worker Dual-Layer Architecture)
- **Edge Layer (Nginx):** In `deploy/nginx/teakees.conf`, `limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;` enforces perimeter rate limiting directly on `location = /api/auth/login` with `limit_req zone=login_limit burst=5 nodelay;` and `limit_req_status 429;`.
- **Application Layer (FastAPI):** `LoginRateLimiter` in `backend/app/core/rate_limiter.py` coordinates across all 4 Uvicorn worker processes via a process-safe persistent SQLite store with WAL mode and row locking.
- **Verification:** Verified by automated unit tests `test_login_rate_limiting_triggers_429` (5 failed attempts trigger 429 lockout) and `test_multi_worker_shared_rate_limiting` (two separate worker instances coordinate lockout across workers).

---

## 7. Property Lifecycle & Scoped Multi-Agent Architecture
- **Full Lifecycle Flow:**
  1. *Public Submission:* `POST /api/public/property-submissions` creates a submission record with human-readable reference (`SUB-XXXXXXXX`), seller details, and media.
  2. *Admin Review:* `GET /api/admin/property-submissions/` lists submissions with filters (status, seller name, reference, phone).
  3. *Approve / Reject:* `POST .../approve` and `POST .../reject` (requires reason).
  4. *Atomic Conversion:* `POST .../convert` atomically generates property code (`TAK001`), creates `Property`, transfers `SubmissionMedia` to `PropertyImage`, initializes publication status (`is_published=False`), transitions status to `Converted to Property`, and rejects duplicate conversions.
  5. *Agent Assignment:* `PATCH /api/properties/{id}/assign` (admin only) assigns property to an agent. Agents cannot reassign properties.
  6. *Multi-Agent Isolation:* Non-admin agents can only view and edit their own assigned properties. Viewing or editing another agent's property returns HTTP 403 Forbidden.
  7. *Publication & Public Listing:* `POST /api/properties/{id}/publish` and `/unpublish` (admin only). `GET /api/public/properties` only lists published properties. Detail endpoint `GET /api/public/properties/{id}` returns 404 for unpublished properties.
  8. *Public Enquiry:* `POST /api/public/properties/{id}/enquiry` creates a `Lead` assigned to the property's handling agent and returns an enquiry reference.
- **Verification:** Verified by `backend/tests/test_property_lifecycle.py` (2 comprehensive integration tests covering all 9 steps).

---

## 8. Frontend-to-Backend Integration
- **Pages Created & Integrated:**
  - `src/pages/PublicPropertySubmissionPage.tsx`: Dedicated public submission page with file uploads, validation, and confirmation reference modal.
  - `src/pages/AdminSubmissionsPage.tsx`: Admin review interface with status filter tabs, search, detail review modal, approve, reject with reason, and convert to property actions.
  - `src/pages/PropertyProfilePage.tsx`: Integrated with admin publication toggle ("Publish to Web" / "Published to Web") and agent assignment.
  - `src/services/apiClient.ts`: 12 new strongly typed API methods covering public submissions, admin review, approve/reject/convert, publication, and assignment.
- **Verification:** Verified via `npm run lint` (`tsc --noEmit` passes with 0 errors) and `npm run build` (`vite build` completes cleanly).

---

## 9. PostgreSQL 16+ Production Compatibility
- **Verification Automation:** `backend/scripts/verify_pg_compatibility.py` compiles all Alembic migrations (`be4c25d2b067` -> `pg_compat_0002` -> `43c5f0cc7276`) in offline mode against PostgreSQL dialect.
- **Validated Attributes:** Transactional DDL (`BEGIN` ... `COMMIT`), `TIMESTAMP WITH TIME ZONE`, `NUMERIC(14,2)`, `server_default=now()`, and all 12 critical database tables.

