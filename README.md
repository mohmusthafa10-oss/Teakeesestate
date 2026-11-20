# Teakees Real Estate CRM — Production Architecture & Deployment Guide

## 1. System Overview

A centralized, enterprise-grade Real Estate CRM developed to replace scattered Google Sheets. The system preserves the original React 19 frontend design system (`#064E3B`, `#F1F0E8`, `#FFFFFF`, `#151D18`, infinity-preloader) and provides a Python FastAPI backend with PostgreSQL persistence, JWT authentication, Argon2 password hashing, and role-based access control.

---

## 2. Directory Architecture

```
Teakeesestate/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py               # Dependency injection (JWT bearer, RBAC permissions)
│   │   │   └── routes/               # REST API endpoints
│   │   │       ├── auth.py           # Login, token refresh, logout, profile
│   │   │       ├── sellers.py        # Seller CRUD & portfolio linkage
│   │   │       ├── properties.py     # Property inventory, map query, price history
│   │   │       ├── registration.py   # Atomic combined Seller + Property registration
│   │   │       ├── leads.py          # Independent buyer lead management & matching
│   │   │       ├── matches.py        # Lead-property association & interest tracking
│   │   │       ├── followups.py      # Scheduled tasks & contact activity recording
│   │   │       ├── site_visits.py    # Site visit scheduling & outcomes
│   │   │       ├── deals.py          # Sales pipeline & duplicate transaction guard
│   │   │       ├── finance.py        # Seller advance liability ledger & investments
│   │   │       ├── rentals.py        # Short-term stay and long-term rental operations
│   │   │       ├── dashboard.py      # Relational metrics & activity feeds
│   │   │       ├── reports.py        # Analytical reports (inventory, leads, sales)
│   │   │       ├── users.py          # Admin user management
│   │   │       ├── settings.py       # Configurable branding & taxonomy
│   │   │       └── uploads.py        # File and photo upload handler
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic BaseSettings (.env loading)
│   │   │   ├── security.py           # Argon2 hashing & JWT tokens
│   │   │   └── permissions.py        # RBAC role permissions matrix
│   │   ├── database/
│   │   │   ├── base.py               # DeclarativeBase & TimestampMixin
│   │   │   └── session.py            # PostgreSQL & SQLite session factory
│   │   ├── models/
│   │   │   └── models.py             # 20 Relational ORM models with B-tree indexes
│   │   ├── schemas/
│   │   │   └── schemas.py            # Pydantic v2 validation models
│   │   ├── services/
│   │   │   └── services.py           # ACID business logic, sequential IDs, matching
│   │   ├── main.py                   # FastAPI entrypoint, CORS, static routes
│   │   └── seed.py                   # Idempotent demo dataset seeder
│   ├── migrations/                   # Alembic version-controlled DDL migrations
│   ├── tests/                        # Automated Pytest suite
│   ├── Dockerfile                    # Containerization specification
│   ├── requirements.txt              # Pinned Python dependencies
│   ├── alembic.ini                   # Migration config
│   └── .env.example                  # Environment configuration template
├── src/
│   ├── services/
│   │   ├── apiClient.ts              # Authenticated REST client with auto-refresh
│   │   └── crmService.ts             # Client data abstraction
│   ├── components/map/               # Leaflet portfolio map & location picker
│   └── ...                           # Preserved React 19 pages and components
├── docker-compose.yml                # Production PostgreSQL & backend orchestrator
└── README.md
```

---

## 3. Quick Start & Local Execution

### Backend Setup

```bash
# 1. Enter backend directory
cd backend

# 2. Install dependencies
pip install -r requirements.txt

# 3. Initialize SQLite database with seed data
python app/seed.py

# 4. Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```
API Documentation will be live at: `http://localhost:8000/docs`

### Frontend Setup

```bash
# In the project root
npm install --legacy-peer-deps
npm run dev
```
Application interface will run on: `http://localhost:3000`

---

## 4. Default Seed Credentials

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@testate.in` | `admin123` | Full access across all records, finance, users, and settings |
| **Agent** | `meera@testate.in` | `agent123` | Scoped to assigned records, follow-ups, properties, and leads |

---

## 5. Running Automated Tests

Execute the comprehensive test suite verifying authentication, RBAC, combined registration, sequential ID generation, and transaction rollback:

```bash
python -m pytest backend/tests -v
```

All 11 automated test cases pass out of the box.

---

## 6. PostgreSQL Production Deployment with Docker Compose

To spin up a fully isolated PostgreSQL 16 server and the FastAPI backend:

```bash
# Start PostgreSQL and Backend services
docker-compose up -d --build

# Run database migrations
docker-compose exec backend alembic upgrade head

# Seed initial production dataset
docker-compose exec backend python app/seed.py
```

---

## 7. Database Backup and Restore Procedures

### PostgreSQL Backup
```bash
docker exec -t teakees_postgres pg_dump -U postgres -d teakees_crm -F c -b -v -f /tmp/teakees_backup.dump
docker cp teakees_postgres:/tmp/teakees_backup.dump ./teakees_backup_$(date +%Y%m%d).dump
```

### PostgreSQL Restore
```bash
docker cp ./teakees_backup.dump teakees_postgres:/tmp/teakees_backup.dump
docker exec -t teakees_postgres pg_restore -U postgres -d teakees_crm -v --clean /tmp/teakees_backup.dump
```
