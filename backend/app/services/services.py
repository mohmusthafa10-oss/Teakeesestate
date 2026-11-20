import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.models import (
    ActivityLog,
    AgencySetting,
    Deal,
    FollowUp,
    Investment,
    Investor,
    Lead,
    PriceHistory,
    Property,
    PropertyDocument,
    PropertyImage,
    PropertyMatch,
    RentalBooking,
    Seller,
    SellerAdvance,
    SequenceCounter,
    SiteVisit,
    Tenant,
    User,
)
from app.schemas.schemas import (
    CombinedRegistrationRequest,
    DealCreate,
    DealUpdate,
    FollowUpCompleteRequest,
    FollowUpCreate,
    FollowUpUpdate,
    InvestmentCreate,
    InvestmentUpdate,
    LeadCreate,
    LeadUpdate,
    PropertyCreate,
    PropertyMatchCreate,
    PropertyMatchUpdate,
    PropertyUpdate,
    RentalBookingCreate,
    RentalBookingUpdate,
    SellerAdvanceCreate,
    SellerAdvanceUpdate,
    SellerCreate,
    SellerUpdate,
    SiteVisitCreate,
    SiteVisitUpdate,
    UserCreate,
    UserUpdate,
)


def generate_sequential_code(db: Session, prefix: str, pad: int = 3, start: int = 1) -> str:
    """
    Generate thread-safe sequential identifiers like TAK001, SLR-1001, LED-1001, DL-1001.
    Uses SequenceCounter table with row-level atomic increment.
    """
    counter = db.query(SequenceCounter).filter(SequenceCounter.prefix == prefix).with_for_update().first()
    if not counter:
        counter = SequenceCounter(prefix=prefix, current_value=start)
        db.add(counter)
        db.flush()
        num = start
    else:
        counter.current_value += 1
        db.flush()
        num = counter.current_value

    if prefix == "TAK":
        return f"{prefix}{str(num).padStart(pad, '0') if hasattr(str(num), 'padStart') else str(num).zfill(pad)}"
    elif prefix in ("SLR", "LED", "DL", "INV", "RNT", "ADV"):
        return f"{prefix}-{str(num).zfill(pad)}"
    return f"{prefix}{str(num).zfill(pad)}"


