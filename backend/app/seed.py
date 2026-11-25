import json
import os
import sys
from datetime import date, datetime, timezone
from decimal import Decimal

# Add backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings
from app.core.security import get_password_hash
from app.database.base import Base
from app.database.session import SessionLocal, engine
from app.models.models import (
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

def run_seed():
    if settings.is_production:
        raise RuntimeError("CRITICAL SECURITY ERROR: Database seeding is strictly forbidden in production.")

    print("Checking database tables...")
    db = SessionLocal()

    try:
        # Check if users already seeded
        existing_user = db.query(User).filter(User.email == "admin@testate.in").first()
        if existing_user:
            print("Database already contains seed data. Skipping seed.")
            return

        print("Seeding Users...")
        admin_pwd = os.getenv("SEED_ADMIN_PASSWORD")
        agent_pwd = os.getenv("SEED_AGENT_PASSWORD")
        if not admin_pwd or not agent_pwd:
            raise RuntimeError(
                "SEED_ADMIN_PASSWORD and SEED_AGENT_PASSWORD environment variables must be provided for database seeding. "
                "Hardcoded fallback credentials are strictly prohibited."
            )
        from app.core.security import validate_admin_password_strength
        validate_admin_password_strength(admin_pwd)

        users = [
            User(
                id="usr-1",
                name="Admin User",
                email="admin@testate.in",
                phone="+91 98470 11220",
                password_hash=get_password_hash(admin_pwd),
                role="Admin",
                designation="Managing Partner",
                active=True,
            ),
            User(
                id="usr-2",
                name="Meera Nair",
                email="agent1@testate.in",
                phone="+91 98471 33445",
                password_hash=get_password_hash(agent_pwd),
                role="Agent",
                designation="Senior Property Advisor",
                active=True,
            ),
            User(
                id="usr-3",
                name="Karthik Varma",
                email="agent2@testate.in",
                phone="+91 97450 88991",
                password_hash=get_password_hash(agent_pwd),
                role="Agent",
                designation="Land & Investment Specialist",
                active=True,
            ),
            User(
                id="usr-4",
                name="Sana Fathima",
                email="agent3@testate.in",
                phone="+91 94460 55219",
                password_hash=get_password_hash(agent_pwd),
                role="Agent",
                designation="Rentals & Stays Coordinator",
                active=True,
            ),
        ]
        db.add_all(users)
        db.flush()

        print("Seeding Sequence Counters...")
        counters = [
            SequenceCounter(prefix="TAK", current_value=8),
            SequenceCounter(prefix="SLR", current_value=1004),
            SequenceCounter(prefix="LED", current_value=1008),
            SequenceCounter(prefix="DL", current_value=1006),
            SequenceCounter(prefix="ADV", current_value=1002),
            SequenceCounter(prefix="INV", current_value=1003),
            SequenceCounter(prefix="RNT", current_value=1003),
        ]
        db.add_all(counters)
        db.flush()

        print("Seeding Sellers...")
        sellers = [
            Seller(
                id="slr-1",
                code="SLR-1001",
                name="Rajeshwari Shenoy",
                phone="+91 94471 20394",
                whatsapp="+91 94471 20394",
                address="Puthiyakavu Junction, Kanhangad, Kasaragod",
                relationship_with_property="Owner",
                notes="Owns residential plot and family villa. Prefers morning calls before 11 AM.",
                assigned_agent_id="usr-2",
                last_contacted_date=datetime.now(timezone.utc),
                last_contact_method="Call",
                last_conversation_notes="Confirmed weekend buyer site visit.",
            ),
            Seller(
                id="slr-2",
                code="SLR-1002",
                name="Mohammed Kunhi",
                phone="+91 98950 44128",
                whatsapp="+91 98950 44128",
                address="Bekal Fort Road, Pallikere, Kasaragod",
                relationship_with_property="Power of Attorney Holder",
                notes="NRI representative based in Dubai. Coordinates stays and coastal properties.",
                assigned_agent_id="usr-4",
                last_contacted_date=datetime.now(timezone.utc),
                last_contact_method="WhatsApp",
                last_conversation_notes="Reviewed rental statements.",
            ),
            Seller(
                id="slr-3",
                code="SLR-1003",
                name="Dr. Haridasan Nambiar",
                phone="+91 94472 88102",
                whatsapp="+91 94472 88102",
                address="Ananthapura Lake Road, Kumbla, Kasaragod",
                relationship_with_property="Owner",
                notes="Retired professor selling rubber & areca plantation.",
                assigned_agent_id="usr-3",
                last_contacted_date=datetime.now(timezone.utc),
                last_contact_method="Meeting",
                last_conversation_notes="Discussed road frontage surveying.",
            ),
            Seller(
                id="slr-4",
                code="SLR-1004",
                name="Sunny Joseph",
                phone="+91 97441 55620",
                whatsapp="+91 97441 55620",
                address="Cheruvathur Highway, Kasaragod",
                relationship_with_property="Broker Agent",
                notes="Commercial broker handling prime town junction showroom spaces.",
                assigned_agent_id="usr-2",
                last_contacted_date=datetime.now(timezone.utc),
                last_contact_method="Call",
                last_conversation_notes="Clarified rental lease terms for bank tenants.",
            ),
        ]
        db.add_all(sellers)
        db.flush()

        print("Seeding Properties...")
        properties = [
            Property(
                id="prp-1",
                code="TAK001",
                title="Palm Grove Residential Plot",
                type="Land",
                category="Residential",
                district="Kasaragod",
                panchayath="Kanhangad Municipality",
                locality="Puthiyakavu",
                full_address="Ward 14, Near Puthiyakavu Temple, Kanhangad, Kasaragod 671315",
                google_maps_url="https://maps.google.com/?q=12.3125,75.0934",
                area_value=Decimal("18.5"),
                area_unit="Cents",
                road_connectivity="Tar Road Access",
                distance_to_highway="1.2 km from NH 66",
                nearby_landmarks="Puthiyakavu Temple, Little Flower School",
                water_availability="Open well with sweet year-round drinking water",
                terrain="Level highland dry plot",
                frontage="45 ft tarred road frontage",
                electricity="3-phase KSEB connection available",
                boundary_details="Laterite compound wall with gate pillars",
                other_features="Vaastu compliant rectangular shape",
                expected_price=Decimal("4625000"),
                market_price=Decimal("4800000"),
                description="Prime 18.5 cents dry residential plot inside peaceful upscale colony. High water table, clear boundary wall and direct tar road access. Ideal for luxury family villa.",
                seller_id="slr-1",
                seller_relationship="Owner",
                status="Available",
                running_category="Active Listing",
                is_managed=False,
                assigned_agent_id="usr-2",
                internal_notes="Clear title deed verified. Ready for immediate registration.",
                listed_date=date.fromisoformat("2026-09-01"),
                latitude=12.3125,
                longitude=75.0934,
                location_accuracy="Pin drop verified",
                is_demo_data=False,
            ),
            Property(
                id="prp-2",
                code="TAK002",
                title="Heritage Courtyard Villa",
                type="Villa",
                category="Residential",
                district="Kasaragod",
                panchayath="Hosdurg",
                locality="Kanhangad Town",
                full_address="Civil Station Road, Hosdurg, Kanhangad 671315",
                area_value=Decimal("28.0"),
                area_unit="Cents",
                road_connectivity="Wide Concrete Road",
                expected_price=Decimal("12500000"),
                description="4BHK traditional Kerala nalukettu-inspired architecture with teak woodwork and modern kitchen. Beautiful landscaped garden.",
                seller_id="slr-1",
                seller_relationship="Owner",
                status="Under Negotiation",
                running_category="Under Negotiation",
                is_managed=False,
                assigned_agent_id="usr-2",
                listed_date=date.fromisoformat("2026-09-10"),
                latitude=12.3082,
                longitude=75.0911,
            ),
            Property(
                id="prp-3",
                code="TAK003",
                title="Bekal Fort View Coastal Plot",
                type="Land",
                category="Development",
                district="Kasaragod",
                panchayath="Pallikere",
                locality="Bekal",
                area_value=Decimal("1.8"),
                area_unit="Acres",
                road_connectivity="Paved Beach Road",
                expected_price=Decimal("28000000"),
                description="Spectacular sea view tourism-zoned land near Bekal Fort. Clear CRZ clearances for boutique resort or luxury villas.",
                seller_id="slr-2",
                seller_relationship="Power of Attorney Holder",
                status="Available",
                running_category="Active Listing",
                is_managed=False,
                assigned_agent_id="usr-4",
                listed_date=date.fromisoformat("2026-08-15"),
                latitude=12.3924,
                longitude=75.0315,
            ),
            Property(
                id="prp-4",
                code="TAK004",
                title="Green Valley Homestay Resort",
                type="Resort",
                category="Resort",
                district="Kasaragod",
                panchayath="Pallikere",
                locality="Bekal Backwaters",
                area_value=Decimal("85.0"),
                area_unit="Cents",
                road_connectivity="Tar Road",
                expected_price=Decimal("19500000"),
                description="Operating 6-cottage waterfront stay property with high occupancy, swimming pool, and ayurvedic spa license.",
                seller_id="slr-2",
                seller_relationship="Power of Attorney Holder",
                status="Rented",
                running_category="Managed / Operating",
                is_managed=True,
                assigned_agent_id="usr-4",
                listed_date=date.fromisoformat("2026-07-20"),
                latitude=12.3850,
                longitude=75.0410,
            ),
            Property(
                id="prp-5",
                code="TAK005",
                title="Highland Areca & Rubber Plantation",
                type="Land",
                category="Agricultural",
                district="Kasaragod",
                panchayath="Kumbla",
                locality="Ananthapura",
                area_value=Decimal("4.5"),
                area_unit="Acres",
                road_connectivity="Panchayath Tar Road",
                expected_price=Decimal("14500000"),
                description="Mature yield organic plantation with 1,200 arecanut palms, rubber trees, stream border and solar pump.",
                seller_id="slr-3",
                seller_relationship="Owner",
                status="Available",
                running_category="Active Listing",
                is_managed=False,
                assigned_agent_id="usr-3",
                listed_date=date.fromisoformat("2026-09-05"),
                latitude=12.5841,
                longitude=74.9920,
            ),
            Property(
                id="prp-6",
                code="TAK006",
                title="Metro Plaza Commercial Showroom",
                type="Shop",
                category="Commercial",
                district="Kasaragod",
                panchayath="Cheruvathur",
                locality="Cheruvathur Junction",
                area_value=Decimal("3200"),
                area_unit="Sq.ft",
                road_connectivity="National Highway Frontage",
                expected_price=Decimal("16500000"),
                description="Ground and 1st floor showroom space facing NH 66. Suitable for bank branch, jewelers, or diagnostic center.",
                seller_id="slr-4",
                seller_relationship="Broker Agent",
                status="Available",
                running_category="Active Listing",
                is_managed=False,
                assigned_agent_id="usr-2",
                listed_date=date.fromisoformat("2026-10-01"),
                latitude=12.2150,
                longitude=75.1630,
            ),
            Property(
                id="prp-7",
                code="TAK007",
                title="Marina Bay Sea-facing 3BHK Apartment",
                type="Apartment",
                category="Residential",
                district="Kasaragod",
                panchayath="Kasaragod Municipality",
                locality="Kasaragod Beach Road",
                area_value=Decimal("1950"),
                area_unit="Sq.ft",
                road_connectivity="4-Lane Coastal Road",
                expected_price=Decimal("8900000"),
                description="Luxury 7th floor ocean view apartment with club house, basement parking, 24hr power backup and security.",
                seller_id="slr-2",
                seller_relationship="Power of Attorney Holder",
                status="Sold",
                running_category="Inactive",
                is_managed=False,
                assigned_agent_id="usr-4",
                listed_date=date.fromisoformat("2026-06-15"),
                latitude=12.4990,
                longitude=74.9750,
            ),
            Property(
                id="prp-8",
                code="TAK008",
                title="Hilltop View Villa Residence",
                type="House",
                category="Residential",
                district="Kasaragod",
                panchayath="Nileshwar Municipality",
                locality="Raja's High School Road",
                area_value=Decimal("14.0"),
                area_unit="Cents",
                road_connectivity="Tar Road",
                expected_price=Decimal("6800000"),
                description="3BHK independent home with compound wall, car porch, well water and terrace garden in peaceful family neighborhood.",
                seller_id="slr-1",
                seller_relationship="Owner",
                status="Reserved",
                running_category="Reserved",
                is_managed=False,
                assigned_agent_id="usr-2",
                listed_date=date.fromisoformat("2026-09-25"),
                latitude=12.2530,
                longitude=75.1320,
            ),
        ]
        db.add_all(properties)
        db.flush()

        print("Seeding Property Images...")
        images = [
            PropertyImage(id="img-1", property_id="prp-1", url="/src/assets/images/prop_land_coastal_1794980388013.jpg", caption="Frontage View", is_primary=True),
            PropertyImage(id="img-2", property_id="prp-2", url="/src/assets/images/prop_villa_courtyard_1794980387156.jpg", caption="Courtyard Elevation", is_primary=True),
            PropertyImage(id="img-3", property_id="prp-4", url="/src/assets/images/prop_stay_homestay_1794980390926.jpg", caption="Resort Waterfront", is_primary=True),
            PropertyImage(id="img-4", property_id="prp-5", url="/src/assets/images/prop_agriculture_estate_1794980388181.jpg", caption="Plantation Vista", is_primary=True),
            PropertyImage(id="img-5", property_id="prp-6", url="/src/assets/images/prop_commercial_plaza_1794980389884.jpg", caption="Highway Facade", is_primary=True),
            PropertyImage(id="img-6", property_id="prp-7", url="/src/assets/images/prop_apartment_modern_1794980388955.jpg", caption="Apartment Tower", is_primary=True),
        ]
        db.add_all(images)
        db.flush()

        print("Seeding Advances...")
        advances = [
            SellerAdvance(
                id="adv-1",
                code="ADV-1001",
                seller_id="slr-1",
                property_id="prp-1",
                amount=Decimal("50000"),
                collection_date=date.fromisoformat("2026-09-01"),
                payment_method="UPI",
                transaction_reference="UPI/628109827361",
                status="Collected",
                remarks="Initial marketing and documentation advance",
                recorded_by="usr-2",
            ),
            SellerAdvance(
                id="adv-2",
                code="ADV-1002",
                seller_id="slr-2",
                property_id="prp-3",
                amount=Decimal("150000"),
                collection_date=date.fromisoformat("2026-08-15"),
                payment_method="Bank Transfer",
                transaction_reference="NEFT/HDFC298109283",
                status="Collected",
                remarks="Exclusive drone cinematography and high-net-worth buyer outreach advance",
                recorded_by="usr-4",
            ),
        ]
        db.add_all(advances)
        db.flush()

        print("Seeding Leads...")
        leads = [
            Lead(
                id="led-1",
                code="LED-1001",
                name="Siddharth Kamath",
                phone="+91 98450 12890",
                whatsapp="+91 98450 12890",
                email="siddharth.kamath@gmail.com",
                lead_source="Website",
                preferred_district="Kasaragod",
                preferred_locality="Kanhangad",
                min_budget=Decimal("4000000"),
                max_budget=Decimal("5500000"),
                property_type="Land",
                property_category="Residential",
                requirement_description="Looking for 15-20 cents dry plot near Kanhangad town to build home.",
                status="Qualified",
                assigned_agent_id="usr-2",
                next_follow_up_date=date.today(),
            ),
            Lead(
                id="led-2",
                code="LED-1002",
                name="Dr. Shifa Mariam",
                phone="+91 97451 99882",
                whatsapp="+91 97451 99882",
                email="dr.shifa@outlook.com",
                lead_source="Instagram",
                preferred_district="Kasaragod",
                preferred_locality="Kanhangad Town",
                min_budget=Decimal("10000000"),
                max_budget=Decimal("14000000"),
                property_type="Villa",
                property_category="Residential",
                requirement_description="Ready to move in luxury villa with garden for doctor family.",
                status="Negotiation",
                assigned_agent_id="usr-2",
                next_follow_up_date=date.today(),
            ),
            Lead(
                id="led-3",
                code="LED-1003",
                name="Deepak V",
                phone="+91 94460 77123",
                whatsapp="+91 94460 77123",
                email="deepak.v@live.com",
                lead_source="Referral",
                preferred_district="Kasaragod",
                preferred_locality="Bekal",
                min_budget=Decimal("20000000"),
                max_budget=Decimal("32000000"),
                property_type="Land",
                property_category="Development",
                requirement_description="Investor from Bangalore seeking sea view coastal land for wellness retreat.",
                status="Property Shared",
                assigned_agent_id="usr-4",
            ),
            Lead(
                id="led-4",
                code="LED-1004",
                name="Anandhu Pillai",
                phone="+91 98472 66551",
                whatsapp="+91 98472 66551",
                email="anandhu.p@tcs.com",
                lead_source="Facebook",
                preferred_district="Kasaragod",
                min_budget=Decimal("6000000"),
                max_budget=Decimal("9500000"),
                property_type="Apartment",
                property_category="Residential",
                requirement_description="IT professional seeking sea facing 3BHK flat.",
                status="Site Visit",
                assigned_agent_id="usr-4",
            ),
        ]
        db.add_all(leads)
        db.flush()

        print("Seeding Follow-ups...")
        followups = [
            FollowUp(
                id="fup-1",
                title="Call Siddharth Kamath regarding Palm Grove site visit",
                related_type="Lead",
                related_id="led-1",
                property_id="prp-1",
                assigned_agent_id="usr-2",
                date=date.today(),
                time="11:00",
                activity_type="Call",
                notes="Confirm Saturday morning 10 AM site inspection at Puthiyakavu plot.",
                status="Pending",
            ),
            FollowUp(
                id="fup-2",
                title="WhatsApp Dr. Shifa revised counter-offer from owner",
                related_type="Lead",
                related_id="led-2",
                property_id="prp-2",
                assigned_agent_id="usr-2",
                date=date.today(),
                time="15:30",
                activity_type="WhatsApp",
                notes="Send final negotiation matrix for Courtyard Villa.",
                status="Pending",
            ),
        ]
        db.add_all(followups)
        db.flush()

        print("Seeding Deals...")
        deals = [
            Deal(
                id="dl-1",
                code="DL-1001",
                deal_type="Sale",
                lead_id="led-4",
                seller_id="slr-2",
                property_id="prp-7",
                assigned_agent_id="usr-4",
                agreed_price=Decimal("8900000"),
                commission_rate=Decimal("2.0"),
                commission_amount=Decimal("178000"),
                deal_date=date(2026, 10, 15),
                closing_date=date(2026, 10, 28),
                status="Closed",
                notes="Registration completed at Kasaragod Sub-Registrar Office. Commission received in full.",
            ),
        ]
        db.add_all(deals)
        db.flush()

        db.commit()
        print("Seed data successfully committed to database!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
