import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_admin, require_permission
from app.database.session import get_db
from app.models.models import Investment, Investor, SellerAdvance, User
from app.schemas.schemas import (
    InvestmentCreate,
    InvestmentResponse,
    InvestmentUpdate,
    SellerAdvanceCreate,
    SellerAdvanceResponse,
    SellerAdvanceUpdate,
)
from app.services.services import generate_sequential_code, list_advances, update_advance_status

router = APIRouter(prefix="/api/finance", tags=["Finance"])

# ==================== ADVANCES ====================
@router.get("/advances", response_model=List[SellerAdvanceResponse])
def get_advances(
    seller_id: Optional[str] = None,
    property_id: Optional[str] = None,
    current_user: User = Depends(require_permission("finance.read")),
    db: Session = Depends(get_db),
):
    return list_advances(db, seller_id, property_id)

@router.post("/advances", response_model=SellerAdvanceResponse, status_code=status.HTTP_201_CREATED)
def add_advance(
    data: SellerAdvanceCreate,
    current_user: User = Depends(require_permission("finance.manage")),
    db: Session = Depends(get_db),
):
    code = generate_sequential_code(db, "ADV", pad=4, start=1001)
    adv = SellerAdvance(
        id=str(uuid.uuid4()),
        code=code,
        seller_id=data.seller_id,
        property_id=data.property_id,
        amount=data.amount,
        collection_date=data.collection_date,
        payment_method=data.payment_method,
        transaction_reference=data.transaction_reference or "",
        remarks=data.remarks or "",
        status=data.status,
        recorded_by=current_user.id,
    )
    db.add(adv)
    db.commit()
    db.refresh(adv)
    return adv

@router.put("/advances/{id}", response_model=SellerAdvanceResponse)
def update_advance(
    id: str,
    data: SellerAdvanceUpdate,
    current_user: User = Depends(require_permission("finance.manage")),
    db: Session = Depends(get_db),
):
    adv = update_advance_status(db, id, data, current_user.id)
    if not adv:
        raise HTTPException(status_code=404, detail="Advance not found")
    return adv

# ==================== INVESTMENTS ====================
@router.get("/investments", response_model=List[InvestmentResponse])
def get_investments(
    current_user: User = Depends(require_permission("finance.read")),
    db: Session = Depends(get_db),
):
    invs = db.query(Investment).order_by(Investment.investment_date.desc()).all()
    for inv in invs:
        total_deployed = inv.investment_amount + (inv.additional_expenses or 0)
        net_profit = inv.actual_return - total_deployed if inv.actual_return else 0
        inv.roi = round((net_profit / total_deployed * 100), 2) if total_deployed > 0 else 0
    return invs

@router.post("/investments", response_model=InvestmentResponse, status_code=status.HTTP_201_CREATED)
def add_investment(
    data: InvestmentCreate,
    current_user: User = Depends(require_permission("finance.manage")),
    db: Session = Depends(get_db),
):
    code = generate_sequential_code(db, "INV", pad=4, start=1001)
    inv = Investment(
        id=str(uuid.uuid4()),
        code=code,
        property_id=data.property_id,
        investor_id=data.investor_id,
        investment_amount=data.investment_amount,
        additional_expenses=data.additional_expenses,
        expected_return=data.expected_return,
        actual_return=data.actual_return,
        investment_date=data.investment_date,
        duration_months=data.duration_months,
        status=data.status,
        notes=data.notes or "",
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    total_deployed = inv.investment_amount + (inv.additional_expenses or 0)
    net_profit = inv.actual_return - total_deployed if inv.actual_return else 0
    inv.roi = round((net_profit / total_deployed * 100), 2) if total_deployed > 0 else 0
    return inv

