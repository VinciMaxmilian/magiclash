import json
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.api import internal, online
from app.main import create_app
from app.security import auth as auth_module
from app.security.rate_limit import InMemoryRateLimiter
from app.security.tokens import (
    GUEST_AUDIENCE,
    ISSUER,
    REALTIME_AUDIENCE,
    ReplayGuard,
    TokenError,
    issue_guest_token,
    sign_body,
    verify_guest_token,
)
from tests.conftest import make_settings
from tests.fakes import FakeSupabase

GS = "test-game-secret-0123456789abcdef"
GT = "test-guest-secret-0123456789abcdef"
ALICE = "11111111-1111-1111-1111-111111111111"
TOKEN_A = "aaa.bbb.ccc"


@pytest.fixture
def sb() -> FakeSupabase:
    f = FakeSupabase()
    f.add_user(ALICE, "alice", TOKEN_A)
    return f


@pytest.fixture
def client(sb) -> TestClient:
    auth_module._cache = auth_module._TokenCache()
    online._guest_limiter = InMemoryRateLimiter(per_minute=1000)
    online._room_limiter = InMemoryRateLimiter(per_minute=1000)
    internal._replay = ReplayGuard()
    app = create_app(make_settings(supabase_url="https://example.supabase.co"), InMemoryRateLimiter(10_000), supabase=sb)
    return TestClient(app)


