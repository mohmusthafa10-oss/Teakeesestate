from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_permission
from app.database.session import get_db
from app.models.models import User
from app.schemas.schemas import CombinedRegistrationRequest, CombinedRegistrationResponse
from app.services.services import register_seller_and_property

router = APIRouter(prefix="/api/registration", tags=["Registration"])

@router.post("/seller-property", response_model=CombinedRegistrationResponse, status_code=status.HTTP_201_CREATED)
def combined_registration(
    data: CombinedRegistrationRequest,
    current_user: User = Depends(require_permission("properties.create")),
    db: Session = Depends(get_db),
):
    try:
        res = register_seller_and_property(db, data, current_user.id)
        return CombinedRegistrationResponse(
            seller=res["seller"],
            property=res["property"],
            advance=res.get("advance"),
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration transaction failed: {str(e)}")

