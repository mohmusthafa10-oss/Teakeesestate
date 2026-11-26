from datetime import date, datetime
from decimal import Decimal
from typing import Generic, List, Optional, TypeVar, Any
from pydantic import BaseModel, ConfigDict, EmailStr, Field, constr

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: constr(min_length=8)

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

# ==================== USERS ====================
class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str = "Agent"
    designation: Optional[str] = "Property Advisor"
    active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    designation: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== SELLERS ====================
class SellerBase(BaseModel):
    name: str
    phone: str
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    relationship_with_property: str = "Owner"
    notes: Optional[str] = ""
    assigned_agent_id: Optional[str] = None

class SellerCreate(SellerBase):
    pass

class SellerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    relationship_with_property: Optional[str] = None
    notes: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    last_contacted_date: Optional[str] = None
    last_contact_method: Optional[str] = None
    last_conversation_notes: Optional[str] = None

class SellerResponse(SellerBase):
    id: str
    code: str
    last_contacted_date: Optional[Any] = None
    last_contact_method: Optional[str] = None
    last_conversation_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== PROPERTY IMAGES & DOCS ====================
class PropertyImageCreate(BaseModel):
    url: str
    caption: Optional[str] = ""
    is_primary: bool = False
    media_type: str = "photo"
    mime_type: Optional[str] = None

class PropertyImageResponse(BaseModel):
    id: str
    property_id: str
    url: str
    caption: Optional[str] = ""
    is_primary: bool
    media_type: str = "photo"
    mime_type: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PropertyDocumentCreate(BaseModel):
    entity_type: str = "Property"
    name: str
    doc_type: str = "Document"
    file_size: Optional[str] = "0 KB"
    notes: Optional[str] = ""

class PropertyDocumentResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    name: str
    doc_type: str
    file_size: Optional[str] = None
    uploaded_at: datetime
    notes: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# ==================== PRICE HISTORY ====================
class PriceHistoryCreate(BaseModel):
    previous_expected_price: Decimal
    new_expected_price: Decimal
    previous_market_price: Optional[Decimal] = None
    new_market_price: Optional[Decimal] = None
    note: Optional[str] = None

class PriceHistoryResponse(BaseModel):
    id: str
    property_id: str
    previous_expected_price: Decimal
    new_expected_price: Decimal
    previous_market_price: Optional[Decimal] = None
    new_market_price: Optional[Decimal] = None
    updated_by: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== PROPERTIES ====================
class PropertyBase(BaseModel):
    title: str
    type: str = "Land"
    category: str = "Residential"
    district: str
    panchayath: str
    locality: str
    full_address: Optional[str] = None
    google_maps_url: Optional[str] = None
    area_value: Decimal
    area_unit: str = "Cents"
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    road_connectivity: Optional[str] = "Tar Road Access"
    distance_to_highway: Optional[str] = None
    nearby_landmarks: Optional[str] = None
    water_availability: Optional[str] = None
    terrain: Optional[str] = None
    frontage: Optional[str] = None
    electricity: Optional[str] = None
    boundary_details: Optional[str] = None
    other_features: Optional[str] = None
    expected_price: Decimal
    market_price: Optional[Decimal] = None
    description: str
    seller_relationship: Optional[str] = "Owner"
    status: str = "Available"
    running_category: Optional[str] = "Active Listing"
    is_managed: bool = False
    assigned_agent_id: Optional[str] = None
    internal_notes: Optional[str] = ""
    next_follow_up_date: Optional[Any] = None
    listed_date: Optional[Any] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy: Optional[str] = None
    is_demo_data: bool = False

class PropertyCreate(PropertyBase):
    seller_id: str
    images: Optional[List[PropertyImageCreate]] = []
    documents: Optional[List[PropertyDocumentCreate]] = []

class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    district: Optional[str] = None
    panchayath: Optional[str] = None
    locality: Optional[str] = None
    full_address: Optional[str] = None
    google_maps_url: Optional[str] = None
    area_value: Optional[Decimal] = None
    area_unit: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    road_connectivity: Optional[str] = None
    distance_to_highway: Optional[str] = None
    nearby_landmarks: Optional[str] = None
    water_availability: Optional[str] = None
    terrain: Optional[str] = None
    frontage: Optional[str] = None
    electricity: Optional[str] = None
    boundary_details: Optional[str] = None
    other_features: Optional[str] = None
    expected_price: Optional[Decimal] = None
    market_price: Optional[Decimal] = None
    description: Optional[str] = None
    seller_relationship: Optional[str] = None
    status: Optional[str] = None
    running_category: Optional[str] = None
    is_managed: Optional[bool] = None
    assigned_agent_id: Optional[str] = None
    internal_notes: Optional[str] = None
    next_follow_up_date: Optional[Any] = None
    listed_date: Optional[Any] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_accuracy: Optional[str] = None

