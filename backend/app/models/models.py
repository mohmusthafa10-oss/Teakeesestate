import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


def generate_uuid() -> str:
    """Generate a string representation of a UUID4 for primary keys."""
    return str(uuid.uuid4())


# ============================================================================
# Enums / Constants (Stored as Strings in Database for SQLite compatibility)
# ============================================================================

class UserRole(str, Enum):
    ADMIN = "Admin"
    AGENT = "Agent"


class SellerRelationship(str, Enum):
    OWNER = "Owner"
    CO_OWNER = "Co-owner"
    RELATIVE = "Relative"
    POWER_OF_ATTORNEY_HOLDER = "Power of Attorney Holder"
    BROKER_AGENT = "Broker Agent"
    AUTHORIZED_REPRESENTATIVE = "Authorized Representative"
    OTHER = "Other"


class PropertyType(str, Enum):
    LAND = "Land"
    HOUSE = "House"
    APARTMENT = "Apartment"
    VILLA = "Villa"
    SHOP = "Shop"
    RESORT = "Resort"


class PropertyCategory(str, Enum):
    RESIDENTIAL = "Residential"
    COMMERCIAL = "Commercial"
    PLANTATION = "Plantation"
    AGRICULTURAL = "Agricultural"
    DEVELOPMENT = "Development"
    RESORT = "Resort"


class AreaUnit(str, Enum):
    CENTS = "Cents"
    SQ_FT = "Sq.ft"
    ACRES = "Acres"


class PropertyStatus(str, Enum):
    AVAILABLE = "Available"
    UNDER_NEGOTIATION = "Under Negotiation"
    RESERVED = "Reserved"
    SOLD = "Sold"
    RENTED = "Rented"
    INACTIVE = "Inactive"


class PaymentMethod(str, Enum):
    CASH = "Cash"
    UPI = "UPI"
    BANK_TRANSFER = "Bank Transfer"
    CHEQUE = "Cheque"
    OTHER = "Other"


class AdvanceStatus(str, Enum):
    COLLECTED = "Collected"
    ADJUSTED = "Adjusted"
    REFUNDED = "Refunded"
    PARTIALLY_REFUNDED = "Partially Refunded"


class LeadStatus(str, Enum):
    NEW = "New"
    CONTACTED = "Contacted"
    QUALIFIED = "Qualified"
    PROPERTY_SHARED = "Property Shared"
    SITE_VISIT = "Site Visit"
    NEGOTIATION = "Negotiation"
    CONVERTED = "Converted"
    LOST = "Lost"
    ON_HOLD = "On Hold"


class BuyerInterest(str, Enum):
    PENDING = "Pending"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    REJECTED = "Rejected"


class MatchOutcome(str, Enum):
    OPEN = "Open"
    SHORTLISTED = "Shortlisted"
    SITE_VISIT_DONE = "Site Visit Done"
    NEGOTIATING = "Negotiating"
    DEAL_CREATED = "Deal Created"
    DECLINED = "Declined"


class FollowUpActivityType(str, Enum):
    CALL = "Call"
    WHATSAPP = "WhatsApp"
    MEETING = "Meeting"
    SITE_VISIT = "Site Visit"
    EMAIL = "Email"
    OTHER = "Other"


