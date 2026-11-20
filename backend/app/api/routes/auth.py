from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.rate_limiter import login_limiter
from app.core.security import create_access_token, create_refresh_token, decode_token, get_password_hash
from app.database.session import get_db
from app.models.models import User
from app.schemas.schemas import ChangePasswordRequest, ProfileUpdate, RefreshTokenRequest, TokenResponse, UserResponse
from app.services.services import authenticate_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    ip_addr = login_limiter.get_client_ip(request)
    email_key = form_data.username.strip().lower()

    # Rate limit check by client IP and account email
    login_limiter.check_rate_limit(ip_addr)
    login_limiter.check_rate_limit(email_key)

    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        login_limiter.record_failure(ip_addr)
        login_limiter.record_failure(email_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Successful login: reset failure counters
    login_limiter.reset_failures(ip_addr)
    login_limiter.reset_failures(email_key)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.id,
        extra_claims={"role": user.role, "email": user.email},
        expires_delta=access_token_expires,
    )
    refresh_token = create_refresh_token(subject=user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )

@router.post("/refresh")
def refresh_token(req: RefreshTokenRequest, db: Session = Depends(get_db)):
    from app.core.token_registry import token_registry

    try:
        payload = decode_token(req.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=400, detail="Invalid token type")

        user_id = payload.get("sub")
        jti = payload.get("jti")
        family_id = payload.get("family")

        # Reuse Detection: If token was already revoked, family is compromised!
        if jti and token_registry.is_token_revoked(jti, family_id):
            if family_id:
                token_registry.revoke_family(family_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Security Alert: Compromised or reused refresh token. All active sessions in family revoked."
            )

        # Invalidate current token and rotate
        if jti:
            token_registry.revoke_token(jti)

        user = db.query(User).filter(User.id == user_id, User.active == True).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        new_access_token = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role, "email": user.email},
        )
        new_refresh_token = create_refresh_token(subject=user.id, family_id=family_id)

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_active_user)):
    return current_user

@router.put("/profile", response_model=UserResponse)
def update_current_user_profile(
    req: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if req.name is not None:
        current_user.name = req.name
    if req.phone is not None:
        current_user.phone = req.phone
    if req.designation is not None:
        current_user.designation = req.designation
    if req.password:
        current_user.password_hash = get_password_hash(req.password)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/logout")
def logout():
    return {"message": "Logged out successfully"}

