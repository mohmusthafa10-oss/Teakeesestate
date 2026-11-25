import io
import os
import pytest
from fastapi import status
from app.core.config import settings
from app.api.routes.uploads import ensure_upload_dirs


def _make_valid_png(size_bytes: int) -> bytes:
    """Generate valid PNG bytes of exact specified length."""
    header = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    if size_bytes < len(header):
        raise ValueError(f"Size must be at least {len(header)} bytes")
    return header + (b"0" * (size_bytes - len(header)))


def test_upload_success_under_limit(client, admin_headers):
    data = io.BytesIO(_make_valid_png(1024))
    files = {"file": ("test.png", data, "image/png")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_200_OK
    json_resp = response.json()
    assert "url" in json_resp
    assert json_resp["size"] == 1024
    assert json_resp["mime"] == "image/png"
    assert json_resp["private"] is False
    assert json_resp["url"].startswith("/uploads/")

    # Verify actual file on disk
    filename = os.path.basename(json_resp["url"])
    disk_path = os.path.join(settings.PUBLIC_UPLOAD_DIR, filename)
    assert os.path.exists(disk_path)
    assert os.path.getsize(disk_path) == 1024


def test_upload_exact_limit(client, admin_headers):
    size = 5 * 1024 * 1024  # Exactly 5 MiB
    data = io.BytesIO(_make_valid_png(size))
    files = {"file": ("exact.png", data, "image/png")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_200_OK
    json_resp = response.json()
    assert json_resp["size"] == size
    assert json_resp["mime"] == "image/png"

    # Verify file exists on disk
    filename = os.path.basename(json_resp["url"])
    disk_path = os.path.join(settings.PUBLIC_UPLOAD_DIR, filename)
    assert os.path.exists(disk_path)
    assert os.path.getsize(disk_path) == size


def test_upload_over_limit(client, admin_headers):
    size = 5 * 1024 * 1024 + 1  # 5 MiB + 1 byte
    data = io.BytesIO(_make_valid_png(size))
    files = {"file": ("big.png", data, "image/png")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "exceeds 5 MiB limit" in response.json()["detail"]

    # Verify no file remains on disk
    for upload_dir in (settings.PUBLIC_UPLOAD_DIR, settings.PRIVATE_UPLOAD_DIR):
        for f in os.listdir(upload_dir):
            assert not f.endswith("big.png"), f"Orphan file {f} left on disk in {upload_dir}"


def test_upload_executable_renamed_to_image(client, admin_headers):
    # Linux ELF executable binary header disguised as a PNG
    elf_header = b"\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00" + b"\x00" * 500
    files = {"file": ("exploit.png", io.BytesIO(elf_header), "image/png")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Disallowed MIME type" in response.json()["detail"]

    # Verify no file left on disk
    for upload_dir in (settings.PUBLIC_UPLOAD_DIR, settings.PRIVATE_UPLOAD_DIR):
        for f in os.listdir(upload_dir):
            assert "exploit" not in f


def test_upload_text_renamed_to_pdf(client, admin_headers):
    # Plain text disguised as a PDF
    text_content = b"This is plain text pretending to be a PDF document."
    files = {"file": ("fake.pdf", io.BytesIO(text_content), "application/pdf")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST

    # Verify no file left on disk
    for upload_dir in (settings.PUBLIC_UPLOAD_DIR, settings.PRIVATE_UPLOAD_DIR):
        for f in os.listdir(upload_dir):
            assert "fake" not in f


def test_upload_valid_image_with_wrong_extension(client, admin_headers):
    # Valid PNG image bytes given a .jpg extension
    png_content = _make_valid_png(512)
    files = {"file": ("mismatch.jpg", io.BytesIO(png_content), "image/jpeg")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "MIME type does not match file extension" in response.json()["detail"]

    # Verify no file left on disk
    for upload_dir in (settings.PUBLIC_UPLOAD_DIR, settings.PRIVATE_UPLOAD_DIR):
        for f in os.listdir(upload_dir):
            assert "mismatch" not in f


def test_upload_unsupported_mime(client, admin_headers):
    # Disallowed extension (.txt)
    files = {"file": ("test.txt", io.BytesIO(b"Hello world"), "text/plain")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Disallowed file format" in response.json()["detail"]


def test_upload_missing_magic_dependency(client, admin_headers, monkeypatch):
    # Simulate missing python-magic lib
    import builtins
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "magic":
            raise ImportError("libmagic not found")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    data = io.BytesIO(_make_valid_png(512))
    files = {"file": ("doc.png", data, "image/png")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unable to verify file MIME type" in response.json()["detail"]

    # Verify no file left on disk
    for upload_dir in (settings.PUBLIC_UPLOAD_DIR, settings.PRIVATE_UPLOAD_DIR):
        for f in os.listdir(upload_dir):
            assert "doc" not in f


def test_upload_magic_inspection_exception(client, admin_headers, monkeypatch):
    # Simulate runtime exception from magic.from_file
    import magic

    def fake_from_file(*args, **kwargs):
        raise RuntimeError("libmagic internal segmentation fault")

    monkeypatch.setattr(magic, "from_file", fake_from_file)

    data = io.BytesIO(_make_valid_png(512))
    files = {"file": ("crashed.png", data, "image/png")}
    response = client.post("/api/uploads", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unable to verify file MIME type" in response.json()["detail"]

    # Verify no file left on disk
    for upload_dir in (settings.PUBLIC_UPLOAD_DIR, settings.PRIVATE_UPLOAD_DIR):
        for f in os.listdir(upload_dir):
            assert "crashed" not in f


def test_private_upload_flow_and_authorization(client, agent_headers, agent2_headers, admin_headers):
    """
    Test complete private media flow:
    - Agent 1 uploads a private document.
    - Verified stored in PRIVATE_UPLOAD_DIR, not in PUBLIC_UPLOAD_DIR.
    - Public static mount returns 404.
    - Unauthenticated download returns 401.
    - Agent 2 (different agent) download returns 403 (isolation verified).
    - Agent 1 (owner) download returns 200 with file content.
    - Admin download returns 200 with file content.
    """
    raw_content = _make_valid_png(2048)
    files = {"file": ("deed.png", io.BytesIO(raw_content), "image/png")}

    # 1. Agent 1 uploads private file
    res = client.post("/api/uploads?private=true", files=files, headers=agent_headers)
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["private"] is True
    assert data["url"].startswith("/api/uploads/private/")
    storage_key = data["storage_key"]

    # 2. Verify file is in private directory, NOT in public
    priv_file = os.path.join(settings.PRIVATE_UPLOAD_DIR, storage_key)
    pub_file = os.path.join(settings.PUBLIC_UPLOAD_DIR, storage_key)
    assert os.path.exists(priv_file)
    assert not os.path.exists(pub_file)

    # 3. Public static mount MUST NOT serve this private file
    res_static = client.get(f"/uploads/{storage_key}")
    assert res_static.status_code == status.HTTP_404_NOT_FOUND

    # 4. Unauthenticated download attempt MUST return 401
    res_unauth = client.get(f"/api/uploads/private/{storage_key}")
    assert res_unauth.status_code == status.HTTP_401_UNAUTHORIZED

    # 5. Agent 2 (different agent) download attempt MUST return 403 Forbidden
    res_agent2 = client.get(f"/api/uploads/private/{storage_key}", headers=agent2_headers)
    assert res_agent2.status_code == status.HTTP_403_FORBIDDEN
    assert "Cannot access another agent's private documents" in res_agent2.json()["detail"]

    # 6. Agent 1 (owner) download MUST return 200 with content
    res_agent1 = client.get(f"/api/uploads/private/{storage_key}", headers=agent_headers)
    assert res_agent1.status_code == status.HTTP_200_OK
    assert res_agent1.content == raw_content

    # 7. Admin download MUST return 200 with content
    res_admin = client.get(f"/api/uploads/private/{storage_key}", headers=admin_headers)
    assert res_admin.status_code == status.HTTP_200_OK
    assert res_admin.content == raw_content


def test_private_download_path_traversal_blocked(client, admin_headers):
    # Attempt path traversal via private endpoint
    response = client.get("/api/uploads/private/../../conftest.py", headers=admin_headers)
    assert response.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND)


def test_upload_storage_dirs_non_overlap_validation():
    # Verify ensure_upload_dirs() validates that directories do not overlap
    old_pub = settings.PUBLIC_UPLOAD_DIR
    old_priv = settings.PRIVATE_UPLOAD_DIR

    try:
        # Same directory
        settings.PUBLIC_UPLOAD_DIR = "./temp_test_dir"
        settings.PRIVATE_UPLOAD_DIR = "./temp_test_dir"
        with pytest.raises(ValueError, match="cannot be the same directory"):
            ensure_upload_dirs()

        # Subdirectory overlap
        settings.PUBLIC_UPLOAD_DIR = "./temp_test_dir"
        settings.PRIVATE_UPLOAD_DIR = "./temp_test_dir/nested"
        with pytest.raises(ValueError, match="cannot overlap"):
            ensure_upload_dirs()
    finally:
        settings.PUBLIC_UPLOAD_DIR = old_pub
        settings.PRIVATE_UPLOAD_DIR = old_priv
        ensure_upload_dirs()


def test_upload_isolation_temp_directories():
    # Verify test suite uses isolated test directories
    pub, priv = ensure_upload_dirs()
    assert os.path.exists(pub)
    assert os.path.exists(priv)
    assert "test_uploads_" in pub or "public" in pub
    assert pub != priv


def test_private_document_database_record_authorization_and_reassignment(
    client, db_session, agent_headers, agent2_headers, admin_headers
):
    """
    Test real database record-backed authorization:
    - Associate private document with a Property record assigned to Agent 1.
    - Agent 1 can download it (200).
    - Agent 2 is denied (403).
    - Admin can download it (200).
    - Reassign Property to Agent 2 in database:
      - Agent 1 is now denied (403)!
      - Agent 2 is now authorized (200)!
    - Delete PropertyDocument from database:
      - Agent 2 is now denied (403)!
    """
    from decimal import Decimal
    from app.models.models import Property, PropertyDocument

    # 1. Upload a private file
    content = _make_valid_png(1024)
    res_up = client.post(
        "/api/uploads?private=true",
        files={"file": ("title_deed.png", io.BytesIO(content), "image/png")},
        headers=agent_headers,
    )
    assert res_up.status_code == status.HTTP_200_OK
    storage_key = res_up.json()["storage_key"]

    # 2. Create Property assigned to Agent 1 (test-agent-1)
    prop = Property(
        id="prop-priv-auth-test",
        code="TAK-TEST-99",
        title="Restricted Private Estate",
        type="Villa",
        category="Residential",
        district="Ernakulam",
        panchayath="Kochi",
        area_value=Decimal("2500"),
        area_unit="sqft",
        expected_price=Decimal("15000000"),
        assigned_agent_id="test-agent-1",
    )
    db_session.add(prop)

    # 3. Attach PropertyDocument to Property
    doc = PropertyDocument(
        id="doc-priv-auth-test",
        entity_type="Property",
        entity_id=prop.id,
        name=storage_key,
        doc_type="Deed",
    )
    db_session.add(doc)
    db_session.commit()

    try:
        # Agent 1 (assigned advisor) -> 200
        res1 = client.get(f"/api/uploads/private/{storage_key}", headers=agent_headers)
        assert res1.status_code == status.HTTP_200_OK

        # Agent 2 (unassigned advisor) -> 403
        res2 = client.get(f"/api/uploads/private/{storage_key}", headers=agent2_headers)
        assert res2.status_code == status.HTTP_403_FORBIDDEN
        assert "assigned to another advisor" in res2.json()["detail"]

        # Admin -> 200
        res_adm = client.get(f"/api/uploads/private/{storage_key}", headers=admin_headers)
        assert res_adm.status_code == status.HTTP_200_OK

        # 4. Reassign property to Agent 2
        prop.assigned_agent_id = "test-agent-2"
        db_session.commit()
        # Agent 1 now loses access -> 403
        res1_after = client.get(f"/api/uploads/private/{storage_key}", headers=agent_headers)
        assert res1_after.status_code == status.HTTP_403_FORBIDDEN

        # Agent 2 now gains access -> 200
        res2_after = client.get(f"/api/uploads/private/{storage_key}", headers=agent2_headers)
        assert res2_after.status_code == status.HTTP_200_OK

        # 5. Delete the database record
        db_session.delete(doc)
        db_session.commit()
        # Agent 2 now loses access -> 403
        res2_deleted = client.get(f"/api/uploads/private/{storage_key}", headers=agent2_headers)
        assert res2_deleted.status_code == status.HTTP_403_FORBIDDEN

    finally:
        # Cleanup DB
        db_session.query(PropertyDocument).filter(PropertyDocument.id == "doc-priv-auth-test").delete()
        db_session.query(Property).filter(Property.id == "prop-priv-auth-test").delete()
        db_session.commit()
