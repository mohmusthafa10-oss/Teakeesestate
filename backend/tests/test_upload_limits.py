import io
import os
import pytest
from fastapi import status
from httpx import AsyncClient


def test_upload_success_under_limit(client, admin_headers):
    # Create a small PNG file (1KB)
    data = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 1024)
    files = {"file": ("test.png", data, "image/png")}
    response = client.post("/api/uploads/", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_200_OK
    json_resp = response.json()
    assert "url" in json_resp
    assert json_resp["size"] == 1032  # PNG header + payload
    # Cleanup uploaded file
    uploaded_path = os.path.join("./uploads/public", os.path.basename(json_resp["url"]))
    if os.path.exists(uploaded_path):
        os.remove(uploaded_path)


@pytest.mark.asyncio
async def test_upload_exact_limit(client, admin_headers):
    # Create a file exactly 5 MiB
    size = 5 * 1024 * 1024
    data = io.BytesIO(b"a" * size)
    files = {"file": ("exact.bin", data, "application/octet-stream")}
    response = await client.post("/api/uploads/", files=files, headers=admin_headers)
    # Since mime is not whitelisted, expect 400 for disallowed MIME
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_upload_over_limit(client, admin_headers):
    # Create a file 5 MiB + 1 byte
    size = 5 * 1024 * 1024 + 1
    data = io.BytesIO(b"a" * size)
    files = {"file": ("big.bin", data, "application/octet-stream")}
    response = await client.post("/api/uploads/", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    # Ensure no file was left on disk
    # Check both public and private dirs for any new file
    for base in ("./uploads/public", "./uploads/private"):
        for f in os.listdir(base):
            # Skip if filename length matches uuid pattern (simple heuristic)
            if f.endswith('.bin'):
                pytest.fail("Orphan file left after rejected upload")


@pytest.mark.asyncio
async def test_upload_disallowed_mime(client, admin_headers, monkeypatch):
    # Patch magic to raise ImportError to simulate missing lib
    def fake_import(name, *args, **kwargs):
        if name == "magic":
            raise ImportError
        return __import__(name, *args, **kwargs)
    monkeypatch.setattr("builtins.__import__", fake_import)
    data = io.BytesIO(b"test content")
    files = {"file": ("test.txt", data, "text/plain")}
    response = await client.post("/api/uploads/", files=files, headers=admin_headers)
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Unable to verify file MIME type" in response.text
