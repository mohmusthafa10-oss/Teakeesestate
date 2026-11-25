"""Development seed script

Ensures that required admin and agent accounts exist for local development and test environments.
It reads the following environment variables:
- ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD
- AGENT1_SEED_EMAIL, AGENT1_SEED_PASSWORD
- AGENT2_SEED_EMAIL, AGENT2_SEED_PASSWORD

If any of the required variables are missing, the script raises a RuntimeError.
"""

import os
from app.core.config import settings
from app.database.session import SessionLocal
from app.models.models import User, SequenceCounter
from app.core.security import get_password_hash


def create_user_if_missing(db, user_id: str, name: str, email: str, phone: str, password: str, role: str, designation: str):
    """Insert a user if it does not already exist."""
    if db.query(User).filter(User.id == user_id).first():
        return
    user = User(
        id=user_id,
        name=name,
        email=email,
        phone=phone,
        password_hash=get_password_hash(password),
        role=role,
        designation=designation,
        active=True,
    )
    db.add(user)


def seed():
    db = SessionLocal()
    try:
        # Admin
        admin_email = os.getenv('ADMIN_SEED_EMAIL')
        admin_pwd = os.getenv('ADMIN_SEED_PASSWORD')
        if not admin_email or not admin_pwd:
            raise RuntimeError('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set for dev seed')
        create_user_if_missing(db, 'usr-admin', 'Admin User', admin_email, '+0000000000', admin_pwd, 'Admin', 'Managing Partner')

        # Agent 1
        agent1_email = os.getenv('AGENT1_SEED_EMAIL')
        agent1_pwd = os.getenv('AGENT1_SEED_PASSWORD')
        if not agent1_email or not agent1_pwd:
            raise RuntimeError('AGENT1_SEED_EMAIL and AGENT1_SEED_PASSWORD must be set for dev seed')
        create_user_if_missing(db, 'usr-agent1', 'Agent One', agent1_email, '+0000000001', agent1_pwd, 'Agent', 'Senior Property Advisor')

        # Agent 2
        agent2_email = os.getenv('AGENT2_SEED_EMAIL')
        agent2_pwd = os.getenv('AGENT2_SEED_PASSWORD')
        if not agent2_email or not agent2_pwd:
            raise RuntimeError('AGENT2_SEED_EMAIL and AGENT2_SEED_PASSWORD must be set for dev seed')
        create_user_if_missing(db, 'usr-agent2', 'Agent Two', agent2_email, '+0000000002', agent2_pwd, 'Agent', 'Senior Property Advisor')

        # Sequence counters (ensure they exist)
        prefixes = [('TAK', 8), ('SLR', 1004), ('LED', 1008), ('DL', 1006), ('ADV', 1002), ('INV', 1003), ('RNT', 1003)]
        for pfx, start in prefixes:
            if not db.query(SequenceCounter).filter(SequenceCounter.prefix == pfx).first():
                db.add(SequenceCounter(prefix=pfx, current_value=start))

        db.commit()
    finally:
        db.close()


if __name__ == '__main__':
    seed()