class PropertyResponse(PropertyBase):
    id: str
    code: str
    seller_id: Optional[str] = None
    added_date: Optional[Any] = None
    created_at: datetime
    updated_at: datetime
    seller: Optional[SellerResponse] = None
    images: Optional[List[PropertyImageResponse]] = []
    documents: Optional[List[PropertyDocumentResponse]] = []
    price_history: Optional[List[PriceHistoryResponse]] = []
    days_listed: Optional[int] = 0
    model_config = ConfigDict(from_attributes=True)

# ==================== ADVANCES ====================
class SellerAdvanceCreate(BaseModel):
    seller_id: Optional[str] = None
    property_id: Optional[str] = None
    amount: Decimal
    collection_date: Optional[Any] = None
    payment_method: str = "UPI"
    transaction_reference: Optional[str] = ""
    remarks: Optional[str] = ""
    status: str = "Collected"

class SellerAdvanceUpdate(BaseModel):
    status: Optional[str] = None
    refund_amount: Optional[Decimal] = None
    refund_date: Optional[Any] = None
    adjusted_deal_id: Optional[str] = None
    remarks: Optional[str] = None

class SellerAdvanceResponse(BaseModel):
    id: str
    code: str
    seller_id: str
    property_id: str
    amount: Decimal
    collection_date: Optional[Any] = None
    payment_method: str
    transaction_reference: Optional[str] = None
    status: str
    refund_amount: Optional[Decimal] = None
    refund_date: Optional[Any] = None
    adjusted_deal_id: Optional[str] = None
    remarks: Optional[str] = None
    recorded_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== COMBINED REGISTRATION ====================
class CombinedAdvanceInput(BaseModel):
    amount: Decimal
    collection_date: Optional[Any] = None
    payment_method: str = "UPI"
    transaction_reference: Optional[str] = ""
    remarks: Optional[str] = ""

class CombinedRegistrationRequest(BaseModel):
    mode: str = "new-seller"  # "new-seller" or "existing-seller"
    existing_seller_id: Optional[str] = None
    seller: Optional[SellerCreate] = None
    property: PropertyCreate
    advance: Optional[CombinedAdvanceInput] = None

class CombinedRegistrationResponse(BaseModel):
    seller: SellerResponse
    property: PropertyResponse
    advance: Optional[SellerAdvanceResponse] = None

# ==================== LEADS ====================
class LeadBase(BaseModel):
    name: str
    phone: str
    whatsapp: Optional[str] = None
    email: Optional[EmailStr] = None
    lead_source: str = "Website"
    preferred_district: Optional[str] = None
    preferred_panchayath: Optional[str] = None
    preferred_locality: Optional[str] = None
    min_budget: Decimal = Decimal(0)
    max_budget: Decimal = Decimal(0)
    property_type: str = "Any"
    property_category: Optional[str] = "Any"
    requirement_description: Optional[str] = ""
    status: str = "New"
    assigned_agent_id: Optional[str] = None
    next_follow_up_date: Optional[Any] = None
    notes: Optional[str] = ""
    conversion_details: Optional[str] = None

class LeadCreate(LeadBase):
    pass

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[EmailStr] = None
    lead_source: Optional[str] = None
    preferred_district: Optional[str] = None
    preferred_panchayath: Optional[str] = None
    preferred_locality: Optional[str] = None
    min_budget: Optional[Decimal] = None
    max_budget: Optional[Decimal] = None
    property_type: Optional[str] = None
    property_category: Optional[str] = None
    requirement_description: Optional[str] = None
    status: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    next_follow_up_date: Optional[Any] = None
    last_contacted_date: Optional[str] = None
    last_contact_method: Optional[str] = None
    last_conversation_notes: Optional[str] = None
    notes: Optional[str] = None
    conversion_details: Optional[str] = None

class LeadResponse(LeadBase):
    id: str
    code: str
    last_contacted_date: Optional[Any] = None
    last_contact_method: Optional[str] = None
    last_conversation_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== MATCHES ====================
class PropertyMatchCreate(BaseModel):
    lead_id: str
    property_id: str
    match_score: int = 50
    match_reasons: Optional[str] = "[]"
    buyer_interest: str = "Pending"
    outcome: str = "Open"
    notes: Optional[str] = ""

class PropertyMatchUpdate(BaseModel):
    buyer_interest: Optional[str] = None
    site_visit_scheduled: Optional[bool] = None
    outcome: Optional[str] = None
    is_shared: Optional[bool] = None
    notes: Optional[str] = None

