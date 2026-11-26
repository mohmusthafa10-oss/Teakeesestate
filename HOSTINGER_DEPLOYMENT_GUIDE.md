# Takees Estate — Hostinger Ubuntu VPS Production Deployment Guide

This document is the verified production deployment runbook for **Takees Estate** on a single Hostinger Ubuntu VPS (Ubuntu 22.04 LTS / 24.04 LTS) using **PostgreSQL, FastAPI (Uvicorn), Nginx, and React (Vite)**.

---

## Architectural Security Model

```
                      ┌────────────────────────────────────────┐
                      │          User Browser / HTTPS          │
                      └───────────────────┬────────────────────┘
                                          │ Port 443 (SSL/TLS)
                                          ▼
                      ┌────────────────────────────────────────┐
                      │             Nginx (www-data)           │
                      │  - Serves React SPA (/dist)            │
                      │  - Proxies /api/ to Uvicorn (port 8000)│
                      │  - Serves static public uploads only   │
                      └──────────┬──────────────────┬──────────┘
                                 │                  │
        Proxy to 127.0.0.1:8000  │                  │ Static Alias
                                 ▼                  ▼
              ┌───────────────────────────┐ ┌───────────────────────────┐
              │    FastAPI + Uvicorn      │ │ /var/data/teakees/        │
              │   (system user: teakees)  │ │ └── uploads/public/       │
              └──────────────┬────────────┘ └───────────────────────────┘
                             │
                             │ Unix Socket / TCP 5432
                             ▼
              ┌───────────────────────────┐
              │    PostgreSQL Database    │
              │     teakees_production    │
              └───────────────────────────┘
```

### Privilege Separation Model
- **`teakees` (System Service Account)**: Runs the FastAPI backend process, executes Alembic migrations, runs automated backups, and owns all application source code, private documents, and configuration.
- **`www-data` (Web Server Account)**: Runs Nginx. Has read-only access to `/var/www/teakees/dist/` (frontend SPA) and `/var/data/teakees/uploads/public/` (public property photos and videos). Has **NO ACCESS** to `/var/data/teakees/uploads/private/`, `/etc/teakees/backend.env`, or `/var/backups/teakees/`.

---

## 1. Git Release & Integrity Procedure

> [!IMPORTANT]
> A fresh server deployment clones the remote repository branch. Any uncommitted local work on development machines will not exist on the server until it has been reviewed, tested, committed, and pushed.

### Step-by-Step Release Protocol:
1. **Review Local Working Tree**:
   ```bash
   git status
   git diff --stat
   ```
2. **Execute Full Test Pipeline**:
   Ensure all 56 backend tests, Python compilation, TypeScript checks, and frontend production build pass.
3. **Commit with Authorization**:
   Once explicitly approved, commit all release files:
   ```bash
   git add -A
   git commit -m "release: v1.0.0 production release for Takees Estate"
   ```
4. **Push Release Branch & Tag**:
   ```bash
   git push origin audit/production-readiness
   git tag -a v1.0.0 -m "Production Release v1.0.0"
   git push origin v1.0.0
   ```
5. **Deploy by Verified Tag**:
   On the VPS, clone or checkout the exact tag `v1.0.0`.

---

## 2. Ubuntu System Packages & Node.js 20 LTS

### [RUN AS ROOT / SUDO]
Update Ubuntu base repositories and install core system utilities:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip python3-dev \
    postgresql postgresql-contrib libpq-dev \
    nginx certbot python3-certbot-nginx \
    git curl libmagic1 ufw logrotate
```

### Install Official Node.js 20 LTS (Required for React 19 & Vite 8)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node --version # Expected: v20.x.x
npm --version  # Expected: 10.x.x
```

---

## 3. Dedicated Service Account & Directory Hierarchy

### [RUN AS ROOT / SUDO]
Create a dedicated system account named `teakees` without a login shell:

```bash
sudo useradd --system --shell /bin/bash --home-dir /var/www/teakees --create-home teakees
```

Create application, storage, configuration, and backup directories:

