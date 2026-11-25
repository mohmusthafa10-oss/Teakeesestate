'''Property schemas for FastAPI endpoints.

These schemas use Pydantic v2 (BaseModel) and map to the Property model fields.
Only fields relevant to the API are exposed; internal notes and demo flags are omitted
from public responses.  Separate schemas are used for creation, update and read
operations, as well as for specific actions such as assignment, approval and
publishing.
''' 

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, validator

# ---------------------------------------------------------------------------
# Shared base schema – common fields for read/write operations
# ---------------------------------------------------------------------------
class PropertyBase(BaseModel):
    code: Optional[str] = Field(None, description="Unique property code, generated if omitted")
    title: str = Field(..., description="Property title / headline")
    type: str = Field(..., description="Property type, e.g. House, Land")
    category: str = Field(..., description="Property category, e.g. Residential")
    district: str = Field(..., description="District / region name")
    panchayath: Optional[str] = Field(None, description="Local panchayath name")
    locality: Optional[str] = Field(None, description="Neighbourhood or locality")
    full_address: Optional[str] = Field(None, description="Full textual address")
    area_value: Decimal = Field(..., description="Size of the plot / built‑up area")
    area_unit: str = Field(..., description="Unit for area – Cents, Sq.ft, Acres")
    expected_price: Decimal = Field(..., description="Seller's expected price")
    description: Optional[str] = Field(None, description="Free‑form description")
    seller_id: Optional[str] = Field(None, description="FK to Seller if known")
    assigned_agent_id: Optional[str] = Field(None, description="FK to Agent handling the property")
    status: Optional[str] = Field(None, description="Current property status from PropertyStatus enum")
    listed_date: Optional[date] = Field(None, description="Date when property was listed")
    latitude: Optional[float] = Field(None, description="Latitude for map location")
    longitude: Optional[float] = Field(None, description="Longitude for map location")

    @validator("area_value", "expected_price", mode="before")
    def ensure_decimal(cls, v):
        return Decimal(str(v)) if v is not None else v

# ---------------------------------------------------------------------------
# Create schema – all fields required except optional FK / metadata
# ---------------------------------------------------------------------------
class PropertyCreate(PropertyBase):
    pass

# ---------------------------------------------------------------------------
# Update schema – all fields optional; partial updates allowed
# ---------------------------------------------------------------------------
class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    district: Optional[str] = None
    panchayath: Optional[str] = None
    locality: Optional[str] = None
    full_address: Optional[str] = None
    area_value: Optional[Decimal] = None
    area_unit: Optional[str] = None
    expected_price: Optional[Decimal] = None
    description: Optional[str] = None
    seller_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    status: Optional[str] = None
    listed_date: Optional[date] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @validator("area_value", "expected_price", mode="before")
    def ensure_decimal(cls, v):
        return Decimal(str(v)) if v is not None else v

# ---------------------------------------------------------------------------
# Read schema – what the API returns to callers
# ---------------------------------------------------------------------------
class PropertyRead(PropertyBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_published: bool = Field(False, description="Publication flag from PropertyPublication")
    approval_status: Optional[str] = Field(None, description="Current submission approval workflow status")

    class Config:
        from_attributes = True

# ---------------------------------------------------------------------------
# Action‑specific schemas
# ---------------------------------------------------------------------------
class PropertyAssign(BaseModel):
    assigned_agent_id: str = Field(..., description="User ID of the agent to assign the property to")

class PropertyApprove(BaseModel):
    comment: Optional[str] = Field(None, description="Optional comment for the approval action")

class PropertyReject(BaseModel):
    reason: str = Field(..., description="Reason for rejecting the submission")

class PropertyPublish(BaseModel):
    publish: bool = Field(..., description="True to publish, False to unpublish")

class PropertyHistoryEntry(BaseModel):
    timestamp: datetime
    action: str
    performed_by: Optional[str] = None
    details: Optional[dict] = None

    class Config:
        from_attributes = True

# ---------------------------------------------------------------------------
# Pagination wrapper – used by list endpoint
# ---------------------------------------------------------------------------
class PaginatedProperties(BaseModel):
    total: int
    page: int
    size: int
    items: List[PropertyRead]

    class Config:
        from_attributes = True