def log_activity(db: Session, entity_type: str, entity_id: str, action: str, summary: str, actor_id: Optional[str] = None):
    activity = ActivityLog(
        id=str(uuid.uuid4()),
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        summary=summary,
        actor_id=actor_id,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(activity)


# ==================== AUTH & USERS ====================
def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    from app.core.security import verify_password
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_user(db: Session, data: UserCreate) -> User:
    user = User(
        id=str(uuid.uuid4()),
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=get_password_hash(data.password),
        role=data.role,
        designation=data.designation,
        active=data.active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session) -> List[User]:
    return db.query(User).order_by(User.name).all()


# ==================== SELLERS ====================
def create_seller(db: Session, data: SellerCreate, actor_id: Optional[str] = None) -> Seller:
    code = generate_sequential_code(db, "SLR", pad=4, start=1001)
    seller = Seller(
        id=str(uuid.uuid4()),
        code=code,
        name=data.name,
        phone=data.phone,
        whatsapp=data.whatsapp or data.phone,
        address=data.address or "",
        relationship_with_property=data.relationship_with_property,
        notes=data.notes or "",
        assigned_agent_id=data.assigned_agent_id or actor_id,
    )
    db.add(seller)
    db.flush()
    log_activity(db, "Seller", seller.id, "Created", f"Registered seller {seller.name} ({seller.code})", actor_id)
    db.commit()
    db.refresh(seller)
    return seller


def get_seller(db: Session, seller_id: str) -> Optional[Seller]:
    return db.query(Seller).filter(Seller.id == seller_id).first()


def list_sellers(db: Session, page: int = 1, page_size: int = 20, search: Optional[str] = None, agent_id: Optional[str] = None) -> Tuple[List[Seller], int]:
    query = db.query(Seller)
    if agent_id:
        query = query.filter(Seller.assigned_agent_id == agent_id)
    if search:
        search_filter = or_(
            Seller.name.ilike(f"%{search}%"),
            Seller.phone.ilike(f"%{search}%"),
            Seller.code.ilike(f"%{search}%"),
            Seller.address.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)
    total = query.count()
    items = query.order_by(desc(Seller.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def update_seller(db: Session, seller_id: str, data: SellerUpdate, actor_id: Optional[str] = None) -> Optional[Seller]:
    seller = get_seller(db, seller_id)
    if not seller:
        return None
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(seller, field, val)
    db.commit()
    db.refresh(seller)
    return seller


# ==================== PROPERTIES ====================
def calculate_days_listed(listed_date_str: Optional[str], created_at: datetime) -> int:
    try:
        if listed_date_str:
            d = datetime.strptime(listed_date_str[:10], "%Y-%m-%d").date()
        else:
            d = created_at.date()
        delta = (date.today() - d).days
        return max(0, delta)
    except Exception:
        return 0


def create_property(db: Session, data: PropertyCreate, actor_id: Optional[str] = None) -> Property:
    code = generate_sequential_code(db, "TAK", pad=3, start=1)
    prop = Property(
        id=str(uuid.uuid4()),
        code=code,
        title=data.title,
        type=data.type,
        category=data.category,
        district=data.district,
        panchayath=data.panchayath,
        locality=data.locality,
        full_address=data.full_address,
        google_maps_url=data.google_maps_url,
        area_value=data.area_value,
        area_unit=data.area_unit,
        road_connectivity=data.road_connectivity,
        distance_to_highway=data.distance_to_highway,
        nearby_landmarks=data.nearby_landmarks,
        water_availability=data.water_availability,
        terrain=data.terrain,
        frontage=data.frontage,
        electricity=data.electricity,
        boundary_details=data.boundary_details,
        other_features=data.other_features,
        expected_price=data.expected_price,
        market_price=data.market_price,
        description=data.description,
        seller_id=data.seller_id,
        seller_relationship=data.seller_relationship,
        status=data.status,
        running_category=data.running_category,
        is_managed=data.is_managed,
        assigned_agent_id=data.assigned_agent_id or actor_id,
        internal_notes=data.internal_notes or "",
        next_follow_up_date=data.next_follow_up_date,
        listed_date=date.fromisoformat(data.listed_date[:10]) if data.listed_date else date.today(),
        latitude=data.latitude,
        longitude=data.longitude,
        location_accuracy=data.location_accuracy,
        is_demo_data=data.is_demo_data,
    )
    db.add(prop)
    db.flush()

    if data.images:
        for img in data.images:
            db.add(PropertyImage(
                id=str(uuid.uuid4()),
                property_id=prop.id,
                url=img.url,
                caption=img.caption,
                is_primary=img.is_primary,
            ))

    if data.documents:
        for doc in data.documents:
            db.add(PropertyDocument(
                id=str(uuid.uuid4()),
                entity_type="Property",
                entity_id=prop.id,
                name=doc.name,
                doc_type=doc.doc_type,
                file_size=doc.file_size,
                notes=doc.notes,
            ))

    log_activity(db, "Property", prop.id, "Created", f"Listed property {prop.title} ({prop.code}) at {prop.locality}", actor_id)
    db.commit()
    db.refresh(prop)
    return prop


def get_property(db: Session, property_id: str) -> Optional[Property]:
    return db.query(Property).filter(Property.id == property_id).first()


def list_properties(db: Session, page: int = 1, page_size: int = 20, search: Optional[str] = None,
                    status: Optional[str] = None, prop_type: Optional[str] = None,
                    category: Optional[str] = None, district: Optional[str] = None,
                    agent_id: Optional[str] = None) -> Tuple[List[Property], int]:
    query = db.query(Property)
    if agent_id:
        query = query.filter(Property.assigned_agent_id == agent_id)
    if status:
        query = query.filter(Property.status == status)
    if prop_type:
        query = query.filter(Property.type == prop_type)
    if category:
        query = query.filter(Property.category == category)
    if district:
        query = query.filter(Property.district == district)
    if search:
        search_filter = or_(
            Property.title.ilike(f"%{search}%"),
            Property.code.ilike(f"%{search}%"),
            Property.locality.ilike(f"%{search}%"),
            Property.panchayath.ilike(f"%{search}%"),
            Property.district.ilike(f"%{search}%"),
            Property.description.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)

    total = query.count()
    items = query.order_by(desc(Property.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    for item in items:
        item.days_listed = calculate_days_listed(item.listed_date, item.created_at)
    return items, total


def update_property(db: Session, property_id: str, data: PropertyUpdate, actor_id: Optional[str] = None) -> Optional[Property]:
    prop = get_property(db, property_id)
    if not prop:
        return None

    update_dict = data.model_dump(exclude_unset=True)
    if "expected_price" in update_dict and update_dict["expected_price"] != prop.expected_price:
        ph = PriceHistory(
            id=str(uuid.uuid4()),
            property_id=prop.id,
            previous_expected_price=prop.expected_price,
            new_expected_price=update_dict["expected_price"],
            previous_market_price=prop.market_price,
            new_market_price=update_dict.get("market_price", prop.market_price),
            updated_by=actor_id,
            note="Price updated via property edit",
        )
        db.add(ph)

    for field, val in update_dict.items():
        setattr(prop, field, val)

    db.commit()
    db.refresh(prop)
    prop.days_listed = calculate_days_listed(prop.listed_date, prop.created_at)
    return prop


def get_map_properties(db: Session, filters: Optional[Dict[str, Any]] = None) -> List[Property]:
    query = db.query(Property).filter(
        Property.latitude.isnot(None),
        Property.longitude.isnot(None)
    )
    if filters:
        if filters.get("status"):
            query = query.filter(Property.status == filters["status"])
        if filters.get("type"):
            query = query.filter(Property.type == filters["type"])
        if filters.get("district"):
            query = query.filter(Property.district == filters["district"])
    items = query.all()
    for item in items:
        item.days_listed = calculate_days_listed(item.listed_date, item.created_at)
    return items


# ==================== COMBINED REGISTRATION ====================
def register_seller_and_property(db: Session, req: CombinedRegistrationRequest, actor_id: Optional[str] = None) -> Dict[str, Any]:
    """
    CRITICAL WORKFLOW: Atomic combined registration of seller, property, and optional advance.
    Executed in a single transaction with automatic rollback on error.
    """
    try:
        if req.mode == "new-seller":
            if not req.seller:
                raise ValueError("Seller details required for new seller registration")
            seller_code = generate_sequential_code(db, "SLR", pad=4, start=1001)
            seller = Seller(
                id=str(uuid.uuid4()),
                code=seller_code,
                name=req.seller.name,
                phone=req.seller.phone,
                whatsapp=req.seller.whatsapp or req.seller.phone,
                address=req.seller.address or "",
                relationship_with_property=req.seller.relationship_with_property,
                notes=req.seller.notes or "",
                assigned_agent_id=req.seller.assigned_agent_id or actor_id,
            )
            db.add(seller)
            db.flush()
            seller_id = seller.id
            log_activity(db, "Seller", seller.id, "Registered", f"New seller {seller.name} registered", actor_id)
        else:
            if not req.existing_seller_id:
                raise ValueError("Existing seller ID required for existing-seller mode")
            seller = db.query(Seller).filter(Seller.id == req.existing_seller_id).first()
            if not seller:
                raise ValueError("Selected seller does not exist")
            seller_id = seller.id

        prop_code = generate_sequential_code(db, "TAK", pad=3, start=1)
        prop = Property(
            id=str(uuid.uuid4()),
            code=prop_code,
            title=req.property.title,
            type=req.property.type,
            category=req.property.category,
            district=req.property.district,
            panchayath=req.property.panchayath,
            locality=req.property.locality,
            full_address=req.property.full_address,
            google_maps_url=req.property.google_maps_url,
            area_value=req.property.area_value,
            area_unit=req.property.area_unit,
            road_connectivity=req.property.road_connectivity,
            distance_to_highway=req.property.distance_to_highway,
            nearby_landmarks=req.property.nearby_landmarks,
            water_availability=req.property.water_availability,
            terrain=req.property.terrain,
            frontage=req.property.frontage,
            electricity=req.property.electricity,
            boundary_details=req.property.boundary_details,
            other_features=req.property.other_features,
            expected_price=req.property.expected_price,
            market_price=req.property.market_price,
            description=req.property.description,
            seller_id=seller_id,
            seller_relationship=req.property.seller_relationship,
            status=req.property.status,
            running_category=req.property.running_category,
            is_managed=req.property.is_managed,
            assigned_agent_id=req.property.assigned_agent_id or actor_id,
            internal_notes=req.property.internal_notes or "",
            next_follow_up_date=req.property.next_follow_up_date,
            listed_date=date.fromisoformat(req.property.listed_date[:10]) if req.property.listed_date else date.today(),
            latitude=req.property.latitude,
            longitude=req.property.longitude,
            location_accuracy=req.property.location_accuracy,
            is_demo_data=req.property.is_demo_data,
        )
        db.add(prop)
        db.flush()

        if req.property.images:
            for img in req.property.images:
                db.add(PropertyImage(
                    id=str(uuid.uuid4()),
                    property_id=prop.id,
                    url=img.url,
                    caption=img.caption,
                    is_primary=img.is_primary,
                ))

        advance_record = None
        if req.advance and req.advance.amount > 0:
            adv_code = generate_sequential_code(db, "ADV", pad=4, start=1001)
            advance_record = SellerAdvance(
                id=str(uuid.uuid4()),
                code=adv_code,
                seller_id=seller_id,
                property_id=prop.id,
                amount=req.advance.amount,
                collection_date=date.fromisoformat(req.advance.collection_date[:10]) if req.advance.collection_date else date.today(),
                payment_method=req.advance.payment_method,
                transaction_reference=req.advance.transaction_reference or "",
                remarks=req.advance.remarks or "Advance collected upon registration",
                status="Collected",
                recorded_by=actor_id,
            )
            db.add(advance_record)
            db.flush()
            log_activity(db, "Advance", advance_record.id, "Collected", f"Collected advance ₹{req.advance.amount} for {prop.code}", actor_id)

        log_activity(db, "Property", prop.id, "Registered", f"Registered property {prop.title} ({prop.code}) for seller {seller.name}", actor_id)

        db.commit()
        db.refresh(seller)
        db.refresh(prop)
        if advance_record:
            db.refresh(advance_record)

        prop.days_listed = calculate_days_listed(prop.listed_date, prop.created_at)
        return {
            "seller": seller,
            "property": prop,
            "advance": advance_record,
        }
    except Exception as e:
        db.rollback()
        raise e


# ==================== ADVANCE OPERATIONS ====================
def list_advances(db: Session, seller_id: Optional[str] = None, property_id: Optional[str] = None) -> List[SellerAdvance]:
    query = db.query(SellerAdvance)
    if seller_id:
        query = query.filter(SellerAdvance.seller_id == seller_id)
    if property_id:
        query = query.filter(SellerAdvance.property_id == property_id)
    return query.order_by(desc(SellerAdvance.created_at)).all()


def update_advance_status(db: Session, advance_id: str, data: SellerAdvanceUpdate, actor_id: Optional[str] = None) -> Optional[SellerAdvance]:
    adv = db.query(SellerAdvance).filter(SellerAdvance.id == advance_id).first()
    if not adv:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(adv, k, v)
    db.commit()
    db.refresh(adv)
    return adv


# ==================== LEADS & MATCHING ====================
def create_lead(db: Session, data: LeadCreate, actor_id: Optional[str] = None) -> Lead:
    code = generate_sequential_code(db, "LED", pad=4, start=1001)
    lead = Lead(
        id=str(uuid.uuid4()),
        code=code,
        name=data.name,
        phone=data.phone,
        whatsapp=data.whatsapp or data.phone,
        email=data.email,
        lead_source=data.lead_source,
        preferred_district=data.preferred_district,
        preferred_panchayath=data.preferred_panchayath,
        preferred_locality=data.preferred_locality,
        min_budget=data.min_budget,
        max_budget=data.max_budget,
        property_type=data.property_type,
        property_category=data.property_category,
        requirement_description=data.requirement_description or "",
        status=data.status,
        assigned_agent_id=data.assigned_agent_id or actor_id,
        next_follow_up_date=data.next_follow_up_date,
        notes=data.notes or "",
    )
    db.add(lead)
    db.flush()
    log_activity(db, "Lead", lead.id, "Created", f"Registered new lead {lead.name} ({lead.code})", actor_id)
    db.commit()
    db.refresh(lead)
    return lead


def get_lead(db: Session, lead_id: str) -> Optional[Lead]:
    return db.query(Lead).filter(Lead.id == lead_id).first()


def list_leads(db: Session, page: int = 1, page_size: int = 20, search: Optional[str] = None,
               status: Optional[str] = None, source: Optional[str] = None, agent_id: Optional[str] = None) -> Tuple[List[Lead], int]:
    query = db.query(Lead)
    if agent_id:
        query = query.filter(Lead.assigned_agent_id == agent_id)
    if status:
        query = query.filter(Lead.status == status)
    if source:
        query = query.filter(Lead.lead_source == source)
    if search:
        search_filter = or_(
            Lead.name.ilike(f"%{search}%"),
            Lead.phone.ilike(f"%{search}%"),
            Lead.code.ilike(f"%{search}%"),
            Lead.requirement_description.ilike(f"%{search}%"),
        )
        query = query.filter(search_filter)

    total = query.count()
    items = query.order_by(desc(Lead.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


def update_lead(db: Session, lead_id: str, data: LeadUpdate, actor_id: Optional[str] = None) -> Optional[Lead]:
    lead = get_lead(db, lead_id)
    if not lead:
        return None
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(lead, field, val)
    db.commit()
    db.refresh(lead)
    return lead


def find_matching_properties(db: Session, lead_id: str) -> List[Dict[str, Any]]:
    lead = get_lead(db, lead_id)
    if not lead:
        return []

    properties = db.query(Property).filter(Property.status == "Available").all()
    matches = []

    for prop in properties:
        reasons = []
        score = 0

        # Type Match
        if lead.property_type == "Any" or lead.property_type == prop.type:
            reasons.append(f"Property Type match: {prop.type}")
            score += 25

        # Category Match
        if not lead.property_category or lead.property_category == "Any" or lead.property_category == prop.category:
            reasons.append(f"Category match: {prop.category}")
            score += 15

        # District Match
        if lead.preferred_district and lead.preferred_district.lower() in prop.district.lower():
            reasons.append(f"District match: {prop.district}")
            score += 25

        # Locality / Panchayath Match
        if lead.preferred_locality and (lead.preferred_locality.lower() in prop.locality.lower() or lead.preferred_locality.lower() in prop.panchayath.lower()):
            reasons.append(f"Locality match: {prop.locality}")
            score += 15

        # Budget Check
        if lead.min_budget > 0 and lead.max_budget > 0:
            if lead.min_budget <= prop.expected_price <= lead.max_budget:
                reasons.append(f"Budget match: Expected price ₹{prop.expected_price:,.0f} is within target range")
                score += 20
            elif prop.expected_price <= lead.max_budget * Decimal(1.15):
                reasons.append("Close budget match (within 15% range)")
                score += 10

        if score >= 40:
            prop.days_listed = calculate_days_listed(prop.listed_date, prop.created_at)
            matches.append({
                "property": prop,
                "score": min(score, 100),
                "reasons": reasons,
            })

    matches.sort(key=lambda x: x["score"], reverse=True)
    return matches


def find_matching_leads(db: Session, property_id: str) -> List[Dict[str, Any]]:
    prop = get_property(db, property_id)
    if not prop:
        return []

    leads = db.query(Lead).filter(Lead.status.notin_(["Converted", "Lost"])).all()
    matches = []

    for lead in leads:
        reasons = []
        score = 0

        if lead.property_type == "Any" or lead.property_type == prop.type:
            reasons.append(f"Property Type: {prop.type}")
            score += 25

        if lead.preferred_district and lead.preferred_district.lower() in prop.district.lower():
            reasons.append(f"Location: {prop.district}")
            score += 25

        if lead.min_budget > 0 and lead.max_budget > 0:
            if lead.min_budget <= prop.expected_price <= lead.max_budget:
                reasons.append("Target budget match")
                score += 20

        if score >= 40:
            matches.append({
                "lead": lead,
                "score": min(score, 100),
                "reasons": reasons,
            })

    matches.sort(key=lambda x: x["score"], reverse=True)
    return matches


# ==================== FOLLOW-UPS ====================
def create_followup(db: Session, data: FollowUpCreate, actor_id: Optional[str] = None) -> FollowUp:
    followup = FollowUp(
        id=str(uuid.uuid4()),
        title=data.title,
        related_type=data.related_type,
        related_id=data.related_id,
        property_id=data.property_id,
        assigned_agent_id=data.assigned_agent_id or actor_id,
        date=data.date,
        time=data.time,
        activity_type=data.activity_type,
        notes=data.notes or "",
        status=data.status,
    )
    db.add(followup)
    db.commit()
    db.refresh(followup)
    return followup


def complete_followup(db: Session, followup_id: str, req: FollowUpCompleteRequest, actor_id: Optional[str] = None) -> Optional[FollowUp]:
    followup = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if not followup:
        return None

    followup.status = "Completed"
    followup.completed_at = datetime.now(timezone.utc)
    if req.notes:
        followup.notes = f"{followup.notes}\n[Completed]: {req.notes}".strip()

    # Update last contacted date on related entity
    now_iso = datetime.now(timezone.utc).isoformat()
    if followup.related_type == "Lead":
        lead = db.query(Lead).filter(Lead.id == followup.related_id).first()
        if lead:
            lead.last_contacted_date = now_iso
            lead.last_contact_method = followup.activity_type
            lead.last_conversation_notes = req.notes or followup.notes
    elif followup.related_type == "Seller":
        seller = db.query(Seller).filter(Seller.id == followup.related_id).first()
        if seller:
            seller.last_contacted_date = now_iso
            seller.last_contact_method = followup.activity_type
            seller.last_conversation_notes = req.notes or followup.notes

    # Create next follow-up if requested
    if req.create_next_follow_up and req.next_date:
        next_followup = FollowUp(
            id=str(uuid.uuid4()),
            title=f"Follow-up: {followup.title}",
            related_type=followup.related_type,
            related_id=followup.related_id,
            property_id=followup.property_id,
            assigned_agent_id=followup.assigned_agent_id or actor_id,
            date=req.next_date,
            time=req.next_time or "10:00",
            activity_type=followup.activity_type,
            notes=req.next_notes or "",
            status="Pending",
        )
        db.add(next_followup)

    db.commit()
    db.refresh(followup)
    return followup


def list_followups(db: Session, page: int = 1, page_size: int = 30, filter_status: Optional[str] = None,
                   agent_id: Optional[str] = None) -> Tuple[List[FollowUp], int]:
    query = db.query(FollowUp)
    if agent_id:
        query = query.filter(FollowUp.assigned_agent_id == agent_id)
    today = date.today()

    if filter_status == "today":
        query = query.filter(FollowUp.status == "Pending", FollowUp.date == today)
    elif filter_status == "overdue":
        query = query.filter(FollowUp.status == "Pending", FollowUp.date < today)
    elif filter_status == "upcoming":
        query = query.filter(FollowUp.status == "Pending", FollowUp.date > today)
    elif filter_status == "completed":
        query = query.filter(FollowUp.status == "Completed")

    total = query.count()
    items = query.order_by(FollowUp.date, FollowUp.time).offset((page - 1) * page_size).limit(page_size).all()
    return items, total


# ==================== DEALS ====================
def create_deal(db: Session, data: DealCreate, actor_id: Optional[str] = None) -> Deal:
    code = generate_sequential_code(db, "DL", pad=4, start=1001)
    deal = Deal(
        id=str(uuid.uuid4()),
        code=code,
        deal_type=data.deal_type,
        lead_id=data.lead_id,
        seller_id=data.seller_id,
        property_id=data.property_id,
        assigned_agent_id=data.assigned_agent_id or actor_id,
        agreed_price=data.agreed_price,
        commission_rate=data.commission_rate,
        commission_amount=data.commission_amount,
        deal_date=data.deal_date,
        closing_date=data.closing_date,
        status=data.status,
        notes=data.notes or "",
    )
    db.add(deal)
    db.flush()

    if data.status == "Closed":
        prop = db.query(Property).filter(Property.id == data.property_id).first()
        if prop:
            prop.status = "Sold" if data.deal_type == "Sale" else "Rented"
        lead = db.query(Lead).filter(Lead.id == data.lead_id).first()
        if lead:
            lead.status = "Converted"

    log_activity(db, "Deal", deal.id, "Created", f"Created deal {deal.code} for ₹{deal.agreed_price:,.0f}", actor_id)
    db.commit()
    db.refresh(deal)
    return deal


def update_deal(db: Session, deal_id: str, data: DealUpdate, actor_id: Optional[str] = None) -> Optional[Deal]:
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        return None

    prev_status = deal.status
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(deal, field, val)

    if prev_status != "Closed" and deal.status == "Closed":
        prop = db.query(Property).filter(Property.id == deal.property_id).first()
        if prop:
            prop.status = "Sold" if deal.deal_type == "Sale" else "Rented"
        lead = db.query(Lead).filter(Lead.id == deal.lead_id).first()
        if lead:
            lead.status = "Converted"

    db.commit()
    db.refresh(deal)
    return deal


# ==================== DASHBOARD SUMMARY ====================
def get_dashboard_summary(db: Session, user_id: Optional[str] = None, role: str = "Admin") -> Dict[str, Any]:
    today = date.today()
    prop_q = db.query(Property)
    lead_q = db.query(Lead)
    seller_q = db.query(Seller)
    fup_q = db.query(FollowUp)
    deal_q = db.query(Deal)

    if role == "Agent" and user_id:
        prop_q = prop_q.filter(Property.assigned_agent_id == user_id)
        lead_q = lead_q.filter(Lead.assigned_agent_id == user_id)
        seller_q = seller_q.filter(Seller.assigned_agent_id == user_id)
        fup_q = fup_q.filter(FollowUp.assigned_agent_id == user_id)
        deal_q = deal_q.filter(Deal.assigned_agent_id == user_id)

    total_props = prop_q.count()
    available_props = prop_q.filter(Property.status == "Available").count()
    running_props = prop_q.filter(Property.status.notin_(["Sold", "Inactive"])).count()
    total_sellers = seller_q.count()
    total_leads = lead_q.count()
    fup_today = fup_q.filter(FollowUp.status == "Pending", FollowUp.date == today).count()
    fup_overdue = fup_q.filter(FollowUp.status == "Pending", FollowUp.date < today).count()
    active_deals = deal_q.filter(Deal.status.notin_(["Closed", "Cancelled", "Lost"])).count()

    closed_deals = deal_q.filter(Deal.status == "Closed").all()
    sales_vol = sum(d.agreed_price for d in closed_deals)
    comm_earned = sum(d.commission_amount for d in closed_deals)

    # Status Breakdown
    prop_statuses = ["Available", "Under Negotiation", "Reserved", "Sold", "Rented", "Inactive"]
    breakdown = []
    for s in prop_statuses:
        cnt = prop_q.filter(Property.status == s).count()
        breakdown.append({"status": s, "count": cnt})

    # Lead pipeline
    lead_statuses = ["New", "Contacted", "Qualified", "Property Shared", "Site Visit", "Negotiation", "Converted", "Lost"]
    lead_pipeline = []
    for ls in lead_statuses:
        cnt = lead_q.filter(Lead.status == ls).count()
        lead_pipeline.append({"status": ls, "count": cnt})

    recent_props = prop_q.order_by(desc(Property.created_at)).limit(5).all()
    for p in recent_props:
        p.days_listed = calculate_days_listed(p.listed_date, p.created_at)

    recent_leads = lead_q.order_by(desc(Lead.created_at)).limit(5).all()
    recent_acts = db.query(ActivityLog).order_by(desc(ActivityLog.timestamp)).limit(10).all()

    return {
        "total_properties": total_props,
        "available_properties": available_props,
        "running_properties": running_props,
        "total_sellers": total_sellers,
        "total_leads": total_leads,
        "follow_ups_today": fup_today,
        "overdue_follow_ups": fup_overdue,
        "active_deals": active_deals,
        "total_sales_volume": Decimal(sales_vol),
        "total_commission_earned": Decimal(comm_earned),
        "property_breakdown": breakdown,
        "lead_pipeline": lead_pipeline,
        "recent_properties": recent_props,
        "recent_leads": recent_leads,
        "recent_activities": recent_acts,
    }