```bash
# Application source directory
sudo mkdir -p /var/www/teakees

# Persistent upload directories
sudo mkdir -p /var/data/teakees/uploads/public
sudo mkdir -p /var/data/teakees/uploads/private

# Automated backups directory
sudo mkdir -p /var/backups/teakees

# Protected environment configuration directory
sudo mkdir -p /etc/teakees

# Setup ownership & permissions
# 1. Source code: owned by teakees
sudo chown -R teakees:teakees /var/www/teakees
sudo chmod 755 /var/www/teakees

# 2. Public uploads: writable by teakees, readable by www-data (Nginx)
sudo chown -R teakees:www-data /var/data/teakees/uploads/public
sudo chmod 750 /var/data/teakees/uploads/public

# 3. Private uploads: accessible ONLY by teakees service account
sudo chown -R teakees:teakees /var/data/teakees/uploads/private
sudo chmod 700 /var/data/teakees/uploads/private

# 4. Backups: accessible ONLY by teakees service account
sudo chown -R teakees:teakees /var/backups/teakees
sudo chmod 700 /var/backups/teakees

# 5. Configuration: accessible ONLY by teakees service account
sudo chown -R teakees:teakees /etc/teakees
sudo chmod 700 /etc/teakees
```

---

## 4. PostgreSQL Installation & Secure Password Setup

### 4.1 Verify Localhost Isolation
Confirm PostgreSQL listens exclusively on `127.0.0.1`:

```bash
sudo grep -E "^\s*listen_addresses" /etc/postgresql/*/main/postgresql.conf
# Expected: listen_addresses = 'localhost'
```

### 4.2 Create Database User & Database Interactively
### [INTERACTIVE PROMPT — NO PASSWORDS IN SHELL HISTORY]
Use PostgreSQL's built-in `createuser -P` to prompt for password masked:

```bash
# Create user with interactive, hidden password input
sudo -u postgres createuser --pwprompt teakees_user

# Create database owned by teakees_user
sudo -u postgres createdb -O teakees_user teakees_production

# Grant required permissions strictly to public schema
sudo -u postgres psql -d teakees_production << 'EOF'
REVOKE ALL ON DATABASE teakees_production FROM PUBLIC;
GRANT CONNECT ON DATABASE teakees_production TO teakees_user;
GRANT ALL ON SCHEMA public TO teakees_user;
EOF
```

### 4.3 Encode Special Characters for SQLAlchemy Connection String
If your database password contains characters like `@`, `/`, `#`, `%`, `&`, or `?`, generate the URL-encoded string using Python:

```bash
python3 -c "import urllib.parse; print('ENCODED:', urllib.parse.quote_plus(input('Enter password to encode: ')))"
```

Test connection using `psql`:
```bash
psql -U teakees_user -h 127.0.0.1 -d teakees_production -W
# Type password, then type \q to exit
```

---

## 5. PostgreSQL Connection Pool Sizing & Safety Analysis

### Conservative Connection Pool Budget (Single Hostinger VPS)

In `backend/app/core/config.py` and `backend/app/database/session.py`, SQLAlchemy pool parameters are configured as:
- `DB_POOL_SIZE`: **5**
- `DB_MAX_OVERFLOW`: **10**
- `DB_POOL_TIMEOUT`: **30**

### Connection Calculation:
| Process / Component | Instances / Concurrency | Max Connections per Instance | Subtotal |
| :--- | :--- | :--- | :--- |
| **FastAPI Backend (Uvicorn)** | 2 workers | 5 steady + 10 overflow = 15 | **30** |
| **Automated Backup Cron (`backup_service.py`)** | 1 process (daily at 02:00) | 1 connection (`pg_dump`) | **1** |
| **Alembic Migrations** | 1 process (on deployment) | 1 connection | **1** |
| **Administrative DBA Access (`psql`)** | 1 session | 1 connection | **1** |
| **Total Peak Connection Ceiling** | — | — | **33 connections** |
| **PostgreSQL Default `max_connections`** | — | — | **100 connections** |
| **Safety Headroom Buffer** | — | — | **67 connections (67% buffer)** |

> [!NOTE]
> The application code in `session.py` contains a fail-safe check: attempting to run `ENVIRONMENT="production"` with an active SQLite URL will immediately abort process startup with `FATAL CONFIGURATION ERROR`.

---

## 6. Secure Production Environment File

### [RUN AS ROOT / SUDO]
Generate a cryptographic `SECRET_KEY` and write `/etc/teakees/backend.env` with mode `600`:

