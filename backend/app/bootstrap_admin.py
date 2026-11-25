"""
bootstrap_admin.py — CLI tool to bootstrap or reset the initial Administrator account.

Usage:
    python -m app.bootstrap_admin --email admin@testate.in --password StrongPassword123!
    python -m app.bootstrap_admin --email admin@testate.in --password NewStrongPassword123! --reset-password
    python -m app.bootstrap_admin  (interactive prompt)
"""
import argparse
import getpass
import sys
import uuid
from pathlib import Path
from typing import Optional
from sqlalchemy import func

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.security import get_password_hash, validate_admin_password_strength
from app.database.session import SessionLocal
from app.models.models import User


def bootstrap_admin(
    email: str,
    password: str,
    name: str = "System Administrator",
    phone: Optional[str] = None,
    allow_reset: bool = False,
) -> None:
    # 1. Consistent password strength validation
    validate_admin_password_strength(password)

    clean_email = email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(func.lower(User.email) == clean_email).first()
        if user:
            # 2. Never silently promote an existing non-admin user
            if user.role != "Admin":
                raise ValueError(
                    f"Security violation: Account '{clean_email}' already exists with role '{user.role}'. "
                    "Cannot promote existing non-admin user to Admin."
                )

            # 3. Existing Admin password resets must be deliberate and explicitly controlled
            if not allow_reset:
                raise ValueError(
                    f"Admin account '{clean_email}' already exists. "
                    "Pass --reset-password flag to intentionally reset this administrator's password."
                )

            user.password_hash = get_password_hash(password)
            user.active = True
            if name:
                user.name = name
            if phone:
                user.phone = phone
            db.commit()
            print(f"SUCCESS: Password for Admin '{clean_email}' was securely updated.")
        else:
            # 4. Create initial Admin only when email is not registered
            user = User(
                id=f"usr-{uuid.uuid4().hex[:8]}",
                name=name,
                email=clean_email,
                phone=phone,
                password_hash=get_password_hash(password),
                role="Admin",
                designation="Managing Partner",
                active=True,
            )
            db.add(user)
            db.commit()
            print(f"SUCCESS: Initial Admin account '{clean_email}' is ready.")
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Bootstrap or reset initial Admin user")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--password", help="Admin password (min 12 chars, upper/lower/digits)")
    parser.add_argument("--name", default="System Administrator", help="Admin full name")
    parser.add_argument("--phone", default=None, help="Admin phone number (optional)")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        dest="allow_reset",
        help="Explicitly allow resetting the password of an existing Admin account",
    )

    args = parser.parse_args()

    email = args.email
    password = args.password

    if not email:
        email = input("Admin Email: ").strip()

    if not password:
        password = getpass.getpass("Admin Password: ").strip()
        confirm = getpass.getpass("Confirm Password: ").strip()
        if password != confirm:
            print("ERROR: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    try:
        bootstrap_admin(
            email=email,
            password=password,
            name=args.name,
            phone=args.phone,
            allow_reset=args.allow_reset,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
