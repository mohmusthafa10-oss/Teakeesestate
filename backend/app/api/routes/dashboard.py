from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user
from app.database.session import get_db
from app.models.models import ActivityLog, User
from app.schemas.schemas import ActivityLogResponse, DashboardSummary
from app.services.services import get_dashboard_summary

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    return get_dashboard_summary(db, current_user.id, current_user.role)

@router.get("/activities", response_model=List[ActivityLogResponse])
def recent_activities(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    return db.query(ActivityLog).order_by(ActivityLog.timestamp.desc()).limit(25).all()

