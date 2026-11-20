# Real Estate CRM — Running & Deployment Guide

This guide details how to start both the **Backend (Python FastAPI)** and **Frontend (React 19 + Vite)** concurrently, along with testing, seeding, and troubleshooting instructions.

---

## 1. Quick Start (Step-by-Step)

### Terminal 1: Start the Backend (FastAPI on Port 8000)

```powershell
# Navigate into the backend directory
cd backend

# (Optional) Seed the database if not done already
python app/seed.py

# Launch the FastAPI server with auto-reload
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
```

- **Backend Base URL**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **ReDoc API Explorer**: `http://localhost:8000/redoc`
- **Health Check Endpoint**: `http://localhost:8000/api/health`

---

### Terminal 2: Start the Frontend (Vite on Port 3000)

Open a second terminal in the project root:

```powershell
# Install frontend dependencies (if not installed yet)
npm install --legacy-peer-deps

# Start Vite development server
npm run dev
```

- **Frontend Application URL**: `http://localhost:3000`
- Open `http://localhost:3000` in your web browser.

---

## 2. Seed Accounts & Roles

The system comes pre-seeded with realistic data matching agency workflows:

| Role | Email | Password | Access & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@verdantrealty.in` | `admin123` | Full access across all properties, sellers, leads, financial records, users, and agency settings. |
| **Agent** | `meera@verdantrealty.in` | `agent123` | Scoped to assigned records, listings, scheduled follow-ups, and site visits. |
| **Agent** | `karthik@verdantrealty.in` | `agent123` | Land & Agricultural investment specialist. |
| **Agent** | `sana@verdantrealty.in` | `agent123` | Rentals and coastal stays coordinator. |

---

## 3. Running Automated Tests

Run the full automated test suite (verifying authentication, token refresh, RBAC, combined seller-property registration, and sequential ID generation):

```powershell
python -m pytest backend/tests -v
```

Expected result:
```text
backend/tests/test_auth.py::test_login_success PASSED
backend/tests/test_auth.py::test_login_invalid_password PASSED
backend/tests/test_auth.py::test_get_me_authorized PASSED
backend/tests/test_auth.py::test_get_me_unauthorized PASSED
backend/tests/test_auth.py::test_refresh_token PASSED
backend/tests/test_crm_workflows.py::test_combined_seller_property_registration PASSED
backend/tests/test_crm_workflows.py::test_property_sequential_id_generation PASSED
backend/tests/test_rbac.py::test_admin_can_access_users PASSED
backend/tests/test_rbac.py::test_agent_cannot_access_users PASSED
backend/tests/test_rbac.py::test_agent_can_access_sellers PASSED
backend/tests/test_rbac.py::test_agent_can_create_lead PASSED
======= 11 passed in 1.55s =======
```

---

## 4. Frontend Type Check & Production Build

```powershell
# Type check with TypeScript compiler
npm run lint

# Production build for deployment
npm run build
```

---

## 5. Docker Deployment (PostgreSQL + FastAPI)

For a containerized PostgreSQL 16 environment:

```powershell
# 1. Build and run containers in background
docker compose up -d --build

# 2. Run Alembic database migrations inside container
docker compose exec backend alembic upgrade head

# 3. Seed demo data
docker compose exec backend python app/seed.py
```

---

## 6. Common Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `ModuleNotFoundError: No module named 'app'` | Running uvicorn from the project root without setting python path | Either `cd backend` first, or set `PYTHONPATH=.` |
| `npm peer dependency conflict with esbuild` | Vite 8 vs older esbuild lockfile | Run `npm install --legacy-peer-deps` |
| Port 8000 or 3000 already in use | Another process running on the same port | Specify alternative ports: `uvicorn app.main:app --port 8001` or `npm run dev -- --port 3001` |
