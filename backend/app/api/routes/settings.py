import json
from typing import Any, Dict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, require_admin
from app.database.session import get_db
from app.models.models import AgencySetting, User

router = APIRouter(prefix="/api/settings", tags=["Settings"])

DEFAULT_SETTINGS = {
    "agencyName": "Teakees Real Estate",
    "agencyTagline": "Exclusive Properties & Prime Land Holdings",
    "currencySymbol": "₹",
    "defaultCommissionRate": 2.0,
    "propertyCategories": ["Land", "House", "Apartment", "Villa", "Shop", "Resort"],
    "propertyCategoryGroups": ["Residential", "Commercial", "Plantation", "Agricultural", "Development", "Resort"],
    "leadSources": ["Instagram", "Facebook", "WhatsApp", "Website", "Referral", "Walk-in", "Phone Call", "Advertisement", "Existing Customer", "Other"],
}

@router.get("")
def get_settings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    setting = db.query(AgencySetting).filter(AgencySetting.key == "app_settings").first()
    if setting and setting.value:
        try:
            return json.loads(setting.value)
        except Exception:
            pass
    return DEFAULT_SETTINGS

@router.put("")
def update_settings(
    settings_data: Dict[str, Any],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    setting = db.query(AgencySetting).filter(AgencySetting.key == "app_settings").first()
    if not setting:
        setting = AgencySetting(key="app_settings", value=json.dumps(settings_data))
        db.add(setting)
    else:
        setting.value = json.dumps(settings_data)
    db.commit()
    return settings_data

