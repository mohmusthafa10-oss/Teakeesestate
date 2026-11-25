"""
bootstrap_admin.py — CLI tool to bootstrap or reset the initial Administrator account.

Usage:
    python -m app.bootstrap_admin --email admin@testate.in --password StrongPassword123!
    python -m app.bootstrap_admin  (interactive prompt)
"""
import argparse
import getpass
import re
import sys
import uuid
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.security import get_password_hash
from app.database.session import SessionLocal
from app.models.models import User


def validate_password(password: str) -> None:
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters long.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one number.")


def bootstrap_admin(email: str, password: str, name: str = "System Administrator", phone: str = "+91 98470 00000"):
    validate_password(password)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.strip()).first()
        if user:
            print(f"User '{email}' already exists. Updating role to Admin and resetting password...")
            user.role = "Admin"
            user.password_hash = get_password_hash(password)
            user.active = True
        else:
            print(f"Creating new Admin user '{email}'...")
            user = User(
                id=f"usr-{uuid.uuid4().hex[:8]}",
                name=name,
                email=email.strip(),
                phone=phone,
                password_hash=get_password_hash(password),
                role="Admin",
                designation="Managing Partner",
                active=True,
            )
            db.add(user)

        db.commit()
        print(f"SUCCESS: Admin account '{email}' is ready.")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Bootstrap initial Admin user")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--password", help="Admin password (min 12 chars, upper/lower/digits)")
    parser.add_argument("--name", default="System Administrator", help="Admin full name")
    parser.add_argument("--phone", default="+91 98470 00000", help="Admin phone number")

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
        bootstrap_admin(email, password, args.name, args.phone)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
