"""
Standalone Database Connectivity and Health Diagnostic Tool
Takees Estate CRM

Tests database reachability and reports masked connection identity,
Alembic migration revision, and schema readiness without exposing sensitive credentials.

Usage:
    python check_db_connection.py
    python check_db_connection.py --url "postgresql+psycopg2://user:pass@host:5432/db"
"""

import argparse
import os
import sys

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from app.core.config import settings
from app.database.session import get_db_diagnostic_info, sanitize_db_url


def test_connection(target_url: str = None) -> bool:
    raw_url = target_url or os.getenv("DATABASE_URL") or settings.DATABASE_URL
    clean_url = sanitize_db_url(raw_url)
    diag = get_db_diagnostic_info(clean_url)

    print("=" * 65)
    print("TAKEES ESTATE CRM - DATABASE CONNECTIVITY DIAGNOSTIC")
    print("=" * 65)
    print(f"Dialect:       {diag.get('dialect')} ({diag.get('driver')})")
    print(f"Masked Host:   {diag.get('masked_host')}")
    print(f"Port:          {diag.get('port')}")
    print(f"Database:      {diag.get('database')}")
    print(f"Masked User:   {diag.get('masked_username')}")
    print(f"SSL Mode:      {diag.get('sslmode')}")
    print("-" * 65)

    is_pg = diag.get("is_postgres", False)
    is_sqlite = diag.get("is_sqlite", False)

    connect_args = {}
    if is_sqlite:
        connect_args["check_same_thread"] = False
        connect_args["timeout"] = 15
    elif is_pg:
        connect_args["connect_timeout"] = 10

    try:
        engine = create_engine(clean_url, connect_args=connect_args)
        with engine.connect() as conn:
            # 1. Reachability
            conn.execute(text("SELECT 1"))
            print("[PASS] Basic reachability (SELECT 1) succeeded.")

            # 2. Database engine details
            if is_pg:
                ver_row = conn.execute(text("SELECT version();")).fetchone()
                user_row = conn.execute(text("SELECT current_user, current_database();")).fetchone()
                time_row = conn.execute(text("SELECT NOW();")).fetchone()
                if ver_row:
                    print(f"[INFO] Server Engine:   {ver_row[0].split(',')[0].strip()}")
                if user_row:
                    print(f"[INFO] Active User:     {user_row[0]}")
                    print(f"[INFO] Connected DB:    {user_row[1]}")
                if time_row:
                    print(f"[INFO] Server Time:     {time_row[0]}")
            else:
                ver_row = conn.execute(text("SELECT sqlite_version();")).fetchone()
                if ver_row:
                    print(f"[INFO] SQLite Version:  {ver_row[0]}")

            # 3. Schema inspection
            inspector = inspect(conn)
            tables = inspector.get_table_names()
            print(f"[INFO] Total Tables:    {len(tables)}")

            # 4. Check Alembic migration revision
            if "alembic_version" in tables:
                rev_row = conn.execute(text("SELECT version_num FROM alembic_version;")).fetchone()
                current_rev = rev_row[0] if rev_row else "None"
                print(f"[INFO] Alembic Head:    {current_rev}")
            else:
                print("[WARN] alembic_version table NOT found. Database migrations may not have been run.")

            # 5. Check Users table
            if "users" in tables:
                count_row = conn.execute(text("SELECT COUNT(*) FROM users;")).fetchone()
                user_count = count_row[0] if count_row else 0
                roles_rows = conn.execute(text("SELECT role, COUNT(*) FROM users GROUP BY role;")).fetchall()
                roles_summary = ", ".join([f"{r[0]}: {r[1]}" for r in roles_rows])
                print(f"[INFO] Users Count:     {user_count} ({roles_summary or 'No users registered'})")
            else:
                print("[WARN] users table NOT found.")

        print("=" * 65)
        print("RESULT: CONNECTION VERIFIED SUCCESSFULLY")
        print("=" * 65)
        return True

    except OperationalError as oe:
        print("=" * 65)
        print("RESULT: CONNECTION FAILED (OperationalError)")
        print("=" * 65)
        print(f"Details: {oe}")
        print("\nTroubleshooting guidance:")
        if is_pg:
            print(" - If using Render External URL: verify Render PostgreSQL external connection status.")
            print(" - Verify host, port (5432), database name, user, and password in DATABASE_URL.")
            print(" - Ensure sslmode=require is enabled for external connections to Render.")
            print(" - Verify your IP is not blocked by firewall rules or network restrictions.")
        return False
    except SQLAlchemyError as se:
        print("=" * 65)
        print("RESULT: DATABASE ERROR")
        print("=" * 65)
        print(f"Details: {se}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Test Takees CRM database connection.")
    parser.add_argument("--url", help="Database connection URI to test (optional override)", default=None)
    args = parser.parse_args()

    success = test_connection(args.url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