class FollowUpStatus(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"


class SiteVisitStatus(str, Enum):
    SCHEDULEED = "Scheduled"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    RESCHEDULED = "Rescheduled"
    NO_SHOW = "No Show"


class DealType(str, Enum):
    SALE = "Sale"
    RENTAL = "Rental"


class DealStatus(str, Enum):
    INTERESTED = "Interested"
    SITE_VISIT = "Site Visit"
    NEGOTIATION = "Negotiation"
    BOOKING = "Booking"
    CLOSED = "Closed"
    CANCELLED = "Cancelled"
    LOST = "Lost"


class InvestmentStatus(str, Enum):
    ACTIVE = "Active"
    COMPLETED = "Completed"
    PENDING = "Pending"


class RentalType(str, Enum):
    DAILY_STAY = "Daily Stay"
    MONTHLY = "Monthly"
    YEARLY = "Yearly"


class RentalStatus(str, Enum):
    AVAILABLE = "Available"
    BOOKED = "Booked"
    OCCUPIED = "Occupied"
    MAINTENANCE = "Maintenance"
    VACANT = "Vacant"


# ============================================================================
# SQLAlchemy 2.0 Models
# ============================================================================

class User(Base, TimestampMixin):
    """User account model for Admins and Agents."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default=UserRole.AGENT.value, nullable=False)
    designation: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    properties: Mapped[List["Property"]] = relationship(
        "Property",
        back_populates="assigned_agent",
        foreign_keys="Property.assigned_agent_id",
    )
    sellers: Mapped[List["Seller"]] = relationship(
        "Seller",
        back_populates="assigned_agent",
        foreign_keys="Seller.assigned_agent_id",
    )
    leads: Mapped[List["Lead"]] = relationship(
        "Lead",
        back_populates="assigned_agent",
        foreign_keys="Lead.assigned_agent_id",
    )
    follow_ups: Mapped[List["FollowUp"]] = relationship(
        "FollowUp",
        back_populates="assigned_agent",
        foreign_keys="FollowUp.assigned_agent_id",
    )
    site_visits: Mapped[List["SiteVisit"]] = relationship(
        "SiteVisit",
        back_populates="agent",
        foreign_keys="SiteVisit.agent_id",
    )
    deals: Mapped[List["Deal"]] = relationship(
        "Deal",
        back_populates="assigned_agent",
        foreign_keys="Deal.assigned_agent_id",
    )
    price_histories: Mapped[List["PriceHistory"]] = relationship(
        "PriceHistory",
        back_populates="updated_by_user",
        foreign_keys="PriceHistory.updated_by",
    )
    seller_advances: Mapped[List["SellerAdvance"]] = relationship(
        "SellerAdvance",
        back_populates="recorded_by_user",
        foreign_keys="SellerAdvance.recorded_by",
    )
    activity_logs: Mapped[List["ActivityLog"]] = relationship(
        "ActivityLog",
        back_populates="actor",
        foreign_keys="ActivityLog.actor_id",
    )

    def __repr__(self) -> str:
        return f"<User(id='{self.id}', email='{self.email}', name='{self.name}', role='{self.role}')>"


class Seller(Base, TimestampMixin):
    """Seller (property owner / representative) model."""
    __tablename__ = "sellers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    relationship_with_property: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_agent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    last_contacted_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_contact_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    last_conversation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    assigned_agent: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="sellers",
        foreign_keys=[assigned_agent_id],
    )
    properties: Mapped[List["Property"]] = relationship(
        "Property",
        back_populates="seller",
        foreign_keys="Property.seller_id",
    )
    advances: Mapped[List["SellerAdvance"]] = relationship(
        "SellerAdvance",
        back_populates="seller",
        foreign_keys="SellerAdvance.seller_id",
    )
    deals: Mapped[List["Deal"]] = relationship(
        "Deal",
        back_populates="seller",
        foreign_keys="Deal.seller_id",
    )

    def __repr__(self) -> str:
        return f"<Seller(id='{self.id}', code='{self.code}', name='{self.name}', phone='{self.phone}')>"


class Property(Base, TimestampMixin):
    """Real estate property listing model."""
    __tablename__ = "properties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    district: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    panchayath: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    locality: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    full_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    google_maps_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    area_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    area_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    road_connectivity: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    distance_to_highway: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    nearby_landmarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    water_availability: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    terrain: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    frontage: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    electricity: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    boundary_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    other_features: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    market_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seller_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("sellers.id", ondelete="SET NULL"), index=True, nullable=True
    )
    seller_relationship: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=PropertyStatus.AVAILABLE.value, nullable=False
    )
    running_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_managed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_agent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_follow_up_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    listed_date: Mapped[Optional[date]] = mapped_column(Date, index=True, nullable=True)
    added_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, default=date.today)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_accuracy: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    seller: Mapped[Optional["Seller"]] = relationship(
        "Seller",
        back_populates="properties",
        foreign_keys=[seller_id],
    )
    assigned_agent: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="properties",
        foreign_keys=[assigned_agent_id],
    )
    images: Mapped[List["PropertyImage"]] = relationship(
        "PropertyImage",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    price_history: Mapped[List["PriceHistory"]] = relationship(
        "PriceHistory",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="desc(PriceHistory.created_at)",
    )
    advances: Mapped[List["SellerAdvance"]] = relationship(
        "SellerAdvance",
        back_populates="property",
        foreign_keys="SellerAdvance.property_id",
    )
    matches: Mapped[List["PropertyMatch"]] = relationship(
        "PropertyMatch",
        back_populates="property",
        cascade="all, delete-orphan",
    )
    site_visits: Mapped[List["SiteVisit"]] = relationship(
        "SiteVisit",
        back_populates="property",
        foreign_keys="SiteVisit.property_id",
    )
    deals: Mapped[List["Deal"]] = relationship(
        "Deal",
        back_populates="property",
        foreign_keys="Deal.property_id",
    )
    investments: Mapped[List["Investment"]] = relationship(
        "Investment",
        back_populates="property",
        foreign_keys="Investment.property_id",
    )
    rental_bookings: Mapped[List["RentalBooking"]] = relationship(
        "RentalBooking",
        back_populates="property",
        foreign_keys="RentalBooking.property_id",
    )
    follow_ups: Mapped[List["FollowUp"]] = relationship(
        "FollowUp",
        back_populates="property",
        foreign_keys="FollowUp.property_id",
    )

    def __repr__(self) -> str:
        return f"<Property(id='{self.id}', code='{self.code}', title='{self.title}', status='{self.status}')>"


class PropertyImage(Base, TimestampMixin):
    """Images associated with a property."""
    __tablename__ = "property_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    caption: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="images",
        foreign_keys=[property_id],
    )

    def __repr__(self) -> str:
        return f"<PropertyImage(id='{self.id}', property_id='{self.property_id}', is_primary={self.is_primary})>"


class PropertyDocument(Base, TimestampMixin):
    """Polymorphic document attachments for entities."""
    __tablename__ = "property_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<PropertyDocument(id='{self.id}', name='{self.name}', entity_type='{self.entity_type}', entity_id='{self.entity_id}')>"


class PriceHistory(Base):
    """Historical record of price revisions for properties."""
    __tablename__ = "price_histories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_expected_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    new_expected_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    previous_market_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    new_market_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )

    # Relationships
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="price_history",
        foreign_keys=[property_id],
    )
    updated_by_user: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="price_histories",
        foreign_keys=[updated_by],
    )

    def __repr__(self) -> str:
        return f"<PriceHistory(id='{self.id}', property_id='{self.property_id}', new_expected_price={self.new_expected_price})>"


class SellerAdvance(Base, TimestampMixin):
    """Advance payments collected from or refunded to sellers."""
    __tablename__ = "seller_advances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    seller_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sellers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    property_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    collection_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)
    transaction_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=AdvanceStatus.COLLECTED.value, nullable=False
    )
    refund_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=True
    )
    refund_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    adjusted_deal_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Relationships
    seller: Mapped["Seller"] = relationship(
        "Seller",
        back_populates="advances",
        foreign_keys=[seller_id],
    )
    property: Mapped[Optional["Property"]] = relationship(
        "Property",
        back_populates="advances",
        foreign_keys=[property_id],
    )
    recorded_by_user: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="seller_advances",
        foreign_keys=[recorded_by],
    )
    adjusted_deal: Mapped[Optional["Deal"]] = relationship(
        "Deal",
        back_populates="seller_advances",
        foreign_keys=[adjusted_deal_id],
    )

    def __repr__(self) -> str:
        return f"<SellerAdvance(id='{self.id}', code='{self.code}', amount={self.amount}, status='{self.status}')>"


class Lead(Base, TimestampMixin):
    """Prospective buyer/tenant lead requirement model."""
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    lead_source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    preferred_district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    preferred_panchayath: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    preferred_locality: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    min_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    max_budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    property_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    property_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    requirement_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=LeadStatus.NEW.value, nullable=False
    )
    assigned_agent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    next_follow_up_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_contacted_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_contact_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    last_conversation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    conversion_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    assigned_agent: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="leads",
        foreign_keys=[assigned_agent_id],
    )
    matches: Mapped[List["PropertyMatch"]] = relationship(
        "PropertyMatch",
        back_populates="lead",
        cascade="all, delete-orphan",
    )
    site_visits: Mapped[List["SiteVisit"]] = relationship(
        "SiteVisit",
        back_populates="lead",
        foreign_keys="SiteVisit.lead_id",
    )
    deals: Mapped[List["Deal"]] = relationship(
        "Deal",
        back_populates="lead",
        foreign_keys="Deal.lead_id",
    )

    def __repr__(self) -> str:
        return f"<Lead(id='{self.id}', code='{self.code}', name='{self.name}', status='{self.status}')>"


class PropertyMatch(Base, TimestampMixin):
    """Property recommendation match for a lead requirement."""
    __tablename__ = "property_matches"
    __table_args__ = (
        UniqueConstraint("lead_id", "property_id", name="uq_lead_property_match"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    match_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    match_reasons: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    matched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )
    shared_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    buyer_interest: Mapped[str] = mapped_column(
        String(50), default=BuyerInterest.PENDING.value, nullable=False
    )
    site_visit_scheduled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    outcome: Mapped[str] = mapped_column(
        String(50), default=MatchOutcome.OPEN.value, nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    lead: Mapped["Lead"] = relationship(
        "Lead",
        back_populates="matches",
        foreign_keys=[lead_id],
    )
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="matches",
        foreign_keys=[property_id],
    )

    def __repr__(self) -> str:
        return f"<PropertyMatch(id='{self.id}', lead_id='{self.lead_id}', property_id='{self.property_id}', score={self.match_score})>"


class FollowUp(Base, TimestampMixin):
    """Follow-up reminder and scheduled activities for leads or sellers."""
    __tablename__ = "follow_ups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    related_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "Lead" or "Seller"
    related_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    property_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_agent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=FollowUpStatus.PENDING.value, nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    property: Mapped[Optional["Property"]] = relationship(
        "Property",
        back_populates="follow_ups",
        foreign_keys=[property_id],
    )
    assigned_agent: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="follow_ups",
        foreign_keys=[assigned_agent_id],
    )

    def __repr__(self) -> str:
        return f"<FollowUp(id='{self.id}', title='{self.title}', date='{self.date}', status='{self.status}')>"


class SiteVisit(Base, TimestampMixin):
    """Site visit schedule and visit outcomes."""
    __tablename__ = "site_visits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    agent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    scheduled_time: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    meeting_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=SiteVisitStatus.SCHEDULEED.value, nullable=False
    )
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visit_outcome: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relationships
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="site_visits",
        foreign_keys=[property_id],
    )
    lead: Mapped["Lead"] = relationship(
        "Lead",
        back_populates="site_visits",
        foreign_keys=[lead_id],
    )
    agent: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="site_visits",
        foreign_keys=[agent_id],
    )

    def __repr__(self) -> str:
        return f"<SiteVisit(id='{self.id}', property_id='{self.property_id}', lead_id='{self.lead_id}', status='{self.status}')>"


class Deal(Base, TimestampMixin):
    """Real estate sales or rental transaction deal."""
    __tablename__ = "deals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    deal_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "Sale" or "Rental"
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    seller_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sellers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_agent_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    agreed_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    commission_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    commission_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    deal_date: Mapped[date] = mapped_column(Date, nullable=False)
    closing_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=DealStatus.INTERESTED.value, nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    lead: Mapped["Lead"] = relationship(
        "Lead",
        back_populates="deals",
        foreign_keys=[lead_id],
    )
    seller: Mapped["Seller"] = relationship(
        "Seller",
        back_populates="deals",
        foreign_keys=[seller_id],
    )
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="deals",
        foreign_keys=[property_id],
    )
    assigned_agent: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="deals",
        foreign_keys=[assigned_agent_id],
    )
    seller_advances: Mapped[List["SellerAdvance"]] = relationship(
        "SellerAdvance",
        back_populates="adjusted_deal",
        foreign_keys="SellerAdvance.adjusted_deal_id",
    )

    def __repr__(self) -> str:
        return f"<Deal(id='{self.id}', code='{self.code}', agreed_price={self.agreed_price}, status='{self.status}')>"


class Investor(Base, TimestampMixin):
    """Investor profile model."""
    __tablename__ = "investors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    investments: Mapped[List["Investment"]] = relationship(
        "Investment",
        back_populates="investor",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Investor(id='{self.id}', name='{self.name}', phone='{self.phone}')>"


class Investment(Base, TimestampMixin):
    """Property investment record model."""
    __tablename__ = "investments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    investor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("investors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    investment_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    additional_expenses: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=True
    )
    expected_return: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    actual_return: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    investment_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=InvestmentStatus.ACTIVE.value, nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="investments",
        foreign_keys=[property_id],
    )
    investor: Mapped["Investor"] = relationship(
        "Investor",
        back_populates="investments",
        foreign_keys=[investor_id],
    )

    def __repr__(self) -> str:
        return f"<Investment(id='{self.id}', code='{self.code}', amount={self.investment_amount}, status='{self.status}')>"


class Tenant(Base, TimestampMixin):
    """Tenant model for rental properties."""
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    id_proof: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    rental_bookings: Mapped[List["RentalBooking"]] = relationship(
        "RentalBooking",
        back_populates="tenant",
    )

    def __repr__(self) -> str:
        return f"<Tenant(id='{self.id}', name='{self.name}', phone='{self.phone}')>"


class RentalBooking(Base, TimestampMixin):
    """Short-term and long-term rental booking model."""
    __tablename__ = "rental_bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rental_type: Mapped[str] = mapped_column(String(50), nullable=False)  # Daily Stay/Monthly/Yearly
    rate_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    check_out: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    deposit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=True
    )
    contract_ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    income_received: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(50), index=True, default=RentalStatus.BOOKED.value, nullable=False
    )
    maintenance_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="rental_bookings",
        foreign_keys=[property_id],
    )
    tenant: Mapped[Optional["Tenant"]] = relationship(
        "Tenant",
        back_populates="rental_bookings",
        foreign_keys=[tenant_id],
    )

    def __repr__(self) -> str:
        return f"<RentalBooking(id='{self.id}', code='{self.code}', rate={self.rate_amount}, status='{self.status}')>"


class Expense(Base):
    """Operational or deal-specific expense record."""
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Expense(id='{self.id}', category='{self.category}', amount={self.amount}, entity_type='{self.entity_type}')>"


class ActivityLog(Base):
    """Audit trail and activity log for system and user actions."""
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False
    )

    # Relationships
    actor: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="activity_logs",
        foreign_keys=[actor_id],
    )

    def __repr__(self) -> str:
        return f"<ActivityLog(id='{self.id}', action='{self.action}', entity_type='{self.entity_type}', actor_id='{self.actor_id}')>"


class AgencySetting(Base, TimestampMixin):
    """Key-value system and business settings store."""
    __tablename__ = "agency_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<AgencySetting(key='{self.key}')>"


class SequenceCounter(Base):
    """Sequential ID counter table for thread-safe sequential code generation (e.g. TAK, SLR, LED, DL)."""
    __tablename__ = "sequence_counters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    prefix: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    current_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<SequenceCounter(prefix='{self.prefix}', current_value={self.current_value})>"
