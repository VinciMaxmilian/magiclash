import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app
from app.security import auth as auth_module
from app.security.rate_limit import InMemoryRateLimiter
from tests.conftest import make_settings
from tests.fakes import FakeSupabase

ALICE = "11111111-1111-1111-1111-111111111111"
BOB = "22222222-2222-2222-2222-222222222222"
TOKEN_A = "aaa.bbb.ccc"
TOKEN_B = "ddd.eee.fff"


@pytest.fixture
def sb() -> FakeSupabase:
    fake = FakeSupabase()
    fake.add_user(ALICE, "alice", TOKEN_A)
    fake.add_user(BOB, "bob", TOKEN_B)
    return fake


@pytest.fixture
def client(sb: FakeSupabase) -> TestClient:
    auth_module._cache = auth_module._TokenCache()
    from app.api import profiles

    profiles._write_limiter = InMemoryRateLimiter(per_minute=1000)
    app = create_app(make_settings(supabase_url="https://example.supabase.co"), InMemoryRateLimiter(10_000), supabase=sb)
    return TestClient(app)


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def png_bytes(w: int = 64, h: int = 64) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", (w, h), (200, 50, 50, 255)).save(buf, format="PNG")
    return buf.getvalue()


# ── Authentication ──────────────────────────────────────────────────────────


def test_me_requires_token(client):
    assert client.get("/api/profiles/me").status_code == 401


@pytest.mark.parametrize("header", ["Bearer", "Basic abc", "Bearer not-a-jwt", "Bearer " + "a.b.c" * 2000])
def test_malformed_tokens_rejected(client, header):
    assert client.get("/api/profiles/me", headers={"Authorization": header}).status_code == 401


def test_invalid_token_rejected(client):
    assert client.get("/api/profiles/me", headers=auth("x.y.z")).status_code == 401


def test_me_returns_own_profile_and_private_data(client):
    r = client.get("/api/profiles/me", headers=auth(TOKEN_A))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == ALICE
    assert body["username"] == "alice"
    assert body["settings"] == {"volume": 0.5}
    assert body["stats"]["wins"] == 2


def test_token_validation_is_cached(client, sb):
    for _ in range(3):
        client.get("/api/profiles/me", headers=auth(TOKEN_A))
    assert sb.auth_calls == 1


# ── Public profiles ─────────────────────────────────────────────────────────


def test_public_profile_hides_private_fields(client):
    r = client.get("/api/profiles/bob")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "bob"
    for private in ("id", "email", "settings"):
        assert private not in body


def test_public_profile_404_and_path_validation(client):
    assert client.get("/api/profiles/nobody").status_code == 404
    assert client.get("/api/profiles/../../etc").status_code in (404, 422)
    assert client.get("/api/profiles/a%27%20or%201%3D1").status_code in (404, 422)


# ── Updates ─────────────────────────────────────────────────────────────────


def test_update_own_profile(client, sb):
    r = client.patch("/api/profiles/me", headers=auth(TOKEN_A), json={"username": "Alice_2", "favorite_character": "archer"})
    assert r.status_code == 200
    assert r.json()["username"] == "Alice_2"
    assert r.json()["favorite_character"] == "archer"
    # Bob untouched
    assert next(p for p in sb.tables["profiles"] if p["id"] == BOB)["username"] == "bob"


def test_cannot_update_someone_else_via_body(client, sb):
    # There is no way to address another user: extra fields are rejected outright.
    r = client.patch("/api/profiles/me", headers=auth(TOKEN_A), json={"id": BOB, "username": "hacked"})
    assert r.status_code == 422
    assert next(p for p in sb.tables["profiles"] if p["id"] == BOB)["username"] == "bob"


@pytest.mark.parametrize(
    "payload",
    [
        {"wins": 999},
        {"rating": 3000},
        {"username": "a"},
        {"username": "x" * 17},
        {"username": "<script>"},
        {"username": "admin"},
        {"username": "player_1234"},
        {"favorite_character": "dragon"},
        {"avatar_id": "../../etc/passwd"},
        {},
    ],
)
def test_invalid_or_forbidden_updates_rejected(client, payload):
    r = client.patch("/api/profiles/me", headers=auth(TOKEN_A), json=payload)
    assert r.status_code == 422


def test_username_taken(client):
    r = client.patch("/api/profiles/me", headers=auth(TOKEN_A), json={"username": "BOB"})
    assert r.status_code == 409
    assert r.json()["error"] == "username_taken"


def test_write_rate_limit(client):
    from app.api import profiles

    profiles._write_limiter = InMemoryRateLimiter(per_minute=60, burst=2)
    codes = [
        client.patch("/api/profiles/me", headers=auth(TOKEN_A), json={"favorite_character": "knight"}).status_code
        for _ in range(4)
    ]
    assert codes[:2] == [200, 200]
    assert 429 in codes[2:]


# ── Avatar upload ───────────────────────────────────────────────────────────


def test_avatar_upload_reencodes_and_stores_random_name(client, sb):
    r = client.post("/api/profiles/me/avatar", headers=auth(TOKEN_A), files={"file": ("me.png", png_bytes(), "image/png")})
    assert r.status_code == 200, r.text
    url = r.json()["avatar_url"]
    assert url.startswith("https://example.supabase.co/storage/v1/object/public/avatars/" + ALICE + "/")
    assert url.endswith(".webp") and "me.png" not in url
    stored = next(iter(sb.storage.values()))
    assert stored[:4] == b"RIFF" and stored[8:12] == b"WEBP"


def test_avatar_replacing_deletes_old_file(client, sb):
    for _ in range(2):
        client.post("/api/profiles/me/avatar", headers=auth(TOKEN_A), files={"file": ("me.png", png_bytes(), "image/png")})
    assert len(sb.storage) == 1


@pytest.mark.parametrize(
    "name,data,ctype",
    [
        ("evil.exe", b"MZ\x90\x00" + b"\x00" * 100, "application/octet-stream"),
        ("fake.png", b"MZ\x90\x00" + b"\x00" * 100, "image/png"),
        ("script.svg", b"<svg onload=alert(1)>", "image/svg+xml"),
        ("polyglot.png", b"\x89PNG\r\n\x1a\n<?php system($_GET['c']); ?>", "image/png"),
        ("mismatch.webp", png_bytes(), "image/webp"),
        ("empty.png", b"", "image/png"),
        ("tiny.png", png_bytes(4, 4), "image/png"),
    ],
)
def test_malicious_or_invalid_avatars_rejected(client, sb, name, data, ctype):
    r = client.post("/api/profiles/me/avatar", headers=auth(TOKEN_A), files={"file": (name, data, ctype)})
    assert r.status_code == 422
    assert sb.storage == {}


def test_avatar_too_large(client, sb):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (520 * 1024)
    r = client.post("/api/profiles/me/avatar", headers=auth(TOKEN_A), files={"file": ("big.png", big, "image/png")})
    assert r.status_code == 413
    assert sb.storage == {}


def test_avatar_requires_auth(client, sb):
    r = client.post("/api/profiles/me/avatar", files={"file": ("me.png", png_bytes(), "image/png")})
    assert r.status_code == 401
    assert sb.storage == {}


def test_supabase_unavailable_is_503():
    auth_module._cache = auth_module._TokenCache()
    app = create_app(make_settings(), InMemoryRateLimiter(10_000), supabase=None)
    c = TestClient(app)
    assert c.get("/api/profiles/me", headers=auth(TOKEN_A)).status_code == 503
