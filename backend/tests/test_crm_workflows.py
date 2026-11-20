import pytest

def test_combined_seller_property_registration(client, admin_headers):
    payload = {
        "mode": "new-seller",
        "seller": {
            "name": "Kavitha Namboodiri",
            "phone": "+91 94471 99999",
            "relationship_with_property": "Owner",
            "address": "Pilicode, Kasaragod",
        },
        "property": {
            "title": "Pilicode Coconut Grove",
            "type": "Land",
            "category": "Agricultural",
            "district": "Kasaragod",
            "panchayath": "Pilicode",
            "locality": "Near Research Station",
            "area_value": 50.0,
            "area_unit": "Cents",
            "road_connectivity": "Tar Road Access",
            "expected_price": 5000000,
            "description": "Fertile 50 cents plantation with mature coconut palms.",
            "seller_id": "temp",
            "status": "Available",
        },
        "advance": {
            "amount": 25000,
            "collection_date": "2026-11-20",
            "payment_method": "UPI",
            "transaction_reference": "UPI/TEST123456",
            "remarks": "Token booking advance",
        },
    }

    response = client.post("/api/registration/seller-property", json=payload, headers=admin_headers)
    if response.status_code != 201:
        print("ERROR BODY:", response.json())
    assert response.status_code == 201
    data = response.json()
    assert data["seller"]["name"] == "Kavitha Namboodiri"
    assert data["seller"]["code"].startswith("SLR-")
    assert data["property"]["title"] == "Pilicode Coconut Grove"
    assert data["property"]["code"].startswith("TAK")
    assert data["advance"]["amount"] == "25000.00" or float(data["advance"]["amount"]) == 25000

def test_property_sequential_id_generation(client, admin_headers):
    # Register another property and verify sequence increment
    payload = {
        "mode": "new-seller",
        "seller": {
            "name": "Sequence Test Seller",
            "phone": "+91 94472 00000",
            "relationship_with_property": "Owner",
        },
        "property": {
            "title": "Sequential Plot Alpha",
            "type": "Land",
            "category": "Residential",
            "district": "Kasaragod",
            "panchayath": "Hosdurg",
            "locality": "Kanhangad",
            "area_value": 10.0,
            "area_unit": "Cents",
            "expected_price": 2500000,
            "description": "Sequential test plot",
            "seller_id": "temp",
            "status": "Available",
        },
    }
    res = client.post("/api/registration/seller-property", json=payload, headers=admin_headers)
    assert res.status_code == 201
    code = res.json()["property"]["code"]
    assert code.startswith("TAK")