class PropertyMatchResponse(BaseModel):
    id: str
    lead_id: str
    property_id: str
    match_score: int
    match_reasons: Optional[str] = None
    matched_at: Optional[str] = None
    shared_at: Optional[str] = None
    is_shared: bool
    buyer_interest: str
    site_visit_scheduled: bool
    outcome: str
    notes: Optional[str] = None
    property: Optional[PropertyResponse] = None
    lead: Optional[LeadResponse] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== FOLLOW-UPS ====================
class FollowUpBase(BaseModel):
    title: str
    related_type: str = "Lead"  # "Lead" or "Seller"
    related_id: str
    property_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    date: date
    time: str = "10:00"
    activity_type: str = "Call"
    notes: Optional[str] = ""
    status: str = "Pending"

class FollowUpCreate(FollowUpBase):
    pass

class FollowUpUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[date] = None
    time: Optional[str] = None
    activity_type: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    completed_at: Optional[datetime] = None

class FollowUpCompleteRequest(BaseModel):
    notes: Optional[str] = ""
    create_next_follow_up: bool = False
    next_date: Optional[date] = None
    next_time: Optional[str] = "10:00"
    next_notes: Optional[str] = ""

class FollowUpResponse(FollowUpBase):
    id: str
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== SITE VISITS ====================
class SiteVisitBase(BaseModel):
    property_id: str
    lead_id: str
    agent_id: Optional[str] = None
    scheduled_date: date
    scheduled_time: str = "10:00"
    meeting_location: Optional[str] = None
    status: str = "Scheduled"
    feedback: Optional[str] = ""
    visit_outcome: Optional[str] = None

class SiteVisitCreate(SiteVisitBase):
    pass

class SiteVisitUpdate(BaseModel):
    status: Optional[str] = None
    feedback: Optional[str] = None
    visit_outcome: Optional[str] = None
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[str] = None

class SiteVisitResponse(SiteVisitBase):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== DEALS ====================
class DealBase(BaseModel):
    deal_type: str = "Sale"
    lead_id: str
    seller_id: str
    property_id: str
    assigned_agent_id: Optional[str] = None
    agreed_price: Decimal
    commission_rate: Decimal = Decimal(2.0)
    commission_amount: Decimal
    deal_date: date
    closing_date: Optional[date] = None
    status: str = "Negotiation"
    notes: Optional[str] = ""

class DealCreate(DealBase):
    pass

class DealUpdate(BaseModel):
    status: Optional[str] = None
    agreed_price: Optional[Decimal] = None
    commission_rate: Optional[Decimal] = None
    commission_amount: Optional[Decimal] = None
    closing_date: Optional[date] = None
    notes: Optional[str] = None

class DealResponse(DealBase):
    id: str
    code: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== INVESTMENTS ====================
class InvestmentBase(BaseModel):
    property_id: str
    investor_id: str
    investment_amount: Decimal
    additional_expenses: Decimal = Decimal(0)
    expected_return: Decimal = Decimal(0)
    actual_return: Decimal = Decimal(0)
    investment_date: date
    duration_months: int = 12
    status: str = "Active"
    notes: Optional[str] = ""

class InvestmentCreate(InvestmentBase):
    pass

class InvestmentUpdate(BaseModel):
    actual_return: Optional[Decimal] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class InvestmentResponse(InvestmentBase):
    id: str
    code: str
    roi: Optional[Decimal] = Decimal(0)
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== RENTALS ====================
class RentalBookingBase(BaseModel):
    property_id: str
    tenant_id: Optional[str] = None
    rental_type: str = "Daily Stay"
    rate_amount: Decimal
    booking_date: date
    check_in: date
    check_out: date
    deposit: Decimal = Decimal(0)
    contract_ref: Optional[str] = ""
    income_received: Decimal = Decimal(0)
    status: str = "Booked"
    maintenance_notes: Optional[str] = ""

class RentalBookingCreate(RentalBookingBase):
    pass

class RentalBookingUpdate(BaseModel):
    status: Optional[str] = None
    income_received: Optional[Decimal] = None
    maintenance_notes: Optional[str] = None

class RentalBookingResponse(RentalBookingBase):
    id: str
    code: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ==================== DASHBOARD & ACTIVITIES ====================
class ActivityLogResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    summary: str
    actor_id: Optional[str] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class DashboardSummary(BaseModel):
    total_properties: int
    available_properties: int
    running_properties: int
    total_sellers: int
    total_leads: int
    follow_ups_today: int
    overdue_follow_ups: int
    active_deals: int
    total_sales_volume: Decimal
    total_commission_earned: Decimal
    property_breakdown: List[dict]
    lead_pipeline: List[dict]
    recent_properties: List[PropertyResponse]
    recent_leads: List[LeadResponse]
    recent_activities: List[ActivityLogResponse]

