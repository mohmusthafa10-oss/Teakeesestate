from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.security import get_password_hash
from app.database.session import get_db
from app.models.models import User
from app.schemas.schemas import UserCreate, UserResponse, UserUpdate
from app.services.services import create_user, list_users

router = APIRouter(prefix="/api/users", tags=["Users (Admin Only)"])

@router.get("", response_model=List[UserResponse])
def get_all_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return list_users(db)

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def add_new_user(
    data: UserCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    return create_user(db, data)

@router.put("/{id}", response_model=UserResponse)
def update_user(
    id: str,
    data: UserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        user.password_hash = get_password_hash(update_data.pop("password"))
    for k, v in update_data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user