```bash
NEW_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(48))")

sudo tee /etc/teakees/backend.env > /dev/null << EOF
PROJECT_NAME="Teakees Real Estate CRM"
ENVIRONMENT="production"
SECRET_KEY="${NEW_SECRET}"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=7

# Connection Pool Settings
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=30

# Database Connection (replace YOUR_ENCODED_PASSWORD)
DATABASE_URL="postgresql+psycopg2://teakees_user:YOUR_ENCODED_PASSWORD@127.0.0.1:5432/teakees_production"

# CORS Configuration (set to your exact production domain)
CORS_ORIGINS=["https://crm.teakeesestate.com"]

# Persistent Media & Backup Storage Directories
UPLOAD_DIR="/var/data/teakees/uploads"
PUBLIC_UPLOAD_DIR="/var/data/teakees/uploads/public"
PRIVATE_UPLOAD_DIR="/var/data/teakees/uploads/private"
BACKUP_DIR="/var/backups/teakees"

# Initial Superuser Bootstrap (seeded on first startup only)
FIRST_ADMIN_EMAIL="admin@teakeesestate.com"
FIRST_ADMIN_PASSWORD="YourStrongAdminPassword123!"
FIRST_ADMIN_NAME="Managing Director"
FIRST_ADMIN_PHONE="+91 94470 00000"
EOF

# Restrict permissions exclusively to teakees account
sudo chown teakees:teakees /etc/teakees/backend.env
sudo chmod 600 /etc/teakees/backend.env
```

---

## 7. Application Code Setup & Python Virtualenv

### [RUN AS ROOT / SUDO]
Clone the verified release repository:

```bash
cd /var/www
sudo git clone -b v1.0.0 https://github.com/your-org/teakeesestate.git teakees
sudo chown -R teakees:teakees /var/www/teakees
```

### [RUN AS TEAKEES USER]
Create the Python virtual environment and install backend dependencies:

```bash
sudo -u teakees bash
cd /var/www/teakees/backend
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# Verify core dependencies
./venv/bin/python -c "import fastapi, sqlalchemy, psycopg2, magic, PIL; print('All Python dependencies verified successfully.')"
exit
```

---

## 8. Database Migrations & Schema Drift Check

### [RUN AS TEAKEES USER]
Execute Alembic migrations using the credentials in `/etc/teakees/backend.env`:

```bash
sudo -u teakees bash -c '
set -a
source /etc/teakees/backend.env
set +a
cd /var/www/teakees/backend
./venv/bin/alembic upgrade head
./venv/bin/alembic current
./venv/bin/alembic check
'
```

**Expected Verification Output**:
- `b2c3d4e5f6a7 (head)`
- `No new upgrade operations detected.`

---

## 9. Frontend Production Build via `npm ci`

### [RUN AS TEAKEES USER]
Build the frontend SPA using the exact lockfile dependencies:

```bash
sudo -u teakees bash -c '
cd /var/www/teakees
tee .env.production > /dev/null << "EOF"
# Relative path allows Nginx to reverse proxy /api/ without hardcoding external origins
VITE_API_BASE_URL=""
EOF

npm ci
npm run build
'
```

Verify build output:
```bash
ls -lh /var/www/teakees/dist/index.html
# Ensure dist/ directory is readable by Nginx
sudo chmod 755 /var/www/teakees/dist
```

---

## 10. Systemd Service Configuration (`teakees.service`)

### [RUN AS ROOT / SUDO]
Create `/etc/systemd/system/teakees.service`:

```ini
[Unit]
Description=Teakees Real Estate CRM FastAPI Service
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=teakees
Group=teakees
WorkingDirectory=/var/www/teakees/backend
EnvironmentFile=/etc/teakees/backend.env
ExecStart=/var/www/teakees/backend/venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2 \
    --forwarded-allow-ips="127.0.0.1" \
    --no-access-log

Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

StandardOutput=journal
StandardError=journal
SyslogIdentifier=teakees-backend

# Security Sandboxing & Directory Protection
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/data/teakees /var/backups/teakees /var/www/teakees/backend

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable teakees.service
sudo systemctl start teakees.service
sudo systemctl status teakees.service
```