def bearer(t: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {t}"}


def guest(client: TestClient, name: str = "Visitor1") -> str:
    r = client.post("/api/auth/guest", json={"name": name})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def claims_of(token: str) -> dict:
    return jwt.decode(token, GS, algorithms=["HS256"], audience=REALTIME_AUDIENCE, issuer=ISSUER)


# ── Guest tokens ────────────────────────────────────────────────────────────


def test_guest_token_roundtrip():
    t = issue_guest_token(GT, "g_0123456789abcdef", "Bob")
    g = verify_guest_token(GT, t)
    assert g.guest_id == "g_0123456789abcdef" and g.name == "Bob"


@pytest.mark.parametrize(
    "forge",
    [
        lambda: issue_guest_token("another-secret-xxxxxxxxxxxxxxxx", "g_0123456789abcdef", "Bob"),
        lambda: issue_guest_token(GT, "g_0123456789abcdef", "Bob", now=time.time() - 13 * 3600),
        lambda: jwt.encode({"iss": ISSUER, "aud": GUEST_AUDIENCE, "sub": "g_0123456789abcdef", "typ": "guest",
                            "iat": int(time.time()), "exp": int(time.time()) + 60}, key=None, algorithm="none"),
        lambda: jwt.encode({"iss": ISSUER, "aud": REALTIME_AUDIENCE, "sub": "g_0123456789abcdef", "typ": "guest",
                            "iat": int(time.time()), "exp": int(time.time()) + 60}, GT, algorithm="HS256"),
        lambda: issue_guest_token(GT, "g_0123456789abcdef", "Bob")[:-4] + "AAAA",
    ],
    ids=["wrong-secret", "expired", "alg-none", "wrong-audience", "tampered"],
)
def test_forged_guest_tokens_rejected(forge):
    with pytest.raises(TokenError):
        verify_guest_token(GT, forge())


@pytest.mark.parametrize("name", ["a", "x" * 13, "<b>", "has space", ""])
def test_guest_name_validation(client, name):
    assert client.post("/api/auth/guest", json={"name": name}).status_code == 422


def test_guest_rate_limited(client):
    online._guest_limiter = InMemoryRateLimiter(per_minute=60, burst=2)
    codes = [client.post("/api/auth/guest", json={"name": "Visitor1"}).status_code for _ in range(4)]
    assert 429 in codes


# ── Rooms ───────────────────────────────────────────────────────────────────


def test_create_room_requires_identity(client):
    assert client.post("/api/rooms", json={"mode": "duel"}).status_code == 401


def test_create_and_join_private_room(client, sb):
    host = client.post("/api/rooms", headers=bearer(TOKEN_A), json={"mode": "duel", "stage": "frozen_fortress", "stocks": 2})
    assert host.status_code == 200, host.text
    body = host.json()
    code = body["code"]
    assert len(code) == 6 and body["max_players"] == 2 and body["stage"] == "frozen_fortress"
    c = claims_of(body["token"])
    assert c["sub"] == ALICE and c["kind"] == "user" and c["name"] == "alice" and c["room"] == code
    assert c["exp"] - c["iat"] <= 120

    g = guest(client)
    joined = client.post(f"/api/rooms/{code.lower()}/join", headers=bearer(g))
    assert joined.status_code == 200, joined.text
    gc = claims_of(joined.json()["token"])
    assert gc["kind"] == "guest" and gc["match"] == c["match"] and gc["jti"] != c["jti"]
    assert len(sb.tables["match_entries"]) == 2
    assert "avatar" not in c and "avatar" not in gc


def test_join_token_carries_uploaded_avatar_path(client, sb):
    path = f"{ALICE}/{'ab' * 16}.webp"
    sb.tables["profiles"][0]["avatar_path"] = path
    host = client.post("/api/rooms", headers=bearer(TOKEN_A), json={"mode": "duel", "stage": "frozen_fortress", "stocks": 2})
    assert claims_of(host.json()["token"])["avatar"] == path

    sb.tables["profiles"][0]["avatar_path"] = "../../evil.webp"  # never relayed if it isn't our storage shape
    host = client.post("/api/rooms", headers=bearer(TOKEN_A), json={"mode": "duel", "stage": "frozen_fortress", "stocks": 2})
    assert "avatar" not in claims_of(host.json()["token"])


def test_room_full_and_rejoin(client):
    code = client.post("/api/rooms", headers=bearer(TOKEN_A), json={"mode": "duel"}).json()["code"]
    g1 = guest(client, "Guest01")
    assert client.post(f"/api/rooms/{code}/join", headers=bearer(g1)).status_code == 200
    g2 = guest(client, "Guest02")
    r = client.post(f"/api/rooms/{code}/join", headers=bearer(g2))
    assert r.status_code == 409 and r.json()["error"] == "room_full"
    # a player already in the room can get a fresh token (reconnect)
    assert client.post(f"/api/rooms/{code}/join", headers=bearer(g1)).status_code == 200


@pytest.mark.parametrize("code", ["AAAAAA", "000000", "ABC", "../../x", "ABCDE%27"])
def test_bad_or_unknown_codes(client, code):
    assert client.post(f"/api/rooms/{code}/join", headers=bearer(TOKEN_A)).status_code in (404, 422)


def test_room_body_validation(client):
    for payload in ({"mode": "battle_royale"}, {"stocks": 99}, {"stage": "moon"}, {"mode": "duel", "admin": True}):
        assert client.post("/api/rooms", headers=bearer(TOKEN_A), json=payload).status_code == 422


# ── Matchmaking ─────────────────────────────────────────────────────────────


def test_matchmaking_pairs_two_players(client, sb):
    a = client.post("/api/matchmaking/tickets", headers=bearer(TOKEN_A), json={"queue": "1v1"}).json()
    assert a["status"] == "searching"
    g = guest(client)
    b = client.post("/api/matchmaking/tickets", headers=bearer(g), json={"queue": "1v1"}).json()
    assert b["status"] == "matched" and b["join"]["max_players"] == 2
    a2 = client.get(f"/api/matchmaking/tickets/{a['ticket_id']}", headers=bearer(TOKEN_A)).json()
    assert a2["status"] == "matched"
    assert claims_of(a2["join"]["token"])["match"] == claims_of(b["join"]["token"])["match"]


def test_cannot_read_someone_elses_ticket(client):
    a = client.post("/api/matchmaking/tickets", headers=bearer(TOKEN_A), json={"queue": "1v1"}).json()
    g = guest(client)
    assert client.get(f"/api/matchmaking/tickets/{a['ticket_id']}", headers=bearer(g)).status_code == 404


def test_cancel_ticket(client):
    a = client.post("/api/matchmaking/tickets", headers=bearer(TOKEN_A), json={"queue": "1v1"}).json()
    r = client.delete(f"/api/matchmaking/tickets/{a['ticket_id']}", headers=bearer(TOKEN_A))
    assert r.json()["status"] == "cancelled"


# ── Signed results from the game server ────────────────────────────────────

MATCH = "33333333-3333-3333-3333-333333333333"
RESULT = {
    "duration_ticks": 5400,
    "winner_team": 0,
    "participants": [
        {"slot": 0, "kind": "user", "id": ALICE, "name": "alice", "character_id": "knight", "team": 0,
         "placement": 1, "kos": 3, "deaths": 1, "damage_dealt": 320},
        {"slot": 1, "kind": "guest", "id": "g_0123456789abcdef", "name": "Visitor1", "character_id": "archer",
         "team": 1, "placement": 2, "kos": 1, "deaths": 3, "damage_dealt": 250},
    ],
}


def post_result(client, body: dict | bytes, secret: str = GS, ts: int | None = None, sig: str | None = None):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    t = str(ts if ts is not None else int(time.time()))
    s = sig if sig is not None else sign_body(secret, t, raw)
    return client.post(
        f"/api/internal/matches/{MATCH}/result",
        content=raw,
        headers={"Content-Type": "application/json", "X-Timestamp": t, "X-Signature": s},
    )


def test_result_recorded_with_valid_signature(client, sb):
    r = post_result(client, RESULT)
    assert r.status_code == 200, r.text
    fn, args = sb.rpc_calls[-1]
    assert fn == "record_match_result" and args["p_match"] == MATCH
    assert args["p_participants"][1]["guest_id"] == "g_0123456789abcdef"
    assert r.json() == {"status": "recorded", "rated": False, "ratings": []}


def test_result_returns_rating_changes_by_slot(client, sb):
    sb.record_outcome = {"rated": True, "ratings": [{"slot": 0, "before": 1000, "after": 1016, "user_id": ALICE}, {"slot": "x"}]}
    body = post_result(client, RESULT).json()
    assert body["rated"] is True
    assert body["ratings"] == [{"slot": 0, "before": 1000, "after": 1016}]  # malformed rows dropped, no ids


def test_client_cannot_post_result_without_secret(client, sb):
    raw = json.dumps({**RESULT, "winner_team": 1}).encode()
    assert client.post(f"/api/internal/matches/{MATCH}/result", content=raw).status_code == 401
    assert post_result(client, RESULT, secret="guessed-secret").status_code == 401
    assert post_result(client, RESULT, sig="0" * 64).status_code == 401
    assert sb.rpc_calls == []


def test_stale_and_replayed_results_rejected(client):
    assert post_result(client, RESULT, ts=int(time.time()) - 600).status_code == 401
    t = int(time.time())
    raw = json.dumps(RESULT).encode()
    sig = sign_body(GS, str(t), raw)
    assert post_result(client, raw, ts=t, sig=sig).status_code == 200
    assert post_result(client, raw, ts=t, sig=sig).status_code == 401  # replay


def test_duplicate_result_is_409(client):
    assert post_result(client, RESULT).status_code == 200
    time.sleep(0.01)
    assert post_result(client, {**RESULT, "duration_ticks": 5401}).status_code == 409


@pytest.mark.parametrize(
    "mutate",
    [
        lambda r: {**r, "participants": r["participants"][:1]},
        lambda r: {**r, "winner_team": 9},
        lambda r: {**r, "participants": [{**r["participants"][0], "kos": 500}, r["participants"][1]]},
        lambda r: {**r, "participants": [{**r["participants"][0], "id": "not-an-id"}, r["participants"][1]]},
        lambda r: {**r, "participants": [{**r["participants"][0], "character_id": "dragon"}, r["participants"][1]]},
        lambda r: {**r, "extra": 1},
    ],
)
def test_malformed_results_rejected(client, sb, mutate):
    assert post_result(client, mutate(RESULT)).status_code == 422
    assert sb.rpc_calls == []


def test_suspicious_flags_are_logged(client, sb):
    assert post_result(client, {**RESULT, "suspicious": ["input_flood:slot1"]}).status_code == 200
    assert sb.tables["security_events"][0]["type"] == "SUSPICIOUS_MATCH"
