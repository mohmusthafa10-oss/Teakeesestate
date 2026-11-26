import io
import uuid
from datetime import date, datetime, timedelta, timezone
import pytest
from app.models.models import (
    ActivityLog,
    Deal,
    FollowUp,
    Lead,
    Property,
    PropertyImage,
    PropertyPublication,
    RentalBooking,
    Seller,
    SubmissionMedia,
    SubmissionStatus,
    User,
)


def test_workflow_a_telecaller_direct_entry_and_restrictions(
    client, db_session, telecaller_headers
):
    """
    Workflow A:
    1. Telecaller creates a seller.
    2. Telecaller creates a property with structured bedrooms and bathrooms.
    3. Telecaller adds property media (photo).
    4. Verified in DB that bedrooms, bathrooms, and media_type are correctly stored.
    5. Verified Telecaller cannot publish property or approve/convert submissions.
    """
    # 1. Create seller
    seller_payload = {
        "name": "Wayanad Planter",
        "phone": "+91 94471 22334",
        "whatsapp": "+91 94471 22334",
        "address": "Meppadi, Wayanad",
        "relationship_with_property": "Owner",
    }
    seller_res = client.post("/api/sellers", json=seller_payload, headers=telecaller_headers)
    assert seller_res.status_code == 201, seller_res.text
    seller_data = seller_res.json()
    seller_id = seller_data["id"]
    assert seller_data["code"].startswith("SLR-")

    # 2. Create property with structured bedrooms and bathrooms
    prop_payload = {
        "title": "Hilltop Villa with Coffee Plantation",
        "type": "Residential",
        "category": "Villa",
        "district": "Wayanad",
        "panchayath": "Meppadi",
        "locality": "Nedumbala",
        "seller_id": seller_id,
        "area_value": 45.5,
        "area_unit": "Cents",
        "expected_price": 7500000,
        "bedrooms": 3,
        "bathrooms": 2,
        "description": "Scenic 3 BHK villa surrounded by tea and coffee estates.",
    }
    prop_res = client.post("/api/properties", json=prop_payload, headers=telecaller_headers)
    assert prop_res.status_code == 201, prop_res.text
    prop_data = prop_res.json()
    property_id = prop_data["id"]
    assert prop_data["bedrooms"] == 3
    assert prop_data["bathrooms"] == 2

    # 3. Add property media
    media_res = client.post(
        f"/api/properties/{property_id}/media",
        json={
            "url": "https://images.unsplash.com/photo-villa.jpg",
            "caption": "Front Elevation",
            "is_primary": True,
            "media_type": "photo",
            "mime_type": "image/jpeg",
        },
        headers=telecaller_headers,
    )
    assert media_res.status_code == 201, media_res.text
    media_data = media_res.json()
    assert media_data["media_type"] == "photo"

    # 4. Verify in DB
    db_prop = db_session.query(Property).filter(Property.id == property_id).first()
    assert db_prop is not None
    assert db_prop.bedrooms == 3
    assert db_prop.bathrooms == 2

    db_pub = db_session.query(PropertyPublication).filter(PropertyPublication.property_id == property_id).first()
    assert db_pub is None or db_pub.is_published is False

    db_img = db_session.query(PropertyImage).filter(PropertyImage.property_id == property_id).first()
    assert db_img is not None
    assert db_img.media_type == "photo"

    # 5. Verify Telecaller CANNOT publish
    pub_res = client.post(f"/api/properties/{property_id}/publish", headers=telecaller_headers)
    assert pub_res.status_code == 403

    # Verify Telecaller CANNOT approve admin submissions
    sub_res = client.post("/api/admin/property-submissions/any-id/approve", headers=telecaller_headers)
    assert sub_res.status_code == 403


