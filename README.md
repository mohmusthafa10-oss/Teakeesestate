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

## Render Deployment (Production)

### Backend (FastAPI)
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Environment variables:** set in Render UI:
  - `PROJECT_NAME="Teakees Real Estate CRM"`
  - `ENVIRONMENT="production"`
  - `SECRET_KEY` (secure random string)
  - `ALGORITHM="HS256"`
  - `ACCESS_TOKEN_EXPIRE_MINUTES=120`
  - `REFRESH_TOKEN_EXPIRE_DAYS=7`
  - `DATABASE_URL` – PostgreSQL URL supplied by Render PostgreSQL add‑on, e.g. `postgresql+psycopg2://user:pass@host:5432/dbname`
  - `CORS_ORIGINS` – your frontend URL, e.g. `https://my-frontend.onrender.com`
  - `UPLOAD_DIR=/app/uploads`
- **Post‑deploy script:** `alembic upgrade head`
- **Health‑check endpoint:** `GET /api/health` returns `{ "status": "ok" }`

### Frontend (React 19 + Vite)
- **Build command:** `npm install --legacy-peer-deps && npm run build`
- **Publish directory:** `dist/`
- **Environment variable:** `VITE_API_URL` pointing to the backend URL (e.g. `https://my-backend.onrender.com`).

Render will automatically provision a PostgreSQL instance; backups can be managed via Render's built‑in backup features.

---

## License
MIT License
