import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_permission
from app.core.permissions import Permission
from app.database.session import get_db
from app.models.models import Property, RentalBooking, User
from app.schemas.schemas import RentalBookingCreate, RentalBookingResponse, RentalBookingUpdate
from app.services.services import generate_sequential_code, log_activity

router = APIRouter(prefix="/api/rentals", tags=["Stay & Rentals"])

@router.get("", response_model=List[RentalBookingResponse])
def get_rentals(
    property_id: Optional[str] = None,
    current_user: User = Depends(require_permission(Permission.RENTALS_READ.value)),
    db: Session = Depends(get_db),
):
    query = db.query(RentalBooking)
    if property_id:
        query = query.filter(RentalBooking.property_id == property_id)
    return query.order_by(RentalBooking.check_in.desc()).all()

@router.post("", response_model=RentalBookingResponse, status_code=status.HTTP_201_CREATED)
def create_rental_booking(
    data: RentalBookingCreate,
    current_user: User = Depends(require_permission(Permission.RENTALS_CREATE.value)),
    db: Session = Depends(get_db),
):
    if current_user.role == "Agent":
        prop = db.query(Property).filter(Property.id == data.property_id).first()
        if prop and prop.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot book rental for another agent's property",
            )
    code = generate_sequential_code(db, "RNT", pad=4, start=1001)
    booking = RentalBooking(
        id=str(uuid.uuid4()),
        code=code,
        property_id=data.property_id,
        tenant_id=data.tenant_id,
        rental_type=data.rental_type,
        rate_amount=data.rate_amount,
        booking_date=data.booking_date,
        check_in=data.check_in,
        check_out=data.check_out,
        deposit=data.deposit,
        contract_ref=data.contract_ref or "",
        income_received=data.income_received,
        status=data.status,
        maintenance_notes=data.maintenance_notes or "",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking

@router.put("/{id}", response_model=RentalBookingResponse)
def update_rental_booking(
    id: str,
    data: RentalBookingUpdate,
    current_user: User = Depends(require_permission(Permission.RENTALS_UPDATE.value)),
    db: Session = Depends(get_db),
):
    booking = db.query(RentalBooking).filter(RentalBooking.id == id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current_user.role == "Agent":
        prop = db.query(Property).filter(Property.id == booking.property_id).first()
        if prop and prop.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Rental booking is for another agent's property",
            )
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(booking, k, v)
    db.commit()
    db.refresh(booking)
    return booking

@router.delete("/{id}", response_model=dict)
def delete_rental_booking(
    id: str,
    current_user: User = Depends(require_permission(Permission.RENTALS_DELETE.value)),
    db: Session = Depends(get_db),
):
    booking = db.query(RentalBooking).filter(RentalBooking.id == id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current_user.role == "Agent":
        prop = db.query(Property).filter(Property.id == booking.property_id).first()
        if prop and prop.assigned_agent_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Rental booking is for another agent's property",
            )
    log_activity(
        db,
        "Rental",
        booking.id,
        "Deleted",
        f"Deleted rental booking {booking.code}",
        current_user.id,
    )
    db.delete(booking)
    db.commit()
    return {"detail": "Rental booking deleted successfully", "id": id}


