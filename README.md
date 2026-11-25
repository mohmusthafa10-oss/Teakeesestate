# Teakees Real Estate CRM

## Overview

A full‑stack Real Estate CRM built with **FastAPI**, **SQLAlchemy**, **Pydantic v2**, and a **React 19 + Vite** frontend. The backend uses PostgreSQL in production and SQLite for local development.

## Project Structure
```
├── backend/                # FastAPI backend
│   ├── app/                # Application code
│   ├── migrations/         # Alembic migrations
│   ├── .env.example        # Example env vars (PostgreSQL URL example)
│   └── requirements.txt    # Python dependencies
├── src/                    # React 19 frontend (Vite)
│   ├── pages/              # UI pages
│   └── ...
├── .gitignore
├── package.json            # Frontend dependencies
└── README.md               # This file
```

## Quick Start (Local Development)

### Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. (Optional) Seed SQLite database for dev:
   ```bash
   python app/seed.py
   ```
4. Run the FastAPI server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   API docs: `http://localhost:8000/docs`

### Frontend
1. Install Node dependencies (from project root):
   ```bash
   npm install --legacy-peer-deps
   ```
2. Start the Vite dev server:
   ```bash
   npm run dev
   ```
   UI: `http://localhost:3000`

## Default Seed Credentials
| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@testate.in` | `admin123` |
| **Agent** | `agent1@testate.in` | `agent123` |

## Running Automated Tests
```bash
python -m pytest backend/tests -v
```
All tests should pass.

---

## Production Deployment Architecture (Hostinger VPS)

The authoritative production deployment target for Teakees Estate is a **Hostinger VPS running Ubuntu 24.04 LTS**:

- **Web Server / Reverse Proxy:** Nginx (`deploy/nginx/teakees.conf`) handling SSL termination, static serving of public media (`/var/data/uploads/public/`), and proxying of API and private media downloads to FastAPI with `client_max_body_size 8M`.
- **Application Server:** FastAPI running under Uvicorn managed by systemd (`uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4`).
- **Database:** Local PostgreSQL 16+ on VPS with connection pooling and automated encrypted backups (`backend/backup_service.py`).
- **Media Storage:** Persistent directories with public/private segregation (`/var/data/uploads/public` and `/var/data/uploads/private`).
- **Housekeeping:** Daily cron / systemd timer for orphan media cleanup (`python -m app.services.cleanup --execute`).
- **Frontend:** Pre-built static single-page application served directly by Nginx (`/var/www/teakees-frontend/dist`).

*(Note: Legacy Render deployment blueprints in `render.yaml` are maintained for reference only).*

---

## License
MIT License