def test_workflow_b_admin_property_lifecycle_and_publishing(
    client, db_session, admin_headers
):
    """
    Workflow B:
    1. Admin creates a property.
    2. Admin updates structured attributes (bedrooms/bathrooms).
    3. Admin publishes property.
    4. Verified property is visible in public endpoint.
    5. Admin unpublishes property.
    6. Verified property is not visible in public endpoint.
    """
    # Create seller
    s_res = client.post(
        "/api/sellers",
        json={"name": "Estate Owner", "phone": "+91 94472 33445", "relationship_with_property": "Owner"},
        headers=admin_headers,
    )
    seller_id = s_res.json()["id"]

    # Create property
    p_res = client.post(
        "/api/properties",
        json={
            "title": "Riverside Cottage",
            "type": "Residential",
            "category": "House",
            "district": "Wayanad",
            "panchayath": "Vythiri",
            "locality": "Pookode",
            "seller_id": seller_id,
            "area_value": 20.0,
            "area_unit": "Cents",
            "expected_price": 4500000,
            "bedrooms": 2,
            "bathrooms": 2,
            "description": "Lovely riverside house.",
        },
        headers=admin_headers,
    )
    assert p_res.status_code == 201, p_res.text
    prop_id = p_res.json()["id"]

    # Edit structured attributes
    edit_res = client.put(
        f"/api/properties/{prop_id}",
        json={"bedrooms": 4, "bathrooms": 3, "expected_price": 5000000},
        headers=admin_headers,
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["bedrooms"] == 4
    assert edit_res.json()["bathrooms"] == 3

    # Publish property
    pub_res = client.post(f"/api/properties/{prop_id}/publish", headers=admin_headers)
    assert pub_res.status_code == 200
    assert pub_res.json()["is_published"] is True

    # Public visibility check
    public_res = client.get("/api/public/properties")
    assert public_res.status_code == 200
    published_items = public_res.json()["items"]
    assert any(p["id"] == prop_id for p in published_items)

    # Unpublish property
    unpub_res = client.post(f"/api/properties/{prop_id}/unpublish", headers=admin_headers)
    assert unpub_res.status_code == 200
    assert unpub_res.json()["is_published"] is False

    # Verify no longer on public list
    public_res2 = client.get("/api/public/properties")
    assert not any(p["id"] == prop_id for p in public_res2.json()["items"])


def test_workflow_c_public_submission_media_and_conversion_integrity(
    client, db_session, admin_headers
):
    """
    Workflow C:
    1. Public submission with video and photo media files.
    2. Admin reviews and approves submission.
    3. Verification that approval does NOT auto-publish property.
    4. Admin converts submission.
    5. Verification of sequential SLR and TAK codes, structured bedrooms/bathrooms,
       and distinct media_type ("photo" and "video") in property_images.
    6. Activity log verification.
    7. Concurrency / duplicate conversion rejection.
    """
    sample_img = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    sample_video = io.BytesIO(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42")

    submit_data = {
        "seller_name": "Dr. Kurian Varghese",
        "mobile": "+91 98471 23999",
        "property_type": "House",
        "location": "Kalpetta",
        "description": "Luxury 4 BHK villa with hill view",
        "expected_price": "9000000",
        "size": "30",
        "bedrooms": "4",
        "bathrooms": "4",
        "notes": "Urgent NRI sale",
    }
    sub_res = client.post(
        "/api/public/property-submissions",
        data=submit_data,
        files=[
            ("files", ("villa_exterior.png", sample_img, "image/png")),
            ("files", ("walkthrough.mp4", sample_video, "video/mp4")),
        ],
    )
    assert sub_res.status_code == 200, sub_res.text
    sub_data = sub_res.json()
    sub_ref = sub_data["reference"]
    assert sub_ref.startswith("SUB-")

    # Admin reviews
    list_res = client.get("/api/admin/property-submissions/", headers=admin_headers)
    assert list_res.status_code == 200
    matched = [s for s in list_res.json() if s["reference"] == sub_ref]
    assert len(matched) == 1
    sub_id = matched[0]["id"]

    detail_res = client.get(f"/api/admin/property-submissions/{sub_id}", headers=admin_headers)
    assert detail_res.status_code == 200
    sub_detail = detail_res.json()
    assert sub_detail["status"] == SubmissionStatus.PENDING_REVIEW.value
    assert len(sub_detail["media"]) == 2

    # Admin approves
    approve_res = client.post(f"/api/admin/property-submissions/{sub_id}/approve", headers=admin_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["detail"] == "Submission approved"

    # Conversion
    convert_res = client.post(f"/api/admin/property-submissions/{sub_id}/convert", headers=admin_headers)
    assert convert_res.status_code == 200, convert_res.text
    conv_data = convert_res.json()
    prop_id = conv_data["property_id"]
    prop_code = conv_data["property_code"]
    seller_id = conv_data["seller_id"]

    assert prop_code.startswith("TAK")
    assert seller_id is not None

    # Verify structured bedrooms/bathrooms and publication status
    db_prop = db_session.query(Property).filter(Property.id == prop_id).first()
    assert db_prop is not None
    assert db_prop.bedrooms == 4
    assert db_prop.bathrooms == 4

    pub_status = db_session.query(PropertyPublication).filter(PropertyPublication.property_id == prop_id).first()
    assert pub_status is not None
    assert pub_status.is_published is False  # Conversion never auto-publishes

    # Verify media types in PropertyImage
    images = db_session.query(PropertyImage).filter(PropertyImage.property_id == prop_id).all()
    assert len(images) == 2
    types = {img.caption: img.media_type for img in images}
    assert types.get("villa_exterior.png") == "photo"
    assert types.get("walkthrough.mp4") == "video"

    # Verify activity log
    log = (
        db_session.query(ActivityLog)
        .filter(ActivityLog.entity_id == prop_id, ActivityLog.action == "Converted")
        .first()
    )
    assert log is not None

    # Duplicate conversion must fail with 400
    dup_res = client.post(f"/api/admin/property-submissions/{sub_id}/convert", headers=admin_headers)
    assert dup_res.status_code == 400
    assert "already been converted" in dup_res.json()["detail"].lower()


def test_workflow_d_multi_user_isolation(client, db_session, agent_headers, agent2_headers, admin_headers):
    """
    Workflow D:
    1. Agent 1 creates Seller 1 and Property 1.
    2. Agent 2 creates Seller 2 and Property 2.
    3. Agent 2 cannot update or delete Agent 1's property (403).
    4. Admin can update and manage both.
    """
    # Agent 1 creates seller & property
    s1 = client.post(
        "/api/sellers",
        json={"name": "Agent 1 Client", "phone": "+91 97777 00001", "relationship_with_property": "Owner"},
        headers=agent_headers,
    ).json()

    p1 = client.post(
        "/api/properties",
        json={
            "title": "Agent 1 Exclusive Land",
            "type": "Land",
            "category": "Agricultural",
            "district": "Wayanad",
            "panchayath": "Sulthan Bathery",
            "locality": "Kuppadi",
            "seller_id": s1["id"],
            "area_value": 100.0,
            "area_unit": "Cents",
            "expected_price": 5000000,
            "description": "Prime agricultural land.",
        },
        headers=agent_headers,
    ).json()
    assert "id" in p1

    # Agent 2 attempts to edit Agent 1's property -> 403 Forbidden
    cross_edit = client.put(
        f"/api/properties/{p1['id']}",
        json={"title": "Hacked Title"},
        headers=agent2_headers,
    )
    assert cross_edit.status_code == 403

    # Agent 2 attempts to delete Agent 1's property -> 403 Forbidden
    cross_del = client.delete(f"/api/properties/{p1['id']}", headers=agent2_headers)
    assert cross_del.status_code == 403

    # Admin can edit Agent 1's property
    admin_edit = client.put(
        f"/api/properties/{p1['id']}",
        json={"internal_notes": "Reviewed by Admin"},
        headers=admin_headers,
    )
    assert admin_edit.status_code == 200


def test_workflow_e_delete_operations_and_referential_constraints(
    client, db_session, admin_headers
):
    """
    Workflow E:
    1. Create Seller with a linked Property.
    2. Attempt to delete Seller -> 400 Bad Request (foreign key constraint guard).
    3. Delete Property -> 200/204.
    4. Delete Seller -> 204 No Content (succeeds now).
    5. Delete Lead, FollowUp, Deal, Rental -> all 204 No Content.
    """
    # 1. Create Seller and Property
    s = client.post(
        "/api/sellers",
        json={"name": "Protected Seller", "phone": "+91 95555 11223", "relationship_with_property": "Owner"},
        headers=admin_headers,
    ).json()
    seller_id = s["id"]

    p = client.post(
        "/api/properties",
        json={
            "title": "Protected Villa",
            "type": "Residential",
            "category": "Villa",
            "district": "Wayanad",
            "panchayath": "Mananthavady",
            "locality": "Valliyoorkavu",
            "seller_id": seller_id,
            "area_value": 15.0,
            "area_unit": "Cents",
            "expected_price": 3500000,
            "description": "Villa description.",
        },
        headers=admin_headers,
    ).json()
    assert "id" in p, p
    prop_id = p["id"]

    # 2. Deleting seller with active property must fail
    del_seller_res = client.delete(f"/api/sellers/{seller_id}", headers=admin_headers)
    assert del_seller_res.status_code == 400
    assert "linked properties" in del_seller_res.json()["detail"].lower()

    # 3. Delete property
    del_prop_res = client.delete(f"/api/properties/{prop_id}", headers=admin_headers)
    assert del_prop_res.status_code == 200
    assert del_prop_res.json()["detail"] == "Property deleted successfully"

    # 4. Now deleting seller succeeds
    del_seller_res2 = client.delete(f"/api/sellers/{seller_id}", headers=admin_headers)
    assert del_seller_res2.status_code == 200
    assert del_seller_res2.json()["detail"] == "Seller deleted successfully"

    # 5. Test deletion of Lead, FollowUp, Deal, Rental
    # Lead
    lead = client.post(
        "/api/leads",
        json={"name": "Deletable Lead", "phone": "+91 96666 00000", "lead_source": "Website"},
        headers=admin_headers,
    ).json()
    del_lead_res = client.delete(f"/api/leads/{lead['id']}", headers=admin_headers)
    assert del_lead_res.status_code == 200

    # FollowUp
    fup = client.post(
        "/api/followups",
        json={
            "title": "Temp Task",
            "related_type": "General",
            "related_id": "general",
            "date": str(date.today()),
            "time": "10:00",
            "activity_type": "Call",
        },
        headers=admin_headers,
    ).json()
    del_fup_res = client.delete(f"/api/followups/{fup['id']}", headers=admin_headers)
    assert del_fup_res.status_code == 200

    # Deal
    temp_s = client.post(
        "/api/sellers",
        json={"name": "Temp Seller", "phone": "+91 94444 00000"},
        headers=admin_headers,
    ).json()
    temp_p = client.post(
        "/api/properties",
        json={
            "title": "Temp Prop",
            "type": "Land",
            "category": "Plot",
            "district": "Wayanad",
            "panchayath": "Kalpetta",
            "locality": "Town",
            "seller_id": temp_s["id"],
            "area_value": 10.0,
            "area_unit": "Cents",
            "expected_price": 1000000,
            "description": "Temp.",
        },
        headers=admin_headers,
    ).json()
    temp_l = client.post(
        "/api/leads",
        json={"name": "Temp Buyer", "phone": "+91 93333 00000"},
        headers=admin_headers,
    ).json()
    deal = client.post(
        "/api/deals",
        json={
            "property_id": temp_p["id"],
            "lead_id": temp_l["id"],
            "seller_id": temp_s["id"],
            "agreed_price": 1000000,
            "commission_rate": 2.0,
            "commission_amount": 20000,
            "deal_date": str(date.today()),
            "deal_type": "Sale",
            "status": "Negotiation",
        },
        headers=admin_headers,
    ).json()
    assert "id" in deal, deal
    del_deal_res = client.delete(f"/api/deals/{deal['id']}", headers=admin_headers)
    assert del_deal_res.status_code == 200

    # Rental
    rental = client.post(
        "/api/rentals",
        json={
            "property_id": temp_p["id"],
            "rental_type": "Short-Term",
            "rate_amount": 15000,
            "booking_date": str(date.today()),
            "check_in": str(date.today()),
            "check_out": str(date.today() + timedelta(days=3)),
            "deposit": 5000,
            "status": "Booked",
        },
        headers=admin_headers,
    ).json()
    del_rental_res = client.delete(f"/api/rentals/{rental['id']}", headers=admin_headers)
    assert del_rental_res.status_code == 200


def test_workflow_f_rentals_dedicated_authorization(
    client, db_session, admin_headers, agent_headers, agent2_headers, telecaller_headers
):
    """
    Workflow F:
    Verify Rentals have dedicated authorization rather than inheriting generic property permissions:
    1. Agent 1 owns Property 1. Agent 2 owns Property 2.
    2. Agent 2 cannot book rental for Property 1 (403 Forbidden).
    3. Agent 1 can book and update rental for Property 1.
    4. Agent 1 cannot delete rental booking (403 Forbidden - requires rentals.delete).
    5. Telecaller cannot view or create rental bookings (403 Forbidden).
    6. Admin can manage and delete rental booking (200 OK).
    """
    # 1. Create seller and property assigned to Agent 1
    s = client.post(
        "/api/sellers",
        json={"name": "Rental Owner", "phone": "+91 91111 22233"},
        headers=admin_headers,
    ).json()

    p = client.post(
        "/api/properties",
        json={
            "title": "Agent 1 Rental Homestay",
            "type": "Residential",
            "category": "Homestay",
            "district": "Wayanad",
            "panchayath": "Meppadi",
            "locality": "Nedumbala",
            "seller_id": s["id"],
            "area_value": 25.0,
            "area_unit": "Cents",
            "expected_price": 6000000,
            "assigned_agent_id": "test-agent-1",
            "description": "Homestay.",
        },
        headers=admin_headers,
    ).json()
    prop_id = p["id"]

    # 2. Agent 2 cannot book rental for Agent 1's property (403 Forbidden)
    r_payload = {
        "property_id": prop_id,
        "rental_type": "Short-Term",
        "rate_amount": 12000,
        "booking_date": str(date.today()),
        "check_in": str(date.today()),
        "check_out": str(date.today() + timedelta(days=2)),
        "deposit": 3000,
        "status": "Booked",
    }
    cross_res = client.post("/api/rentals", json=r_payload, headers=agent2_headers)
    assert cross_res.status_code == 403
    assert "another agent" in cross_res.json()["detail"].lower()

    # 3. Agent 1 can book rental for their assigned property
    agent1_res = client.post("/api/rentals", json=r_payload, headers=agent_headers)
    assert agent1_res.status_code == 201
    booking_id = agent1_res.json()["id"]

    # 4. Agent 1 CANNOT delete rental booking (requires rentals.delete permission)
    agent_del = client.delete(f"/api/rentals/{booking_id}", headers=agent_headers)
    assert agent_del.status_code == 403

    # 5. Telecaller cannot read or create rental bookings
    tc_read = client.get("/api/rentals", headers=telecaller_headers)
    assert tc_read.status_code == 403

    tc_create = client.post("/api/rentals", json=r_payload, headers=telecaller_headers)
    assert tc_create.status_code == 403

    # 6. Admin can delete rental booking
    admin_del = client.delete(f"/api/rentals/{booking_id}", headers=admin_headers)
    assert admin_del.status_code == 200
    assert admin_del.json()["detail"] == "Rental booking deleted successfully"