Test internal endpoint:
```bash
curl -s http://127.0.0.1:8000/api/health
# Expected: {"status":"ok","app":"Teakees Real Estate CRM"}
```

---

## 11. Nginx Reverse Proxy Configuration

### [RUN AS ROOT / SUDO]
Create `/etc/nginx/sites-available/teakees`:

```nginx
# Rate limiting definitions
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=25r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

server {
    listen 80;
    server_name crm.teakeesestate.com;

    # Matches backend 50MB maximum upload limit
    client_max_body_size 50M;

    root /var/www/teakees/dist;
    index index.html;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend Single Page Application Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Public Media Storage (Photos & Videos)
    # Native support for HTTP 206 Partial Content range requests for video playback
    location /uploads/ {
        alias /var/data/teakees/uploads/public/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri =404;
    }

    # FastAPI Backend API Proxy
    location /api/ {
        limit_req zone=api_limit burst=30 nodelay;

        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Video Streaming Range Headers Proxying
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Authentication Rate Limiting
    location /api/auth/login {
        limit_req zone=login_limit burst=5 nodelay;
        proxy_pass http://127.0.0.1:8000/api/auth/login;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Explicitly block access to hidden files and private folders
    location ~ /\. {
        deny all;
    }
}
```

Enable site and restart Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/teakees /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 12. HTTPS Setup via Let's Encrypt Certbot

### [RUN AS ROOT / SUDO]
```bash
sudo certbot --nginx -d crm.teakeesestate.com
```

Verify automatic renewal:
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 13. UFW Firewall Configuration

### [RUN AS ROOT / SUDO]
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

---

## 14. Automated Daily Database & Media Backups

### [RUN AS TEAKEES USER]
Test the automated backup script:

```bash
sudo -u teakees bash -c '
set -a
source /etc/teakees/backend.env
set +a
/var/www/teakees/backend/venv/bin/python /var/www/teakees/backend/backup_service.py
'
```

Verify output backup files:
```bash
ls -lh /var/backups/teakees/
```

### Schedule Automated Backup Cron (Daily at 02:00 AM)
Add cron entry to the `teakees` user's crontab:

```bash
sudo crontab -u teakees -l 2>/dev/null | { cat; echo "0 2 * * * set -a; source /etc/teakees/backend.env; set +a; /var/www/teakees/backend/venv/bin/python /var/www/teakees/backend/backup_service.py >> /var/backups/teakees/backup.log 2>&1"; } | sudo crontab -u teakees -
```

Configure log rotation in `/etc/logrotate.d/teakees-backup`:

```bash
sudo tee /etc/logrotate.d/teakees-backup > /dev/null << 'EOF'
/var/backups/teakees/backup.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
EOF
```

---

## 15. Disaster Recovery: Verification on Disposable Database

> [!CAUTION]
> Never restore a backup directly over the active production database without taking an immediate snapshot first.

### [RUN AS ROOT / SUDO]
Test backup restoration safely on a disposable test database:

```bash
# 1. Create a disposable database
sudo -u postgres createdb -O teakees_user teakees_disposable_test

# 2. Restore the latest backup into the disposable database
LATEST_BACKUP=$(ls -t /var/backups/teakees/teakees_db_*.dump | head -n 1)
sudo -u teakees pg_restore -d "postgresql://teakees_user:YOUR_PASSWORD@127.0.0.1:5432/teakees_disposable_test" \
    --clean --if-exists "$LATEST_BACKUP"

# 3. Verify record counts
sudo -u postgres psql -d teakees_disposable_test -c "SELECT count(*) AS properties_count FROM properties; SELECT count(*) AS users_count FROM users;"

# 4. Clean up disposable database
sudo -u postgres dropdb teakees_disposable_test
```

---

## 16. Post-Deployment Smoke Tests

Execute these verification checks once services are running:

1. **API Status**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://crm.teakeesestate.com/api/health
   # Expected: 200
   ```
2. **SPA Router**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://crm.teakeesestate.com/login
   # Expected: 200
   ```
3. **Private File Denial**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://crm.teakeesestate.com/api/uploads/private/test.pdf
   # Expected: 401 (Unauthorized without valid JWT)
   ```
4. **Live Application Logs**:
   ```bash
   sudo journalctl -u teakees.service -f
   ```
