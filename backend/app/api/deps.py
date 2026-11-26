from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Any, Optional

from app.core.config import settings
from app.core.security import decode_token
from app.core.permissions import has_permission, Permission
from app.database.session import get_db
from app.models.models import User

# OAuth2 scheme for required authentication (auto_error=True)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Return the authenticated user or raise 401."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except Exception:
        raise credentials_exception
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# Optional authentication for public endpoints (no error on missing/invalid token)
def get_current_user_optional(token: str = Depends(OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)), db: Session = Depends(get_db)) -> Optional[User]:
    """Return the current user if a valid token is provided and user is active, otherwise None."""
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "access":
            return None
    except Exception:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.active:
        return None
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user account",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user

def require_permission(permission: str):
    def permission_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role == "Admin":
            return current_user
        if not has_permission(current_user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: requires '{permission}'",
            )
        return current_user
    return permission_checker


def check_record_access(
    record: Any,
    user: User,
    owner_field: str = "assigned_agent_id",
    creator_field: Optional[str] = "created_by_id",
) -> None:
    """
    Enforce multi-agent isolation across CRM records:
    - Admin: global access across all records.
    - Agent: permitted only if assigned to the record or creator of the record.
    - Telecaller: permitted only if creator of the record.
    """
    if getattr(user, "role", "") == "Admin":
        return

    if user.role == "Agent":
        assigned_id = getattr(record, owner_field, None)
        created_id = getattr(record, creator_field, None) if creator_field else None
        if not created_id:
            created_id = (
                getattr(record, "created_by", None)
                or getattr(record, "created_by_user_id", None)
                or getattr(record, "recorded_by", None)
            )
        if assigned_id != user.id and created_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Record is assigned to another advisor",
            )
        return

    if user.role == "Telecaller":
        # Telecallers have full access to manage sellers and properties in CRM
        model_name = getattr(record, "__tablename__", "")
        if model_name in ("sellers", "properties"):
            return

        created_id = (
            getattr(record, "created_by_user_id", None)
            or (getattr(record, creator_field, None) if creator_field else None)
            or getattr(record, "created_by", None)
        )
        if created_id == user.id:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Telecallers can only access records they submitted or are authorized to manage",
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied: Insufficient privileges",
    )


def check_reassignment_permission(
    updates: Any,
    user: User,
    reassignment_fields: tuple = ("assigned_agent_id", "assigned_to", "agent_id"),
) -> None:
    """
    Enforce that only Admins can assign or reassign records to another agent.
    Agents and Telecallers cannot change ownership fields.
    """
    if getattr(user, "role", "") == "Admin":
        return

    fields_present = []
    if isinstance(updates, dict):
        fields_present = [f for f in reassignment_fields if f in updates and updates[f] is not None]
    elif hasattr(updates, "model_fields_set"):
        fields_present = [
            f for f in reassignment_fields
            if f in updates.model_fields_set and getattr(updates, f, None) is not None
        ]
    elif hasattr(updates, "__dict__"):
        fields_present = [f for f in reassignment_fields if getattr(updates, f, None) is not None]

    if fields_present:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Only administrators can assign or reassign records",
        )

