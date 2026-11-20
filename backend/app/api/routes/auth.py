from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.database.session import get_db
from app.models.models import User
from app.schemas.schemas import RefreshTokenRequest, TokenResponse, UserResponse
from app.services.services import authenticate_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
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
    try:
        payload = decode_token(req.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=400, detail="Invalid token type")
        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == user_id, User.active == True).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        new_access_token = create_access_token(
            subject=user.id,
            extra_claims={"role": user.role, "email": user.email},
        )
        return {"access_token": new_access_token, "token_type": "bearer"}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_active_user)):
    return current_user

@router.post("/logout")
def logout():
    return {"message": "Logged out successfully"}

