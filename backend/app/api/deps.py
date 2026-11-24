from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional

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
    return user

# Optional authentication for public endpoints (no error on missing/invalid token)
def get_current_user_optional(token: str = Depends(OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)), db: Session = Depends(get_db)) -> Optional[User]:
    """Return the current user if a valid token is provided, otherwise None."""
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
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.active:
        raise HTTPException(status_code=400, detail="Inactive user")
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
