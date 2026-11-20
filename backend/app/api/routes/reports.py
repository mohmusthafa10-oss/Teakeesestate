from typing import Any, Dict, List
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database.session import get_db
from app.models.models import Deal, Lead, Property, User

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/properties")
def property_report(
    current_user: User = Depends(require_permission("reports.read")),
    db: Session = Depends(get_db),
):
    type_counts = db.query(Property.type, func.count(Property.id)).group_by(Property.type).all()
    cat_counts = db.query(Property.category, func.count(Property.id)).group_by(Property.category).all()
    status_counts = db.query(Property.status, func.count(Property.id)).group_by(Property.status).all()
    dist_counts = db.query(Property.district, func.count(Property.id)).group_by(Property.district).all()

    return {
        "by_type": [{"type": t, "count": c} for t, c in type_counts],
        "by_category": [{"category": cat, "count": c} for cat, c in cat_counts],
        "by_status": [{"status": s, "count": c} for s, c in status_counts],
        "by_district": [{"district": d, "count": c} for d, c in dist_counts],
    }

@router.get("/leads")
def lead_report(
    current_user: User = Depends(require_permission("reports.read")),
    db: Session = Depends(get_db),
):
    source_counts = db.query(Lead.lead_source, func.count(Lead.id)).group_by(Lead.lead_source).all()
    status_counts = db.query(Lead.status, func.count(Lead.id)).group_by(Lead.status).all()

    return {
        "by_source": [{"source": s, "count": c} for s, c in source_counts],
        "by_status": [{"status": st, "count": c} for st, c in status_counts],
    }

@router.get("/sales")
def sales_report(
    current_user: User = Depends(require_permission("reports.read")),
    db: Session = Depends(get_db),
):
    deals = db.query(Deal).filter(Deal.status == "Closed").all()
    total_sales = sum(d.agreed_price for d in deals)
    total_commission = sum(d.commission_amount for d in deals)

    return {
        "closed_deals_count": len(deals),
        "total_sales_volume": total_sales,
        "total_commission": total_commission,
        "deals": deals,
    }

