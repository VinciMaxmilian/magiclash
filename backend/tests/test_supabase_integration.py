"""Opt-in integration tests against the real Supabase project (RLS is enforced by Postgres,
so it must be verified against Postgres, not a fake).

    SUPABASE_IT=1 .venv\\Scripts\\python.exe -m pytest tests/test_supabase_integration.py

Creates throwaway users through the Admin API and deletes them at the end.
"""

import os
import uuid

import httpx
import pytest

from app.core.config import Settings

pytestmark = pytest.mark.skipif(os.environ.get("SUPABASE_IT") != "1", reason="set SUPABASE_IT=1 to run")


@pytest.fixture(scope="module")
def cfg() -> Settings:
    s = Settings()  # reads backend/.env
    assert s.supabase_url and s.supabase_service_role_key and s.supabase_anon_key
    return s


def admin_headers(s: Settings) -> dict[str, str]:
    h = {"apikey": s.supabase_service_role_key}
    if s.supabase_service_role_key.startswith("eyJ"):
        h["Authorization"] = f"Bearer {s.supabase_service_role_key}"
    return h


@pytest.fixture(scope="module")
def users(cfg: Settings):
    created = []
    tokens = []
    with httpx.Client(timeout=15) as http:
        for i in range(2):
            email = f"it-{uuid.uuid4().hex[:10]}@example.com"
            password = uuid.uuid4().hex
            r = http.post(
                f"{cfg.supabase_url}/auth/v1/admin/users",
                headers=admin_headers(cfg),
                json={"email": email, "password": password, "email_confirm": True, "user_metadata": {"username": f"it_user_{i}_{uuid.uuid4().hex[:4]}"}},
            )
            assert r.status_code in (200, 201), r.text
            uid = r.json()["id"]
            created.append(uid)
            t = http.post(
                f"{cfg.supabase_url}/auth/v1/token?grant_type=password",
                headers={"apikey": cfg.supabase_anon_key},
                json={"email": email, "password": password},
            )
            assert t.status_code == 200, t.text
            tokens.append(t.json()["access_token"])
        yield list(zip(created, tokens))
        for uid in created:
            http.delete(f"{cfg.supabase_url}/auth/v1/admin/users/{uid}", headers=admin_headers(cfg))


def rest(cfg: Settings, token: str | None = None) -> httpx.Client:
    h = {"apikey": cfg.supabase_anon_key}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return httpx.Client(base_url=f"{cfg.supabase_url}/rest/v1", headers=h, timeout=15)


def test_signup_trigger_created_rows(cfg, users):
    (uid, token), _ = users
    with rest(cfg, token) as c:
        assert len(c.get("/profiles", params={"id": f"eq.{uid}"}).json()) == 1
        assert len(c.get("/player_stats", params={"user_id": f"eq.{uid}"}).json()) == 1
        assert len(c.get("/player_ratings", params={"user_id": f"eq.{uid}"}).json()) == 3
        assert len(c.get("/profiles_private", params={"user_id": f"eq.{uid}"}).json()) == 1


def test_user_cannot_touch_competitive_data(cfg, users):
    (uid, token), _ = users
    with rest(cfg, token) as c:
        r = c.patch("/player_stats", params={"user_id": f"eq.{uid}"}, json={"wins": 999})
        assert r.status_code in (401, 403), r.text
        r = c.patch("/player_ratings", params={"user_id": f"eq.{uid}"}, json={"rating": 3000})
        assert r.status_code in (401, 403), r.text
        r = c.post("/matches", json={"mode": "ffa", "queue": "1v1", "map_id": "x", "status": "finished"})
        assert r.status_code in (401, 403), r.text
        r = c.post("/player_stats", json={"user_id": uid, "wins": 5})
        assert r.status_code in (401, 403), r.text
        stats = c.get("/player_stats", params={"user_id": f"eq.{uid}"}).json()[0]
        assert stats["wins"] == 0


def test_user_cannot_rename_directly(cfg, users):
    (uid, token), _ = users
    with rest(cfg, token) as c:
        r = c.patch("/profiles", params={"id": f"eq.{uid}"}, json={"username": "renamed_directly"})
        assert r.status_code in (401, 403), r.text


def test_user_can_edit_allowed_columns_of_own_profile_only(cfg, users):
    (uid_a, token_a), (uid_b, _) = users
    with rest(cfg, token_a) as c:
        ok = c.patch("/profiles", params={"id": f"eq.{uid_a}"}, json={"favorite_character": "archer"}, headers={"Prefer": "return=representation"})
        assert ok.status_code == 200 and ok.json()[0]["favorite_character"] == "archer"
        other = c.patch("/profiles", params={"id": f"eq.{uid_b}"}, json={"favorite_character": "archer"}, headers={"Prefer": "return=representation"})
        assert other.status_code == 200 and other.json() == []  # RLS: 0 rows affected


def test_private_data_is_private(cfg, users):
    (_, token_a), (uid_b, _) = users
    with rest(cfg, token_a) as c:
        assert c.get("/profiles_private", params={"user_id": f"eq.{uid_b}"}).json() == []
    with rest(cfg) as anon:
        assert anon.get("/profiles_private").json() == []


def test_security_events_hidden(cfg, users):
    (_, token), _ = users
    with rest(cfg, token) as c:
        r = c.get("/security_events")
        assert r.status_code in (401, 403) or r.json() == []


def test_anon_cannot_write_or_upload(cfg):
    with rest(cfg) as anon:
        assert anon.post("/profiles", json={"id": str(uuid.uuid4()), "username": "ghost"}).status_code in (401, 403)
    with httpx.Client(timeout=15) as http:
        r = http.post(
            f"{cfg.supabase_url}/storage/v1/object/avatars/{uuid.uuid4()}/x.webp",
            headers={"apikey": cfg.supabase_anon_key, "Content-Type": "image/webp"},
            content=b"RIFF0000WEBP",
        )
        assert r.status_code >= 400


def test_rpc_helper_not_exposed(cfg):
    with rest(cfg) as anon:
        r = anon.post("/rpc/is_match_participant", json={"m": str(uuid.uuid4())})
        assert r.status_code == 404
